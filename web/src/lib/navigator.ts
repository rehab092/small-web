/**
 * Navigator: decides when a navigation becomes a history entry.
 *
 * A real browser only adds an entry once the new page has actually arrived. A
 * navigation that is superseded (a second click in the same tick), cancelled
 * (Back, Forward, a person switch) or that never finishes leaves nothing
 * behind: no stack entry, no browser entry, no visit.
 *
 *  - an internal page (about:…) is available immediately, so it commits at once;
 *  - a site address is loaded first, held as *pending* (the page on screen stays
 *    put and the address bar shows a loading state), and only when the answer
 *    is in is the entry pushed, with the result handed to `onCommit` so it is
 *    shown without a second request;
 *  - starting any navigation, or any traversal, cancels the one in flight.
 *
 * Framework-free: the session and the loader are injected.
 */

import { isInternalAddr } from './address';
import { current } from './history-stack';
import type { BrowserSession, Snapshot } from './session';
import type { SiteDto, Via } from './types';

export type PageResult =
  | { kind: 'site'; site: SiteDto }
  | { kind: 'nowhere' }
  | { kind: 'error'; message: string };

export interface NavigatorDeps {
  session: Pick<BrowserSession, 'navigate' | 'activeStack'>;
  /** The site at `addr`, or null when nothing is published there. Rejects on failure. */
  loadSite: (addr: string, signal: AbortSignal) => Promise<SiteDto | null>;
  /** The address being loaded, or null when nothing is pending. */
  onPending: (addr: string | null) => void;
  /** An entry was added (or the page reloaded); `result` is set for loaded sites. */
  onCommit: (snapshot: Snapshot, result: PageResult | null) => void;
}

export class Navigator {
  private inFlight: { addr: string; ctrl: AbortController } | null = null;

  constructor(private readonly deps: NavigatorDeps) {}

  get pendingAddress(): string | null {
    return this.inFlight?.addr ?? null;
  }

  /** Start navigating to `addr`, superseding whatever was in flight. */
  go(addr: string, via: Via): void {
    this.cancel();
    const here = current(this.deps.session.activeStack);
    if (!here) return;

    if (isInternalAddr(addr) || here.addr === addr) {
      // nothing to wait for (or a reload of the page already shown)
      const snapshot = this.deps.session.navigate(addr, via);
      if (snapshot) this.deps.onCommit(snapshot, null);
      return;
    }

    const flight = { addr, ctrl: new AbortController() };
    this.inFlight = flight;
    this.deps.onPending(addr);
    this.deps
      .loadSite(addr, flight.ctrl.signal)
      .then((site) => this.commit(flight, addr, via, site ? { kind: 'site', site } : { kind: 'nowhere' }))
      .catch((err: unknown) => {
        if (flight.ctrl.signal.aborted) return;
        const message = err instanceof Error && err.message ? err.message : 'Something went wrong loading this page.';
        this.commit(flight, addr, via, { kind: 'error', message });
      });
  }

  /** Abandon the navigation in flight, if any. Nothing is left in any history. */
  cancel(): void {
    const flight = this.inFlight;
    if (!flight) return;
    this.inFlight = null;
    flight.ctrl.abort();
    this.deps.onPending(null);
  }

  private commit(flight: { ctrl: AbortController }, addr: string, via: Via, result: PageResult): void {
    if (flight.ctrl.signal.aborted || this.inFlight !== flight) return; // superseded or cancelled
    this.inFlight = null;
    this.deps.onPending(null);
    const snapshot = this.deps.session.navigate(addr, via);
    if (snapshot) this.deps.onCommit(snapshot, result);
  }
}
