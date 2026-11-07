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

/** The server's answer to a filter: matches across the WHOLE history, paged by cursor. */
interface Remote extends Loaded {
  q: string;
}

const FILTER_DELAY_MS = 300;

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

/** `value`, but only once it has stopped changing for `ms` (immediately when cleared). */
function useDebounced(value: string, ms: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    if (value === '') {
      setDebounced('');
      return;
    }
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/**
 * One person's history, newest first, grouped by day, loaded page by page as
 * the list is scrolled. Pages already loaded are kept per history entry, so
 * returning here shows the list as it was left, at the same scroll position.
 *
 * The filter matches across the whole history, not just the rows loaded so far:
 * once typing pauses it is sent to the server (GET /people/:id/visits?q=) and the
 * answer is paged the same way. Until the answer arrives, the loaded rows are
 * filtered instantly on the client, so typing never feels stalled.
 */
export function HistoryView({ entryId, person, personName, scroll, cache, onOpen, saveScroll }: Props) {
  const key = `history:${entryId}`;
  const filterKey = `history-filter:${entryId}`;
  const remoteKey = `history-remote:${entryId}`;
  const [loaded, setLoaded] = useState<Loaded | null>((cache.get(key) as Loaded) ?? null);
  const [filter, setFilterState] = useState<string>((cache.get(filterKey) as string) ?? '');
  const [remote, setRemote] = useState<Remote | null>((cache.get(remoteKey) as Remote) ?? null);
  const [remoteStatus, setRemoteStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);
  const loadedRef = useRef(loaded);
  loadedRef.current = loaded;
  const remoteRef = useRef(remote);
  remoteRef.current = remote;
  const now = useMinuteClock();
  useScrollMemory(scroller, scroll, saveScroll, loaded !== null);

  const trimmed = filter.trim();
  const debounced = useDebounced(trimmed, FILTER_DELAY_MS);

  const setFilter = (value: string) => {
    setFilterState(value);
    cache.set(filterKey, value);
  };

  // --- the unfiltered history, paged ---------------------------------------
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

  // --- the filtered history, asked of the server ----------------------------
  useEffect(() => {
    if (!debounced) {
      setRemote(null);
      cache.delete(remoteKey);
      setRemoteStatus('idle');
      return;
    }
    const cached = remoteRef.current;
    if (cached && cached.q === debounced) {
      setRemoteStatus('idle'); // restored from this entry's cache (Back)
      return;
    }
    const ctrl = new AbortController();
    setRemoteStatus('loading');
    api
      .visits(person, null, ctrl.signal, 50, debounced)
      .then((page) => {
        const next: Remote = { q: debounced, items: page.items, nextCursor: page.nextCursor };
        cache.set(remoteKey, next);
        setRemote(next);
        setRemoteStatus('idle');
      })
      .catch((err: unknown) => {
        if ((err as Error).name === 'AbortError') return;
        setRemote(null);
        setRemoteStatus('error');
      });
    return () => ctrl.abort();
  }, [debounced, person, cache, remoteKey]);

  /** Next page of the matches (never the unfiltered list). */
  const loadNextRemote = useCallback(() => {
    const current = remoteRef.current;
    if (!current || current.nextCursor === null || inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    api
      .visits(person, current.nextCursor, undefined, 50, current.q)
      .then((page) => {
        if (remoteRef.current?.q !== current.q) return; // the filter changed meanwhile
        const next: Remote = { q: current.q, items: [...current.items, ...page.items], nextCursor: page.nextCursor };
        cache.set(remoteKey, next);
        remoteRef.current = next;
        setRemote(next);
      })
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : 'Could not load more matches.'))
      .finally(() => {
        inFlight.current = false;
        setLoading(false);
      });
  }, [cache, person, remoteKey]);

  // --- what is shown ----------------------------------------------------------
  const filtering = trimmed !== '';
  const remoteReady = filtering && remote !== null && remote.q === trimmed;
  const clientOverlay = useMemo(() => filterVisits(loaded?.items ?? [], filter), [loaded, filter]);
  const shown = !filtering ? (loaded?.items ?? []) : remoteReady ? remote.items : clientOverlay;
  const hasMore = !filtering
    ? loaded !== null && loaded.nextCursor !== null
    : remoteReady && remote.nextCursor !== null;
  const loadMore = filtering ? loadNextRemote : loadNext;

  // infinite scroll: fetch the next page when the sentinel nears the viewport
  useEffect(() => {
    const node = sentinel.current;
    const root = scroller.current;
    if (!node || !root || !hasMore || error) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
      },
      { root, rootMargin: '300px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loadMore, shown, error]);

  const groups = useMemo(() => groupVisitsByDay(shown, now), [shown, now]);

  let note = '';
  if (filtering) {
    if (remoteReady) {
      note = `${remote.items.length}${hasMore ? '+' : ''} ${remote.items.length === 1 ? 'visit matches' : 'visits match'} across the whole history`;
    } else if (remoteStatus === 'error') {
      note = `The whole history could not be searched; showing matches among the ${loaded?.items.length ?? 0} loaded visits`;
    } else {
      note = 'Searching the whole history…';
    }
  }
  const nothingMatches =
    filtering &&
    shown.length === 0 &&
    ((remoteReady && !hasMore) || (remoteStatus === 'error' && !(loaded && loaded.nextCursor !== null)));

  return (
    <div className="page-scroll" ref={scroller}>
      <div className="page history">
        <p className="eyebrow">History</p>
        <h1 tabIndex={-1}>
          Where {personName} has been
          {loaded && <span className="count">{loaded.items.length}{loaded.nextCursor !== null ? '+' : ''}</span>}
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
          {note}
        </p>

        {error && (
          <p className="field-error">
            {error}{' '}
            <button type="button" className="link-btn" onClick={() => loadMore()}>
              Retry
            </button>
          </p>
        )}
        {!loaded && loading && <div className="skeleton-list" aria-busy="true" />}
        {loaded && loaded.items.length === 0 && (
          <p className="muted">Nothing here yet. Pages you visit will show up in this list.</p>
        )}
        {nothingMatches && (
          <div className="empty">
            <h2>No visits match</h2>
            <p>Nothing in this history contains “{trimmed}”. Try another word.</p>
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
        {loading && (loaded || remoteReady) && <p className="muted center">Loading more…</p>}
        {!filtering && loaded && loaded.nextCursor === null && loaded.items.length > 0 && (
          <p className="muted center">That is the beginning.</p>
        )}
        {filtering && remoteReady && !hasMore && shown.length > 0 && (
          <p className="muted center">That is every match.</p>
        )}
        {hasMore && !loading && (
          <button type="button" className="btn center-btn" onClick={() => loadMore()}>
            Load more
          </button>
        )}
      </div>
    </div>
  );
}
