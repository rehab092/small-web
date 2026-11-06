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
 *  - a newer navigation aborts the load in flight, so rapid clicking ends on
 *    the last page and records only the pages that were really shown.
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
import { canBack, canForward } from './history-stack';
import type { PersonDto, SiteDto, Via } from './types';

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
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [page, setPage] = useState<PageState>({ kind: 'internal', addr: HOME_ADDR });
  const [notice, setNotice] = useState<Notice | null>(null);

  const siteCache = useRef(new Map<string, SiteDto | 'nowhere'>());
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
        next.subscribe(setSnapshot);
        next.start(loc, pickDefaultPerson(list, loc.person));
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
      setPage({ kind: 'internal', addr: entry.addr });
      return;
    }

    if (cause === 'reload') siteCache.current.delete(entry.id);
    const cached = siteCache.current.get(entry.id);
    if (cached) {
      setPage(cached === 'nowhere' ? { kind: 'nowhere', addr: entry.addr } : { kind: 'site', site: cached });
      record(entry.addr);
      return;
    }

    const ctrl = new AbortController();
    setPage({ kind: 'loading', addr: entry.addr });
    api
      .site(entry.addr, ctrl.signal)
      .then((site) => {
        siteCache.current.set(entry.id, site ?? 'nowhere');
        setPage(site ? { kind: 'site', site } : { kind: 'nowhere', addr: entry.addr });
        record(entry.addr);
      })
      .catch((err: unknown) => {
        if ((err as Error).name === 'AbortError') return;
        setPage({
          kind: 'error',
          addr: entry.addr,
          message: err instanceof ApiError ? err.message : 'Something went wrong loading this page.',
        });
      });
    return () => ctrl.abort();
    // `seq` identifies the snapshot; the snapshot object itself changes on scroll saves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq]);

  // 4. tab title.
  useEffect(() => {
    if (page.kind === 'site') document.title = `${page.site.title} · Small Web`;
    else if (page.kind === 'nowhere') document.title = 'Nowhere · Small Web';
    else if (page.kind === 'internal') document.title = 'Small Web';
  }, [page]);

  const go = useCallback(
    (addr: string, via: Via) => {
      session?.navigate(addr, via);
    },
    [session],
  );

  /** Address-bar input: an address, a search, or something outside the Small Web. */
  const open = useCallback(
    (input: string): boolean => {
      const resolved = resolveTyped(input);
      if (!resolved) return false;
      if (resolved.kind === 'address') {
        session?.navigate(resolved.addr, 'typed');
        return true;
      }
      if (resolved.kind === 'search') {
        session?.navigate(searchAddr(resolved.query), 'typed');
        return true;
      }
      say(`${resolved.href} is outside the Small Web. It is shown, never followed.`, 'warn');
      return false;
    },
    [session, say],
  );

  const switchPerson = useCallback(
    (id: string) => {
      session?.switchPerson(id);
      try {
        localStorage.setItem(PERSON_KEY, id);
      } catch {
        /* storage unavailable */
      }
    },
    [session],
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
      back: () => session?.back(),
      forward: () => session?.forward(),
      reload: () => {
        const here = snapshot?.entry.addr;
        if (here) session?.navigate(here, 'typed');
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
    [session, snapshot, page, notice, people, person, bootError, go, open, switchPerson, say, stack],
  );
}
