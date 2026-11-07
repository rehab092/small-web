'use client';

import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { searchAddr } from '@/lib/address';
import { useScrollMemory } from '@/lib/use-scroll-memory';
import type { SiteSummaryDto } from '@/lib/types';
import type { ViewCache } from '@/lib/use-browser';

interface Props {
  entryId: string;
  scroll: number;
  cache: ViewCache;
  onOpen: (address: string) => void;
  onGo: (addr: string) => void;
  saveScroll: (y: number) => void;
}

interface Listing {
  total: number;
  items: SiteSummaryDto[];
}

export function HomeView({ entryId, scroll, cache, onOpen, onGo, saveScroll }: Props) {
  const key = `home:${entryId}`;
  const [listing, setListing] = useState<Listing | null>((cache.get(key) as Listing) ?? null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const scroller = useRef<HTMLDivElement>(null);
  useScrollMemory(scroller, scroll, saveScroll, listing !== null);

  useEffect(() => {
    if (listing) return;
    const ctrl = new AbortController();
    api
      .listSites(100, 0, ctrl.signal)
      .then((res) => {
        cache.set(key, res);
        setListing(res);
      })
      .catch((err: unknown) => {
        if ((err as Error).name === 'AbortError') return;
        setError(err instanceof ApiError ? err.message : 'Could not load the directory.');
      });
    return () => ctrl.abort();
  }, [cache, key, listing]);

  return (
    <div className="page-scroll" ref={scroller}>
      <div className="page home">
        <p className="eyebrow">The Small Web</p>
        <h1 tabIndex={-1}>A few hundred one-page sites, written by strangers.</h1>
        <p className="lede">
          Type an address like <code>tidepool.zz</code> in the bar above, follow links from page to
          page, or search for something somebody wrote.
        </p>

        <form
          className="searchbox"
          onSubmit={(e) => {
            e.preventDefault();
            if (query.trim()) onGo(searchAddr(query.trim()));
          }}
        >
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search every page by what is written in it"
            aria-label="Search the Small Web"
          />
          <button type="submit" className="btn btn--primary">
            Search
          </button>
        </form>

        <h2 className="section-title">
          Directory {listing && <span className="count">{listing.total}</span>}
        </h2>
        {error && <p className="field-error">{error}</p>}
        {!listing && !error && <div className="skeleton-list" aria-busy="true" />}
        {listing && listing.items.length === 0 && (
          <p className="muted">Nothing is published yet. Be the first from the Publish page.</p>
        )}
        <ul className="cards">
          {listing?.items.map((site) => (
            <li key={site.address}>
              <button type="button" className="card" onClick={() => onOpen(site.address)}>
                <span className="card__title">{site.title}</span>
                <span className="card__address">{site.address}</span>
                <span className="card__meta">by {site.author.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
