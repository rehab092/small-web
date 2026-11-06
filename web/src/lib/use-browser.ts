'use client';

/**
 * React binding for the browser: loads people, owns the BrowserSession, loads
 * whatever the current stack entry points at and records the visit once the
 * page has actually been shown.
 *
 * Rules this hook enforces:
 *  - a visit is recorded per *arrival* (typed, link, search, history, back,
 *    forward), after the page (or Nowhere) is shown; reloads and restores of
 *    the same entry are never arrivals;
 *  - every visit POST carries a requestId that is stable for that arrival, so
 *    React strict-mode replays and retries cannot write double history;
 *  - pages already seen in this tab are served from a per-entry cache, so
 *    going back shows exactly the page that was left (and quickly);
 *  - a navigation to a site is held as *pending* (see navigator.ts) and only
 *    becomes a history entry once its page has arrived; a newer navigation, Back,
 *    Forward or a person switch cancels it, so aborted navigations leave no entry
 *    and no visit, and rapid clicking ends on the last page shown.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from './api';
import {
  HOME_ADDR,
  isInternalAddr,
  parseSearchAddr,
  resolveTyped,
  searchAddr,
} from './address';
import {
  BrowserSession,
  WebStackStore,
  parseLocation,
  type Snapshot,
} from './session';
import { Navigator, type PageResult } from './navigator';
import { canBack, canForward } from './history-stack';
import type { PersonDto, SiteDto, Via } from './types';

/** What the tab has already learned about a site entry's page. */
type CachedPage = SiteDto | 'nowhere' | { error: string };

function pageFromCache(cached: CachedPage, addr: string): PageState {
  if (cached === 'nowhere') return { kind: 'nowhere', addr };
  if ('error' in cached) return { kind: 'error', addr, message: cached.error };
  return { kind: 'site', site: cached };
}

function cacheFromResult(result: PageResult): CachedPage {
  if (result.kind === 'site') return result.site;
  if (result.kind === 'nowhere') return 'nowhere';
  return { error: result.message };
}

export type PageState =
  | { kind: 'internal'; addr: string }
  | { kind: 'loading'; addr: string }
  | { kind: 'site'; site: SiteDto }
  | { kind: 'nowhere'; addr: string }
  | { kind: 'error'; addr: string; message: string };

export interface Notice {
  id: number;
  tone: 'info' | 'warn';
  text: string;
}

/** Per-entry memory for views (search results, history pages, publish drafts). */
export type ViewCache = Map<string, unknown>;

const PERSON_KEY = 'sw:person';

function pickDefaultPerson(people: PersonDto[], fromUrl: string | null): string {
  const ids = new Set(people.map((p) => p.id));
  if (fromUrl && ids.has(fromUrl)) return fromUrl;
  try {
    const saved = localStorage.getItem(PERSON_KEY);
    if (saved && ids.has(saved)) return saved;
  } catch {
    /* storage unavailable */
  }
  return people.find((p) => p.roles.includes('browser'))?.id ?? people[0]?.id ?? '';
}

/** What the address bar shows for a stack address. */
export function displayAddress(addr: string): string {
  if (addr === HOME_ADDR) return '';
  const query = parseSearchAddr(addr);
  return query !== null ? query : addr;
}

export function useBrowser() {
  const [people, setPeople] = useState<PersonDto[]>([]);
  const [bootError, setBootError] = useState<string | null>(null);
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [navigator, setNavigator] = useState<Navigator | null>(null);
  const [pendingAddr, setPendingAddr] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [shown, setShown] = useState<{ seq: number; page: PageState } | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const siteCache = useRef(new Map<string, CachedPage>());
  const viewCache = useRef<ViewCache>(new Map());
  const requestIds = useRef(new Map<number, string>());
  const noticeSeq = useRef(0);
  const started = useRef(false);

  const say = useCallback((text: string, tone: Notice['tone'] = 'info') => {
    setNotice({ id: ++noticeSeq.current, tone, text });
  }, []);

  // 1. people, then the session (once).
  useEffect(() => {
    const ctrl = new AbortController();
    api
      .people(ctrl.signal)
      .then((list) => {
        if (started.current) return;
        started.current = true;
        setPeople(list);
        const loc = parseLocation(window.location.search);
        const next = new BrowserSession({
          history: window.history,
          store: new WebStackStore(window.sessionStorage),
          newId: () => crypto.randomUUID(),
        });
        const nav = new Navigator({
          session: next,
          loadSite: (addr, signal) => api.site(addr, signal),
          onPending: setPendingAddr,
          // a site that arrived is shown from here, without a second request
          onCommit: (snap, result) => {
            if (result) siteCache.current.set(snap.entry.id, cacheFromResult(result));
          },
        });
        next.subscribe((snap) => {
          // every snapshot except a navigation we just committed abandons a pending load
          if (snap.cause !== 'navigate') nav.cancel();
          setSnapshot(snap);
        });
        next.start(loc, pickDefaultPerson(list, loc.person));
        setNavigator(nav);
        setSession(next);
      })
      .catch((err: unknown) => {
        if ((err as Error).name === 'AbortError') return;
        setBootError(err instanceof ApiError ? err.message : 'Could not start the browser.');
      });
    return () => ctrl.abort();
  }, []);

  // 2. the browser's own Back/Forward buttons.
  useEffect(() => {
    if (!session) return;
    const onPop = (event: PopStateEvent) => {
      session.onPopState(event.state, parseLocation(window.location.search));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [session]);

  // 3. show what the current entry points at; record the arrival.
  const person = snapshot?.person ?? '';
  const seq = snapshot?.seq ?? 0;
  useEffect(() => {
    if (!snapshot) return;
    const { entry, arrival, cause, person: who } = snapshot;
    const show = (next: PageState) => setShown({ seq: snapshot.seq, page: next });

    const record = (address: string) => {
      if (!arrival) return;
      let requestId = requestIds.current.get(snapshot.seq);
      if (!requestId) {
        requestId = crypto.randomUUID();
        requestIds.current.set(snapshot.seq, requestId);
      }
      api.recordVisit(who, address, arrival, requestId).catch((err: unknown) => {
        console.warn('could not record visit', err);
      });
    };

    if (isInternalAddr(entry.addr)) {
      show({ kind: 'internal', addr: entry.addr });
      return;
    }

    if (cause === 'reload') siteCache.current.delete(entry.id);
    const cached = siteCache.current.get(entry.id);
    if (cached) {
      show(pageFromCache(cached, entry.addr));
      if (typeof cached === 'string' || !('error' in cached)) record(entry.addr);
      return;
    }

    const ctrl = new AbortController();
    show({ kind: 'loading', addr: entry.addr });
    api
      .site(entry.addr, ctrl.signal)
      .then((site) => {
        siteCache.current.set(entry.id, site ?? 'nowhere');
        show(site ? { kind: 'site', site } : { kind: 'nowhere', addr: entry.addr });
        record(entry.addr);
      })
      .catch((err: unknown) => {
        if ((err as Error).name === 'AbortError') return;
        show({
          kind: 'error',
          addr: entry.addr,
          message: err instanceof ApiError ? err.message : 'Something went wrong loading this page.',
        });
      });
    return () => ctrl.abort();
    // `seq` identifies the snapshot; the snapshot object itself changes on scroll saves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq]);

  // The page for the snapshot being shown. Derived synchronously, so a page never
  // renders under another entry's id (a stale frame could overwrite its scroll).
  const page = useMemo<PageState>(() => {
    if (!snapshot) return { kind: 'internal', addr: HOME_ADDR };
    if (shown && shown.seq === snapshot.seq) return shown.page;
    const { entry, cause } = snapshot;
    if (isInternalAddr(entry.addr)) return { kind: 'internal', addr: entry.addr };
    const cached = siteCache.current.get(entry.id);
    if (cached && cause !== 'reload') return pageFromCache(cached, entry.addr);
    return { kind: 'loading', addr: entry.addr };
  }, [shown, snapshot]);

  // 4. tab title.
  useEffect(() => {
    if (page.kind === 'site') document.title = `${page.site.title} · Small Web`;
    else if (page.kind === 'nowhere') document.title = 'Nowhere · Small Web';
    else if (page.kind === 'internal') document.title = 'Small Web';
  }, [page]);

  const go = useCallback(
    (addr: string, via: Via) => {
      navigator?.go(addr, via);
    },
    [navigator],
  );

  /** Address-bar input: an address, a search, or something outside the Small Web. */
  const open = useCallback(
    (input: string): boolean => {
      const resolved = resolveTyped(input);
      if (!resolved) return false;
      if (resolved.kind === 'address') {
        navigator?.go(resolved.addr, 'typed');
        return true;
      }
      if (resolved.kind === 'search') {
        navigator?.go(searchAddr(resolved.query), 'typed');
        return true;
      }
      say(`${resolved.href} is outside the Small Web. It is shown, never followed.`, 'warn');
      return false;
    },
    [navigator, say],
  );

  const switchPerson = useCallback(
    (id: string) => {
      navigator?.cancel();
      session?.switchPerson(id);
      try {
        localStorage.setItem(PERSON_KEY, id);
      } catch {
        /* storage unavailable */
      }
    },
    [session, navigator],
  );

  const stack = snapshot?.stack;
  return useMemo(
    () => ({
      ready: Boolean(session && snapshot),
      bootError,
      people,
      person,
      snapshot,
      page,
      notice,
      dismissNotice: () => setNotice(null),
      say,
      canBack: stack ? canBack(stack) : false,
      canForward: stack ? canForward(stack) : false,
      pendingAddr,
      // cancel a pending load at click time, so it cannot push while the traversal is in flight
      back: () => {
        navigator?.cancel();
        session?.back();
      },
      forward: () => {
        navigator?.cancel();
        session?.forward();
      },
      reload: () => {
        const here = snapshot?.entry.addr;
        if (here) navigator?.go(here, 'typed');
      },
      go,
      open,
      switchPerson,
      saveScroll: (entryId: string, y: number) => session?.saveScroll(entryId, y),
      scrollOf: (entryId: string) =>
        session?.activeStack.entries.find((e) => e.id === entryId)?.scroll ?? 0,
      viewCache: viewCache.current,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session, navigator, pendingAddr, snapshot, page, notice, people, person, bootError, go, open, switchPerson, say, stack],
  );
}
