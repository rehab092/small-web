/**
 * Browser session: one history stack per browsing session, kept in lockstep with
 * the real `window.history`, so the toolbar's Back/Forward and the browser's own
 * Back/Forward button are the same thing.
 *
 * How the two stay in sync ("no double entries")
 *  - every navigation is exactly one `pushState`;
 *  - the toolbar never moves the stack itself: Back/Forward call
 *    `history.back()/forward()` and the resulting `popstate` is the single
 *    place the index changes. A real Back press takes the same path;
 *  - each browser entry we own carries `{person, mirror, entryId, pos}` in
 *    `history.state`: `entryId` finds the stack entry, `mirror` proves the entry
 *    belongs to the *current* session, and `pos` is its position in the real
 *    history (one more than the entry before it).
 *
 * Switching person is a session boundary, not a navigation
 *  - the new person starts a fresh stack (one entry, Home) under a new `mirror`;
 *  - the browser entry being shown is *replaced* (`replaceState`): nothing is
 *    pushed, so the real history does not grow and no stack is copied into it;
 *  - entries from before the boundary stay in the real history (a page cannot
 *    delete them) but belong to another session. If a real Back/Forward lands on
 *    one, the session steps straight back to its own entry with
 *    `history.go(ownPos - theirPos)`. Back can therefore never cross into another
 *    person's stack, exactly like the toolbar's Back, which is disabled at the
 *    first page of the stack.
 *
 * The class has no React or DOM dependency; `HistoryLike` and `StackStore`
 * are injected so it is tested against a fake browser history.
 */

import {
  HOME_ADDR,
  addrFromUrlParams,
  addrToUrlParams,
  internalPage,
  isInternalAddr,
  normalizeAddress,
} from './address';
import {
  EMPTY_STACK,
  current,
  goToId,
  indexOfId,
  parseStack,
  push,
  setScroll,
  type Stack,
  type StackEntry,
} from './history-stack';
import type { Via } from './types';

export interface HistoryLike {
  readonly state: unknown;
  pushState(state: unknown, unused: string, url?: string | null): void;
  replaceState(state: unknown, unused: string, url?: string | null): void;
  go(delta: number): void;
  back(): void;
  forward(): void;
}

export interface PersistedStack {
  stack: Stack;
  mirror: string;
  /** Position in the real history of the current entry. */
  pos: number;
}

export interface StackStore {
  get(person: string): PersistedStack | null;
  set(person: string, value: PersistedStack): void;
}

/** What is written into `history.state` for every entry we own. */
export interface NavState {
  sw: 1;
  person: string;
  mirror: string;
  entryId: string;
  pos: number;
}

export interface Location {
  person: string | null;
  addr: string | null;
}

/**
 * Why the snapshot changed.
 *  - enter:    a fresh document load at some address (counts as typed arrival)
 *  - restore:  a reload of a page we already track (not an arrival)
 *  - navigate: a new page pushed on the stack (arrival with the caller's `via`)
 *  - back / forward: the index moved (arrival via back/forward)
 *  - switch:   another person's fresh session is now active (not an arrival)
 *  - reload:   navigating to the page already shown (not an arrival)
 */
export type Cause = 'enter' | 'restore' | 'navigate' | 'back' | 'forward' | 'switch' | 'reload';

export interface Snapshot {
  person: string;
  stack: Stack;
  entry: StackEntry;
  cause: Cause;
  /** The `via` to record for this arrival, or null when it is not an arrival. */
  arrival: Via | null;
  seq: number;
}

export interface SessionDeps {
  history: HistoryLike;
  store: StackStore;
  newId: () => string;
  urlFor?: (person: string, entry: Pick<StackEntry, 'addr'>) => string;
}

/** `/?p=<person>&addr=<page>[&q=…]`, every value encoded exactly once. */
export function defaultUrlFor(person: string, entry: Pick<StackEntry, 'addr'>): string {
  const params = new URLSearchParams({ p: person });
  addrToUrlParams(entry.addr).forEach((value, name) => params.set(name, value));
  return `/?${params.toString()}`;
}

/** Read the person and address from a location search string. */
export function parseLocation(search: string): Location {
  const params = new URLSearchParams(search);
  return { person: params.get('p'), addr: addrFromUrlParams(params) };
}

function asNavState(value: unknown): NavState | null {
  const v = value as Partial<NavState> | null;
  if (
    v &&
    typeof v === 'object' &&
    v.sw === 1 &&
    typeof v.person === 'string' &&
    typeof v.mirror === 'string' &&
    typeof v.entryId === 'string' &&
    typeof v.pos === 'number'
  ) {
    return v as NavState;
  }
  return null;
}

/** Only internal pages and valid small-web addresses may become stack entries. */
function sanitizeAddr(addr: string | null): string {
  if (!addr) return HOME_ADDR;
  if (isInternalAddr(addr)) return internalPage(addr) ? addr : HOME_ADDR;
  return normalizeAddress(addr) ?? HOME_ADDR;
}

export class BrowserSession {
  private person = '';
  private stack: Stack = EMPTY_STACK;
  private mirror = '';
  /** Position in the real history of the entry being shown. */
  private pos = 0;
  /** Traversals we asked the browser for that have not produced a popstate yet. */
  private pending = 0;
  private seq = 0;
  private readonly listeners = new Set<(snapshot: Snapshot) => void>();
  private readonly urlFor: (person: string, entry: Pick<StackEntry, 'addr'>) => string;

  constructor(private readonly deps: SessionDeps) {
    this.urlFor = deps.urlFor ?? defaultUrlFor;
  }

  subscribe(listener: (snapshot: Snapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get activePerson(): string {
    return this.person;
  }

  get activeStack(): Stack {
    return this.stack;
  }

  /** First call on page load. `loc` is what the URL says. */
  start(loc: Location, defaultPerson: string): Snapshot {
    const person = loc.person ?? defaultPerson;
    const persisted = this.deps.store.get(person);
    const state = asNavState(this.deps.history.state);

    if (
      state &&
      persisted &&
      state.person === person &&
      state.mirror === persisted.mirror &&
      indexOfId(persisted.stack, state.entryId) >= 0
    ) {
      this.person = person;
      this.stack = goToId(persisted.stack, state.entryId);
      this.mirror = persisted.mirror;
      this.pos = state.pos;
      this.pending = 0;
      this.persist();
      return this.emit('restore', null);
    }
    return this.enter(person, sanitizeAddr(loc.addr), persisted);
  }

  /**
   * Go to `addr`. Navigating to the page already shown is a reload (no new
   * entry, no arrival); anything else is one new entry and one pushState.
   */
  navigate(addr: string, via: Via): Snapshot | null {
    const here = current(this.stack);
    if (!here) return null;
    if (here.addr === addr) return this.emit('reload', null);
    const entry = { id: this.deps.newId(), addr };
    this.stack = push(this.stack, entry);
    this.pos += 1;
    this.deps.history.pushState(this.stateFor(entry.id), '', this.urlFor(this.person, entry));
    this.persist();
    return this.emit('navigate', via);
  }

  /** Ask the browser to go back one entry; false when there is nowhere to go. */
  back(): boolean {
    if (this.stack.index + this.pending <= 0) return false;
    this.pending -= 1;
    this.deps.history.back();
    return true;
  }

  forward(): boolean {
    if (this.stack.index + this.pending >= this.stack.entries.length - 1) return false;
    this.pending += 1;
    this.deps.history.forward();
    return true;
  }

  /**
   * Make `person` the browsing identity. This is a session boundary: they get a
   * fresh one-entry stack at Home and the current browser entry is replaced, so
   * the real history neither grows nor mixes two people's pages.
   */
  switchPerson(person: string): Snapshot | null {
    if (person === this.person) return null;
    const entry = { id: this.deps.newId(), addr: HOME_ADDR };
    this.person = person;
    this.stack = push(EMPTY_STACK, entry);
    this.mirror = this.deps.newId();
    this.pending = 0;
    this.deps.history.replaceState(this.stateFor(entry.id), '', this.urlFor(person, entry));
    this.persist();
    return this.emit('switch', null);
  }

  /** Remember where a page was scrolled to, so returning restores it. */
  saveScroll(entryId: string, y: number): void {
    const next = setScroll(this.stack, entryId, y);
    if (next === this.stack) return;
    this.stack = next;
    this.persist();
  }

  /** Feed the browser's `popstate` here (real Back/Forward or our own). */
  onPopState(state: unknown, loc: Location): Snapshot | null {
    if (this.pending !== 0) this.pending += this.pending < 0 ? 1 : -1;
    const nav = asNavState(state);
    if (!nav) return this.enter(loc.person ?? this.person, sanitizeAddr(loc.addr), this.persisted(loc.person ?? this.person));

    const target = nav.mirror === this.mirror && nav.person === this.person ? indexOfId(this.stack, nav.entryId) : -1;
    if (target < 0) {
      this.bounce(nav); // an entry from before a session boundary: never cross into it
      return null;
    }

    this.pos = nav.pos;
    if (target === this.stack.index) return null; // echo of our own bounce
    const previous = this.stack.index;
    this.stack = goToId(this.stack, nav.entryId);
    this.persist();
    const direction = target < previous ? 'back' : 'forward';
    return this.emit(direction, direction);
  }

  // --- internals -----------------------------------------------------------

  private persisted(person: string): PersistedStack | null {
    if (person === this.person && this.mirror) {
      return { stack: this.stack, mirror: this.mirror, pos: this.pos };
    }
    return this.deps.store.get(person);
  }

  /** Step the real history back to our own entry after it landed on a foreign one. */
  private bounce(foreign: NavState): void {
    const delta = this.pos - foreign.pos;
    if (delta !== 0) this.deps.history.go(delta);
  }

  /** A document load whose history entry we have not seen before. */
  private enter(person: string, addr: string, persisted: PersistedStack | null): Snapshot {
    const base = persisted?.stack ?? EMPTY_STACK;
    const here = current(base);
    const reuse = Boolean(here && here.addr === addr);
    const entry = reuse && here ? here : { id: this.deps.newId(), addr };
    this.person = person;
    this.mirror = persisted?.mirror ?? this.deps.newId();
    this.stack = reuse ? base : push(base, entry);
    this.pos = persisted ? persisted.pos + (reuse ? 0 : 1) : 0;
    this.pending = 0;
    this.deps.history.replaceState(this.stateFor(entry.id), '', this.urlFor(person, entry));
    this.persist();
    return this.emit('enter', isInternalAddr(addr) ? null : 'typed');
  }

  private stateFor(entryId: string): NavState {
    return { sw: 1, person: this.person, mirror: this.mirror, entryId, pos: this.pos };
  }

  private persist(): void {
    this.deps.store.set(this.person, { stack: this.stack, mirror: this.mirror, pos: this.pos });
  }

  private emit(cause: Cause, arrival: Via | null): Snapshot {
    const entry = current(this.stack);
    if (!entry) throw new Error('session has no current entry');
    const snapshot: Snapshot = {
      person: this.person,
      stack: this.stack,
      entry,
      cause,
      arrival,
      seq: ++this.seq,
    };
    for (const listener of this.listeners) listener(snapshot);
    return snapshot;
  }
}

/** In-memory store (tests, and the fallback when sessionStorage is unavailable). */
export class MemoryStackStore implements StackStore {
  private readonly data = new Map<string, PersistedStack>();
  get(person: string): PersistedStack | null {
    const v = this.data.get(person);
    return v ? structuredClone(v) : null;
  }
  set(person: string, value: PersistedStack): void {
    this.data.set(person, structuredClone(value));
  }
}

/** sessionStorage-backed store: survives reload, is per tab. */
export class WebStackStore implements StackStore {
  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'>) {}

  get(person: string): PersistedStack | null {
    try {
      const raw = this.storage.getItem(`sw:stack:${person}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { stack?: unknown; mirror?: unknown; pos?: unknown };
      const stack = parseStack(parsed.stack);
      if (!stack || typeof parsed.mirror !== 'string') return null;
      return { stack, mirror: parsed.mirror, pos: typeof parsed.pos === 'number' ? parsed.pos : 0 };
    } catch {
      return null;
    }
  }

  set(person: string, value: PersistedStack): void {
    try {
      this.storage.setItem(`sw:stack:${person}`, JSON.stringify(value));
    } catch {
      /* storage full or disabled: the in-memory session keeps working */
    }
  }
}
