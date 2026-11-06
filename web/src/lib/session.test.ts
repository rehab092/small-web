import { describe, expect, it } from 'vitest';
import { HOME_ADDR } from './address';
import { canBack, canForward, current } from './history-stack';
import {
  BrowserSession,
  MemoryStackStore,
  parseLocation,
  type HistoryLike,
  type Snapshot,
} from './session';

/** A browser history with real semantics: pushState truncates, go() is async. */
class FakeHistory implements HistoryLike {
  entries: Array<{ state: unknown; url: string }> = [{ state: null, url: '/' }];
  pos = 0;
  private queue: number[] = [];
  get state() {
    return this.entries[this.pos]?.state;
  }
  get url() {
    return this.entries[this.pos]?.url ?? '/';
  }
  pushState(state: unknown, _unused: string, url?: string | null) {
    this.entries.length = this.pos + 1;
    this.entries.push({ state, url: url ?? this.url });
    this.pos += 1;
  }
  replaceState(state: unknown, _unused: string, url?: string | null) {
    this.entries[this.pos] = { state, url: url ?? this.url };
  }
  go(delta: number) {
    this.queue.push(delta);
  }
  back() {
    this.go(-1);
  }
  forward() {
    this.go(1);
  }
  /** Apply queued traversals, firing popstate for each one that lands. */
  flush(onPop: (state: unknown, search: string) => void) {
    while (this.queue.length) {
      const target = this.pos + (this.queue.shift() as number);
      if (target < 0 || target >= this.entries.length) continue;
      this.pos = target;
      onPop(this.state, this.url.slice(this.url.indexOf('?')));
    }
  }
}

function setup(existing?: { hist: FakeHistory; store: MemoryStackStore; ids: { n: number } }) {
  const hist = existing?.hist ?? new FakeHistory();
  const store = existing?.store ?? new MemoryStackStore();
  const ids = existing?.ids ?? { n: 0 };
  const session = new BrowserSession({ history: hist, store, newId: () => `id${++ids.n}` });
  const snaps: Snapshot[] = [];
  session.subscribe((s) => snaps.push(s));
  const flush = () => hist.flush((state, search) => session.onPopState(state, parseLocation(search)));
  const addrs = () => session.activeStack.entries.map((e) => e.addr);
  const shown = () => current(session.activeStack)?.addr;
  return { hist, store, ids, session, snaps, flush, addrs, shown };
}

const start = (t: ReturnType<typeof setup>, person = 'ines', addr: string | null = 'a.zz') =>
  t.session.start({ person, addr }, 'ines');

describe('BrowserSession: back and forward', () => {
  it('starts with one entry that replaces the blank browser entry', () => {
    const t = setup();
    const snap = start(t);
    expect(snap.cause).toBe('enter');
    expect(snap.arrival).toBe('typed');
    expect(t.hist.entries).toHaveLength(1);
    expect(t.hist.url).toBe('/?p=ines&addr=a.zz');
  });

  it('home is an internal page and is not recorded as an arrival', () => {
    const t = setup();
    const snap = start(t, 'ines', null);
    expect(snap.entry.addr).toBe(HOME_ADDR);
    expect(snap.arrival).toBeNull();
  });

  it('rejects junk in ?addr= by falling back to home', () => {
    const t = setup();
    expect(start(t, 'ines', 'javascript:alert(1)').entry.addr).toBe(HOME_ADDR);
  });

  it('trail 4 deep, back x3, forward x2, then a new link leaves forward disabled', () => {
    const t = setup();
    start(t);
    t.session.navigate('b.zz', 'link');
    t.session.navigate('c.zz', 'link');
    t.session.navigate('d.zz', 'link');
    expect(t.hist.entries).toHaveLength(4); // one browser entry per page, no doubles

    for (let i = 0; i < 3; i++) t.session.back();
    t.flush();
    expect(t.shown()).toBe('a.zz');
    expect(canBack(t.session.activeStack)).toBe(false);

    t.session.forward();
    t.session.forward();
    t.flush();
    expect(t.shown()).toBe('c.zz');
    expect(canForward(t.session.activeStack)).toBe(true);

    t.session.navigate('x.zz', 'link');
    expect(t.addrs()).toEqual(['a.zz', 'b.zz', 'c.zz', 'x.zz']);
    expect(canForward(t.session.activeStack)).toBe(false);
    expect(t.hist.entries).toHaveLength(4); // browser dropped forward too
    t.session.forward();
    t.flush();
    expect(t.shown()).toBe('x.zz');
  });

  it('emits back and forward arrivals with the matching via', () => {
    const t = setup();
    start(t);
    t.session.navigate('b.zz', 'typed');
    t.session.back();
    t.flush();
    t.session.forward();
    t.flush();
    const arrivals = t.snaps.map((s) => [s.cause, s.arrival, s.entry.addr]);
    expect(arrivals).toEqual([
      ['enter', 'typed', 'a.zz'],
      ['navigate', 'typed', 'b.zz'],
      ['back', 'back', 'a.zz'],
      ['forward', 'forward', 'b.zz'],
    ]);
  });

  it('the real browser Back button takes the same path as the toolbar', () => {
    const t = setup();
    start(t);
    t.session.navigate('b.zz', 'link');
    t.session.navigate('c.zz', 'link');
    t.hist.back(); // user presses the browser's own Back
    t.flush();
    expect(t.shown()).toBe('b.zz');
    expect(t.hist.entries).toHaveLength(3);
    expect(t.snaps.at(-1)?.arrival).toBe('back');
    t.hist.forward();
    t.flush();
    expect(t.shown()).toBe('c.zz');
  });

  it('a multi-step jump from the browser history menu is one back arrival', () => {
    const t = setup();
    start(t);
    ['b.zz', 'c.zz', 'd.zz'].forEach((a) => t.session.navigate(a, 'link'));
    t.hist.go(-3);
    t.flush();
    expect(t.shown()).toBe('a.zz');
    expect(t.snaps.at(-1)?.arrival).toBe('back');
  });

  it('rapid back clicks never run off the start of the stack', () => {
    const t = setup();
    start(t);
    t.session.navigate('b.zz', 'link');
    const results = [1, 2, 3, 4, 5].map(() => t.session.back());
    expect(results).toEqual([true, false, false, false, false]);
    t.flush();
    expect(t.shown()).toBe('a.zz');
    expect(t.hist.pos).toBe(0);
  });

  it('rapid forward clicks stop at the end of the stack', () => {
    const t = setup();
    start(t);
    t.session.navigate('b.zz', 'link');
    t.session.navigate('c.zz', 'link');
    t.session.back();
    t.session.back();
    t.flush();
    const results = [1, 2, 3, 4].map(() => t.session.forward());
    expect(results).toEqual([true, true, false, false]);
    t.flush();
    expect(t.shown()).toBe('c.zz');
  });

  it('navigating to the page already shown is a reload: no entry, no arrival', () => {
    const t = setup();
    start(t);
    const snap = t.session.navigate('a.zz', 'typed');
    expect(snap?.cause).toBe('reload');
    expect(snap?.arrival).toBeNull();
    expect(t.addrs()).toEqual(['a.zz']);
    expect(t.hist.entries).toHaveLength(1);
  });
});

describe('BrowserSession: restore on return', () => {
  it('keeps the scroll position of the page that was left', () => {
    const t = setup();
    const first = start(t);
    t.session.saveScroll(first.entry.id, 640);
    t.session.navigate('b.zz', 'link');
    t.session.back();
    t.flush();
    expect(t.snaps.at(-1)?.entry.scroll).toBe(640);
  });

  it('a reload keeps the position in the stack and is not an arrival', () => {
    const t = setup();
    start(t);
    t.session.navigate('b.zz', 'link');
    t.session.navigate('c.zz', 'link');
    t.session.back();
    t.flush();

    const reloaded = setup(t); // new JS state, same browser history + sessionStorage
    const snap = start(reloaded);
    expect(snap.cause).toBe('restore');
    expect(snap.arrival).toBeNull();
    expect(reloaded.shown()).toBe('b.zz');
    expect(canForward(reloaded.session.activeStack)).toBe(true); // c.zz still ahead
    expect(t.hist.entries).toHaveLength(3);
  });

  it('starting twice (React strict mode) does not duplicate the entry or the arrival', () => {
    const t = setup();
    start(t);
    const again = setup(t);
    const snap = start(again);
    expect(snap.cause).toBe('restore');
    expect(t.hist.entries).toHaveLength(1);
    expect(again.addrs()).toEqual(['a.zz']);
  });

  it('typing a new URL in the real address bar appends to the tab session', () => {
    const t = setup();
    start(t);
    t.session.navigate('b.zz', 'link');
    // the browser performs a real navigation: new document, new entry, no state
    t.hist.entries.push({ state: null, url: '/?p=ines&addr=z.zz' });
    t.hist.pos += 1;
    const fresh = setup(t);
    const snap = start(fresh, 'ines', 'z.zz');
    expect(snap.cause).toBe('enter');
    expect(fresh.addrs()).toEqual(['a.zz', 'b.zz', 'z.zz']);
  });
});

describe('BrowserSession: people have separate stacks', () => {
  it('switching person gives them a stack of their own', () => {
    const t = setup();
    start(t, 'ines', 'a.zz');
    t.session.navigate('b.zz', 'link');
    const snap = t.session.switchPerson('tomas');
    expect(snap?.cause).toBe('switch');
    expect(snap?.arrival).toBeNull();
    expect(t.session.activePerson).toBe('tomas');
    expect(t.addrs()).toEqual([HOME_ADDR]);
    expect(canBack(t.session.activeStack)).toBe(false);
    expect(t.store.get('ines')?.stack.entries.map((e) => e.addr)).toEqual(['a.zz', 'b.zz']);
  });

  it('switching back restores the first person exactly, forward history included', () => {
    const t = setup();
    start(t, 'ines', 'a.zz');
    ['b.zz', 'c.zz'].forEach((a) => t.session.navigate(a, 'link'));
    t.session.back();
    t.flush();
    t.session.switchPerson('tomas');
    t.session.navigate('t1.zz', 'typed');
    t.flush();
    t.session.switchPerson('ines');
    t.flush();
    expect(t.session.activePerson).toBe('ines');
    expect(t.shown()).toBe('b.zz');
    expect(canForward(t.session.activeStack)).toBe(true);
    expect(canBack(t.session.activeStack)).toBe(true);
  });

  it('toolbar back after a person switch round trip lands on the right page', () => {
    const t = setup();
    start(t, 'ines', 'a.zz');
    ['b.zz', 'c.zz'].forEach((a) => t.session.navigate(a, 'link'));
    t.session.switchPerson('tomas');
    t.session.navigate('t1.zz', 'typed');
    t.session.switchPerson('ines');
    t.flush();
    expect(t.shown()).toBe('c.zz');
    t.session.back();
    t.flush();
    expect(t.shown()).toBe('b.zz');
    t.session.back();
    t.flush();
    expect(t.shown()).toBe('a.zz');
    t.session.forward();
    t.flush();
    expect(t.shown()).toBe('b.zz');
  });

  it('the real Back button after a switch returns to the previous person, not a mixed stack', () => {
    const t = setup();
    start(t, 'ines', 'a.zz');
    t.session.navigate('b.zz', 'link');
    t.session.switchPerson('tomas');
    t.flush();
    t.hist.back(); // browser Back across the person boundary
    t.flush();
    expect(t.session.activePerson).toBe('ines');
    expect(t.shown()).toBe('b.zz');
    expect(t.snaps.at(-1)?.cause).toBe('switch');
  });

  it('switching to the person already active does nothing', () => {
    const t = setup();
    start(t);
    expect(t.session.switchPerson('ines')).toBeNull();
  });

  it('opening a URL for another person starts that person in their own stack', () => {
    const t = setup();
    start(t, 'ines', 'a.zz');
    const other = setup(t);
    other.session.start({ person: 'tomas', addr: 'q.zz' }, 'ines');
    expect(other.session.activePerson).toBe('tomas');
    expect(other.addrs()).toEqual(['q.zz']);
  });
});
