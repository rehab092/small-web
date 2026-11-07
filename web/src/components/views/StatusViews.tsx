'use client';

import { useDelayedFlag } from '@/lib/delayed-flag';

/** Full-page states: Nowhere (no such address), load failure, loading. */

export function NowhereView({
  addr,
  onPublish,
  onSearch,
  onHome,
}: {
  addr: string;
  onPublish: (addr: string) => void;
  onSearch: (query: string) => void;
  onHome: () => void;
}) {
  return (
    <div className="page-scroll">
      <div className="page status" aria-live="polite">
        <svg className="status__art" viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r="46" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="4 6" />
          <circle cx="60" cy="60" r="28" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="2 6" opacity=".6" />
          <circle cx="60" cy="60" r="4" fill="currentColor" />
        </svg>
        <p className="eyebrow">Nowhere</p>
        <h1 tabIndex={-1}>There is nothing at this address</h1>
        <p>
          <span className="status__address">{addr}</span>
        </p>
        <p className="lede">
          Nothing has been published here, or the link that led here points to a page that never
          existed. The visit is still in your history.
        </p>
        <div className="form__actions">
          <button type="button" className="btn btn--primary" onClick={() => onSearch(addr)}>
            Search for “{addr}”
          </button>
          <button type="button" className="btn" onClick={() => onPublish(addr)}>
            Publish a site here
          </button>
          <button type="button" className="btn" onClick={onHome}>
            Go home
          </button>
        </div>
        <ul className="status__tips">
          <li>Check the spelling: addresses are a name followed by .zz.</li>
          <li>Pages can say they link to a place before anyone has built it.</li>
        </ul>
      </div>
    </div>
  );
}

export function ErrorView({
  addr,
  message,
  onRetry,
}: {
  addr: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="page-scroll">
      <div className="page status" role="alert">
        <p className="eyebrow">Could not load</p>
        <h1 tabIndex={-1}>{addr} did not load</h1>
        <p className="lede">{message}</p>
        <div className="form__actions">
          <button type="button" className="btn btn--primary" onClick={onRetry}>
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}

/** The skeleton waits 150ms, so a quick load never flashes it. */
export function LoadingView({ addr }: { addr: string }) {
  const showSkeleton = useDelayedFlag(true, 150, 0);
  return (
    <div className="page-scroll" aria-busy="true">
      <div className="page">
        <p className="eyebrow">Loading</p>
        <h1 className="mono dim">{addr}</h1>
        {showSkeleton ? <div className="skeleton-list" /> : <div className="skeleton-list skeleton-list--hold" />}
      </div>
    </div>
  );
}
