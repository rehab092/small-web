'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { groupVisitsByDay, timeLabel } from '@/lib/group-by-day';
import { useScrollMemory } from '@/lib/use-scroll-memory';
import type { VisitDto } from '@/lib/types';
import type { ViewCache } from '@/lib/use-browser';

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

/**
 * One person's history, newest first, grouped by day, loaded page by page as
 * the list is scrolled. Pages already loaded are kept per history entry, so
 * returning here shows the list as it was left, at the same scroll position.
 */
export function HistoryView({ entryId, person, personName, scroll, cache, onOpen, saveScroll }: Props) {
  const key = `history:${entryId}`;
  const [loaded, setLoaded] = useState<Loaded | null>((cache.get(key) as Loaded) ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);
  const loadedRef = useRef(loaded);
  loadedRef.current = loaded;
  useScrollMemory(scroller, scroll, saveScroll, loaded !== null);

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
  }, [hasMore, loadNext, loaded, error]);

  const groups = useMemo(() => groupVisitsByDay(loaded?.items ?? []), [loaded]);

  return (
    <div className="page-scroll" ref={scroller}>
      <div className="page history">
        <p className="eyebrow">History</p>
        <h1>
          Where {personName} has been
          {loaded && <span className="count">{loaded.items.length}{hasMore ? '+' : ''}</span>}
        </h1>

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

        {groups.map((group) => (
          <section key={group.key} className="day">
            <h2 className="day__title">{group.label}</h2>
            <ul className="visits">
              {group.items.map((v) => (
                <li key={v.id}>
                  <button type="button" className="visit" onClick={() => onOpen(v.address)}>
                    <time className="visit__time" dateTime={v.at}>
                      {timeLabel(v.at)}
                    </time>
                    <span className="visit__main">
                      <span className="visit__title">
                        {v.found ? (v.title ?? v.address) : 'Nowhere'}
                      </span>
                      <span className="visit__address">{v.address}</span>
                    </span>
                    {!v.found && <span className="badge badge--alert">not found</span>}
                    <span className="badge">{v.via}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <div ref={sentinel} className="sentinel" aria-hidden="true" />
        {loaded && loading && <p className="muted center">Loading more…</p>}
        {loaded && !hasMore && loaded.items.length > 0 && (
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
