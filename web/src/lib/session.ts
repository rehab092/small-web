/**
 * Browser session: per-person history stacks kept in lockstep with the real
 * `window.history`, so the toolbar's Back/Forward and the browser's own
 * Back/Forward button are the same thing.
 *
 * How the two stay in sync ("no double entries")
 *  - every navigation is exactly one `pushState`, made synchronously in the
 *    click/Enter handler (so the browser counts it as user initiated);
 *  - the toolbar never moves the stack itself: Back/Forward call
 *    `history.back()/forward()` and the resulting `popstate` is the single
 *    place the index changes. A real Back press takes the same path;
 *  - each pushed browser entry carries `{person, mirror, entryId}` in
 *    `history.state`; `entryId` finds the stack entry, `mirror` proves the
 *    browser entries still line up with that stack;
 *  - switching person pushes a rebuilt, contiguous copy of that person's stack
 *    (and steps back to the right entry) under a fresh `mirror` token. Entries
 *    from an older mirror found later are re-aligned the same way.
 *
 * The class has no React or DOM dependency; `HistoryLike` and `StackStore`
 * are injected so it is tested against a fake browser history.
 */

import { HOME_ADDR, internalPage, isInternalAddr, normalizeAddress } from './address';
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
 *  - switch:   another person's stack is now active (not an arrival)
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

export function defaultUrlFor(person: string, entry: Pick<StackEntry, 'addr'>): string {
  return `/?p=${encodeURIComponent(person)}&addr=${encodeURIComponent(entry.addr)}`;
}

/** Read `?p=&addr=` from a location search string. */
export function parseLocation(search: string): Location {
  const params = new URLSearchParams(search);
  return { person: params.get('p'), addr: params.get('addr') };
}

function asNavState(value: unknown): NavState | null {
  const v = value as Partial<NavState> | null;
  if (
    v &&
    typeof v === 'object' &&
    v.sw === 1 &&
    typeof v.person === 'string' &&
    typeof v.mirror === 'string' &&
    typeof v.entryId === 'string'
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
      this.adopt(person, persisted);
      this.stack = goToId(this.stack, state.entryId);
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

  /** Make `person` the active browser identity, with a stack of their own. */
  switchPerson(person: string): Snapshot | null {
    if (person === this.person) return null;
    this.persist();
    const persisted = this.deps.store.get(person);
    const stack =
      persisted?.stack ?? push(EMPTY_STACK, { id: this.deps.newId(), addr: HOME_ADDR });
    this.person = person;
    this.stack = stack;
    this.pending = 0;
    this.rebuild(stack.index);
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

    const sameStack = nav.person === this.person;
    const persisted = sameStack ? { stack: this.stack, mirror: this.mirror } : this.deps.store.get(nav.person);
    const target = persisted ? indexOfId(persisted.stack, nav.entryId) : -1;
    if (!persisted || target < 0) {
      return this.enter(nav.person, sanitizeAddr(loc.addr), this.deps.store.get(nav.person));
    }

    const here = current(this.stack);
    if (sameStack && here?.id === nav.entryId) return null; // echo of a rebuild

    const previous = this.stack.index;
    if (!sameStack) this.adopt(nav.person, persisted);
    this.stack = goToId(this.stack, nav.entryId);
    if (nav.mirror !== this.mirror) this.rebuild(target); // stale entry: realign the browser
    else this.persist();

    if (!sameStack) return this.emit('switch', null);
    return this.emit(target < previous ? 'back' : 'forward', target < previous ? 'back' : 'forward');
  }

  // --- internals -----------------------------------------------------------

  private persisted(person: string): PersistedStack | null {
    return person === this.person ? { stack: this.stack, mirror: this.mirror } : this.deps.store.get(person);
  }

  private adopt(person: string, persisted: PersistedStack): void {
    this.person = person;
    this.stack = persisted.stack;
    this.mirror = persisted.mirror;
    this.pending = 0;
  }

  /** A document load whose history entry we have not seen before. */
  private enter(person: string, addr: string, persisted: PersistedStack | null): Snapshot {
    const base = persisted?.stack ?? EMPTY_STACK;
    this.person = person;
    this.mirror = persisted?.mirror ?? this.deps.newId();
    this.pending = 0;
    const here = current(base);
    const entry = here && here.addr === addr ? here : { id: this.deps.newId(), addr };
    this.stack = here && here.addr === addr ? base : push(base, entry);
    this.deps.history.replaceState(this.stateFor(entry.id), '', this.urlFor(person, entry));
    this.persist();
    return this.emit('enter', isInternalAddr(addr) ? null : 'typed');
  }

  /**
   * Re-create the active stack in the browser as one contiguous run of fresh
   * entries (new mirror token) and step back to `index`.
   */
  private rebuild(index: number): void {
    this.mirror = this.deps.newId();
    this.stack = { ...this.stack, index };
    const { entries } = this.stack;
    for (const entry of entries) {
      this.deps.history.pushState(this.stateFor(entry.id), '', this.urlFor(this.person, entry));
    }
    const delta = index - (entries.length - 1);
    if (delta < 0) this.deps.history.go(delta);
    this.persist();
  }

  private stateFor(entryId: string): NavState {
    return { sw: 1, person: this.person, mirror: this.mirror, entryId };
  }

  private persist(): void {
    this.deps.store.set(this.person, { stack: this.stack, mirror: this.mirror });
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
      const parsed = JSON.parse(raw) as { stack?: unknown; mirror?: unknown };
      const stack = parseStack(parsed.stack);
      return stack && typeof parsed.mirror === 'string' ? { stack, mirror: parsed.mirror } : null;
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
