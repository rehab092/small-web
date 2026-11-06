'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { groupVisitsByDay, timeLabel } from '@/lib/group-by-day';
import { highlightTerms } from '@/lib/highlight';
import { relativeTime } from '@/lib/relative-time';
import { useScrollMemory } from '@/lib/use-scroll-memory';
import { filterVisits } from '@/lib/visit-filter';
import type { VisitDto } from '@/lib/types';
import type { ViewCache } from '@/lib/use-browser';
import { SearchIcon } from '../icons';

interface Props {
  entryId: string;
  person: string;
  personName: string;
  scroll: number;
  cache: ViewCache;
  /** Jump to a visit (recorded as arriving via history). */
  onOpen: (address: string) => void;
  saveScroll: (y: number) => void;
}

interface Loaded {
  items: VisitDto[];
  nextCursor: string | null;
}

/** Text with the parts matching `query` marked, as plain nodes. */
function Marked({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlightTerms(text, query).map((seg, i) =>
        seg.match ? <mark key={i}>{seg.text}</mark> : <span key={i}>{seg.text}</span>,
      )}
    </>
  );
}

/** Re-renders once a minute so "3 min ago" stays true while the page is open. */
function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/**
 * One person's history, newest first, grouped by day, loaded page by page as
 * the list is scrolled. Pages already loaded are kept per history entry, so
 * returning here shows the list as it was left, at the same scroll position.
 * The filter works on what is loaded; while it is active the list keeps loading
 * further pages as you reach the end, so a match deeper in the history is found.
 */
export function HistoryView({ entryId, person, personName, scroll, cache, onOpen, saveScroll }: Props) {
  const key = `history:${entryId}`;
  const filterKey = `history-filter:${entryId}`;
  const [loaded, setLoaded] = useState<Loaded | null>((cache.get(key) as Loaded) ?? null);
  const [filter, setFilterState] = useState<string>((cache.get(filterKey) as string) ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);
  const loadedRef = useRef(loaded);
  loadedRef.current = loaded;
  const now = useMinuteClock();
  useScrollMemory(scroller, scroll, saveScroll, loaded !== null);

  const setFilter = (value: string) => {
    setFilterState(value);
    cache.set(filterKey, value);
  };

  const loadNext = useCallback(
    (signal?: AbortSignal) => {
      const current = loadedRef.current;
      if (inFlight.current || (current && current.nextCursor === null)) return;
      inFlight.current = true;
      setLoading(true);
      setError(null);
      api
        .visits(person, current?.nextCursor ?? null, signal)
        .then((page) => {
          const next: Loaded = {
            items: [...(current?.items ?? []), ...page.items],
            nextCursor: page.nextCursor,
          };
          cache.set(key, next);
          loadedRef.current = next;
          setLoaded(next);
        })
        .catch((err: unknown) => {
          if ((err as Error).name === 'AbortError') return;
          setError(err instanceof ApiError ? err.message : 'Could not load history.');
        })
        .finally(() => {
          inFlight.current = false;
          setLoading(false);
        });
    },
    [cache, key, person],
  );

  // Not aborted on cleanup: under React strict mode the effect runs twice and the
  // in-flight guard would swallow the second run, leaving the list empty.
  useEffect(() => {
    if (!loadedRef.current) loadNext();
  }, [loadNext]);

  // infinite scroll: fetch the next page when the sentinel nears the viewport
  const hasMore = loaded ? loaded.nextCursor !== null : false;
  useEffect(() => {
    const node = sentinel.current;
    const root = scroller.current;
    if (!node || !root || !hasMore || error) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadNext();
      },
      { root, rootMargin: '300px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loadNext, loaded, error, filter]);

  const shown = useMemo(() => filterVisits(loaded?.items ?? [], filter), [loaded, filter]);
  const groups = useMemo(() => groupVisitsByDay(shown, now), [shown, now]);
  const filtering = filter.trim() !== '';

  return (
    <div className="page-scroll" ref={scroller}>
      <div className="page history">
        <p className="eyebrow">History</p>
        <h1>
          Where {personName} has been
          {loaded && <span className="count">{loaded.items.length}{hasMore ? '+' : ''}</span>}
        </h1>

        <div className="history__filter" role="search">
          <SearchIcon />
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && filter) {
                e.preventDefault();
                setFilter('');
              }
            }}
            placeholder="Filter by title or address"
            aria-label="Filter history"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <p className="history__filter-note" aria-live="polite">
          {filtering && loaded
            ? `${shown.length} of ${loaded.items.length} loaded ${loaded.items.length === 1 ? 'visit' : 'visits'} match${hasMore ? '; more load as you reach the end' : ''}`
            : ''}
        </p>

        {error && (
          <p className="field-error">
            {error}{' '}
            <button type="button" className="link-btn" onClick={() => loadNext()}>
              Retry
            </button>
          </p>
        )}
        {!loaded && loading && <div className="skeleton-list" aria-busy="true" />}
        {loaded && loaded.items.length === 0 && (
          <p className="muted">Nothing here yet. Pages you visit will show up in this list.</p>
        )}
        {filtering && loaded && loaded.items.length > 0 && shown.length === 0 && !hasMore && (
          <div className="empty">
            <h2>No visits match</h2>
            <p>Nothing in this history contains “{filter.trim()}”. Try another word.</p>
            <button type="button" className="btn" onClick={() => setFilter('')}>
              Clear the filter
            </button>
          </div>
        )}

        {groups.map((group) => (
          <section key={group.key} className="day" aria-label={group.label}>
            <h2 className="day__title">{group.label}</h2>
            <ul className="visits">
              {group.items.map((v) => {
                const relative = relativeTime(v.at, now);
                return (
                  <li key={v.id}>
                    <button type="button" className="visit" onClick={() => onOpen(v.address)}>
                      <time className="visit__time" dateTime={v.at}>
                        <span>{timeLabel(v.at)}</span>
                        {relative && <span className="visit__rel">{relative}</span>}
                      </time>
                      <span className="visit__main">
                        <span className="visit__title">
                          {v.found ? <Marked text={v.title ?? v.address} query={filter} /> : 'Nowhere'}
                        </span>
                        <span className="visit__address">
                          <Marked text={v.address} query={filter} />
                        </span>
                      </span>
                      {!v.found && <span className="badge badge--alert">not found</span>}
                      <span className={`badge badge--${v.via}`}>{v.via}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        <div ref={sentinel} className="sentinel" aria-hidden="true" />
        {loaded && loading && <p className="muted center">Loading more…</p>}
        {loaded && !hasMore && loaded.items.length > 0 && !(filtering && shown.length === 0) && (
          <p className="muted center">That is the beginning.</p>
        )}
        {hasMore && !loading && (
          <button type="button" className="btn center-btn" onClick={() => loadNext()}>
            Load more
          </button>
        )}
      </div>
    </div>
  );
}
