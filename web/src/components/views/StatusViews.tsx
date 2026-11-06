'use client';

/** Full-page states: Nowhere (no such address), load failure, loading. */

export function NowhereView({
  addr,
  onPublish,
  onHome,
}: {
  addr: string;
  onPublish: (addr: string) => void;
  onHome: () => void;
}) {
  return (
    <div className="page-scroll">
      <div className="page status">
        <svg className="status__art" viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r="46" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="4 6" />
          <circle cx="60" cy="60" r="28" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="2 6" opacity=".6" />
          <circle cx="60" cy="60" r="4" fill="currentColor" />
        </svg>
        <p className="eyebrow">Nowhere</p>
        <h1>There is nothing at this address</h1>
        <p className="lede">
          <span className="mono">{addr}</span> has never been published, or the link that led here
          points to a page that never existed. It is still in your history.
        </p>
        <div className="form__actions">
          <button type="button" className="btn btn--primary" onClick={() => onPublish(addr)}>
            Publish a site here
          </button>
          <button type="button" className="btn" onClick={onHome}>
            Go home
          </button>
        </div>
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
      <div className="page status">
        <p className="eyebrow">Could not load</p>
        <h1>{addr} did not load</h1>
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

export function LoadingView({ addr }: { addr: string }) {
  return (
    <div className="page-scroll" aria-busy="true">
      <div className="page">
        <p className="eyebrow">Loading</p>
        <h1 className="mono dim">{addr}</h1>
        <div className="skeleton-list" />
      </div>
    </div>
  );
}
