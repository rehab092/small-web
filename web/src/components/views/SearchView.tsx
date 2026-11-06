'use client';

import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { highlightTerms } from '@/lib/highlight';
import { isEditable } from '@/lib/shortcuts';
import { useScrollMemory } from '@/lib/use-scroll-memory';
import type { SearchResultDto } from '@/lib/types';
import type { ViewCache } from '@/lib/use-browser';

interface Props {
  entryId: string;
  query: string;
  scroll: number;
  cache: ViewCache;
  /** Run a new search (becomes its own history entry). */
  onSearch: (query: string) => void;
  /** Open a result (recorded as arriving via search). */
  onOpen: (address: string) => void;
  /** Go to the home directory. */
  onHome: () => void;
  saveScroll: (y: number) => void;
}

interface Loaded {
  total: number;
  results: SearchResultDto[];
}

const PAGE = 20;
const SUGGESTIONS = ['tide', 'sourdough', 'trains', 'moths', 'maps', 'salt'];

function Marked({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlightTerms(text, query).map((seg, i) =>
        seg.match ? <mark key={i}>{seg.text}</mark> : <span key={i}>{seg.text}</span>,
      )}
    </>
  );
}

/**
 * Search results. What was found is cached per history entry, so going back
 * from a result shows the same results at the same scroll position even if the
 * web changed in between. Press / anywhere on the page (outside a field) to
 * start typing a search.
 */
export function SearchView({ entryId, query, scroll, cache, onSearch, onOpen, onHome, saveScroll }: Props) {
  const key = `search:${entryId}`;
  const [loaded, setLoaded] = useState<Loaded | null>((cache.get(key) as Loaded) ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState(query);
  const [focused, setFocused] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const trimmed = query.trim();
  useScrollMemory(scroller, scroll, saveScroll, loaded !== null || trimmed === '');

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isEditable(event.target as HTMLElement | null)) return; // typing a slash is just typing
      event.preventDefault();
      input.current?.focus();
      input.current?.select();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!trimmed || loaded) return;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    api
      .search(trimmed, ctrl.signal, PAGE, 0)
      .then((res) => {
        const next = { total: res.total, results: res.results };
        cache.set(key, next);
        setLoaded(next);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if ((err as Error).name === 'AbortError') return;
        setError(err instanceof ApiError ? err.message : 'Search failed.');
        setLoading(false);
      });
    return () => ctrl.abort();
  }, [cache, key, loaded, trimmed]);

  const showMore = () => {
    if (!loaded || loading) return;
    setLoading(true);
    api
      .search(trimmed, undefined, PAGE, loaded.results.length)
      .then((res) => {
        const next = { total: res.total, results: [...loaded.results, ...res.results] };
        cache.set(key, next);
        setLoaded(next);
      })
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : 'Search failed.'))
      .finally(() => setLoading(false));
  };

  const words = trimmed.split(/\s+/).filter(Boolean);

  return (
    <div className="page-scroll" ref={scroller}>
      <div className="page search">
        <form
          className="searchbox"
          onSubmit={(e) => {
            e.preventDefault();
            onSearch(draft.trim());
          }}
        >
          <input
            ref={input}
            type="search"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Search every page by what is written in it"
            aria-label="Search query"
            aria-keyshortcuts="/"
            autoFocus={!trimmed}
          />
          {!focused && draft === '' && (
            <kbd className="searchbox__hint" aria-hidden="true">
              /
            </kbd>
          )}
          <button type="submit" className="btn btn--primary">
            Search
          </button>
        </form>

        {!trimmed && (
          <div className="empty">
            <h2>Search the whole web</h2>
            <p>
              Search looks inside every page, not only titles. Press <kbd>/</kbd> from anywhere to start.
            </p>
            <div className="chips" aria-label="Suggested searches">
              {SUGGESTIONS.map((word) => (
                <button key={word} type="button" className="chip" onClick={() => onSearch(word)}>
                  {word}
                </button>
              ))}
            </div>
          </div>
        )}
        {error && <p className="field-error">{error}</p>}
        {loading && !loaded && <div className="skeleton-list" aria-busy="true" />}

        {loaded && (
          <>
            <p className="result-count" role="status">
              {loaded.total === 0
                ? `No pages match “${trimmed}”.`
                : `${loaded.total} ${loaded.total === 1 ? 'page' : 'pages'} for “${trimmed}”`}
            </p>

            {loaded.total === 0 && (
              <div className="empty">
                <h2>Nothing found</h2>
                <p>
                  {words.length > 1
                    ? 'Try fewer words, or one of these on its own.'
                    : 'Try a shorter or different word, or browse everything that is published.'}
                </p>
                <div className="chips" aria-label="Suggested searches">
                  {(words.length > 1 ? words.slice(0, 4) : SUGGESTIONS.slice(0, 4)).map((word) => (
                    <button key={word} type="button" className="chip" onClick={() => onSearch(word)}>
                      {word}
                    </button>
                  ))}
                </div>
                <button type="button" className="btn" onClick={onHome}>
                  Browse the directory
                </button>
              </div>
            )}

            <ol className="results">
              {loaded.results.map((r) => (
                <li key={r.address} className="result">
                  <button type="button" className="result__link" onClick={() => onOpen(r.address)}>
                    <span className="result__address">
                      <Marked text={r.address} query={trimmed} />
                    </span>
                    <span className="result__title">
                      <Marked text={r.title} query={trimmed} />
                    </span>
                  </button>
                  <p className="result__snippet">
                    {r.snippet.map((seg, i) =>
                      seg.match ? <mark key={i}>{seg.text}</mark> : <span key={i}>{seg.text}</span>,
                    )}
                  </p>
                  <p className="result__meta">by {r.author.name}</p>
                </li>
              ))}
            </ol>
            {loaded.results.length < loaded.total && (
              <button type="button" className="btn" onClick={showMore} disabled={loading}>
                {loading ? 'Loading…' : 'Show more'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
