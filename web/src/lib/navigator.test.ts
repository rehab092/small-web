import { describe, expect, it } from 'vitest';
import { HOME_ADDR, searchAddr } from './address';
import { FakeHistory } from './fake-history';
import { canForward, current } from './history-stack';
import { Navigator, type PageResult } from './navigator';
import { BrowserSession, MemoryStackStore, parseLocation, type Snapshot } from './session';
import type { SiteDto } from './types';

const site = (address: string): SiteDto => ({
  address,
  title: address,
  html: '<p>x</p>',
  author: { id: 'a', name: 'A' },
  revision: 1,
  createdAt: '',
  updatedAt: '',
});

interface Deferred {
  addr: string;
  signal: AbortSignal;
  resolve: (value: SiteDto | null) => void;
  reject: (err: Error) => void;
}

/** A navigator over a real session and browser history, with a loader the test controls. */
function setup() {
  const hist = new FakeHistory();
  let n = 0;
  const session = new BrowserSession({ history: hist, store: new MemoryStackStore(), newId: () => `id${++n}` });
  const loads: Deferred[] = [];
  const commits: Array<{ snap: Snapshot; result: PageResult | null }> = [];
  const pending: Array<string | null> = [];
  const navigator = new Navigator({
    session,
    loadSite: (addr, signal) =>
      new Promise<SiteDto | null>((resolve, reject) => {
        loads.push({ addr, signal, resolve, reject });
      }),
    onPending: (addr) => pending.push(addr),
    onCommit: (snap, result) => commits.push({ snap, result }),
  });
  session.subscribe((snap) => {
    if (snap.cause !== 'navigate') navigator.cancel(); // what the app does for traversals
  });
  const flush = () => hist.flush((state, search) => session.onPopState(state, parseLocation(search)));
  const addrs = () => session.activeStack.entries.map((e) => e.addr);
  const shown = () => current(session.activeStack)?.addr;
  const tick = () => new Promise((r) => setTimeout(r, 0));
  session.start({ person: 'ines', addr: 'a.zz' }, 'ines');
  return { hist, session, navigator, loads, commits, pending, flush, addrs, shown, tick };
}

describe('Navigator: a navigation becomes a history entry only once its page arrives', () => {
  it('adds no entry while the page is still loading', async () => {
    const t = setup();
    t.navigator.go('b.zz', 'link');
    expect(t.navigator.pendingAddress).toBe('b.zz');
    expect(t.addrs()).toEqual(['a.zz']);
    expect(t.hist.entries).toHaveLength(1);

    t.loads[0]!.resolve(site('b.zz'));
    await t.tick();
    expect(t.addrs()).toEqual(['a.zz', 'b.zz']);
    expect(t.hist.entries).toHaveLength(2);
    expect(t.commits).toHaveLength(1);
    expect(t.commits[0]!.snap.arrival).toBe('link');
    expect(t.commits[0]!.result).toEqual({ kind: 'site', site: site('b.zz') });
    expect(t.navigator.pendingAddress).toBeNull();
  });

  it('several navigations in the same tick leave exactly one entry: the one shown', async () => {
    const t = setup();
    t.navigator.go('b.zz', 'link');
    t.navigator.go('c.zz', 'link');
    t.navigator.go('d.zz', 'link');
    expect(t.loads.map((l) => l.signal.aborted)).toEqual([true, true, false]);

    // the superseded loads may still answer; they must be ignored
    t.loads[0]!.resolve(site('b.zz'));
    t.loads[1]!.resolve(site('c.zz'));
    t.loads[2]!.resolve(site('d.zz'));
    await t.tick();

    expect(t.addrs()).toEqual(['a.zz', 'd.zz']);
    expect(t.hist.entries).toHaveLength(2);
    expect(t.commits.map((c) => c.snap.entry.addr)).toEqual(['d.zz']); // one arrival, one visit
  });

  it('a load that fails after being superseded does not commit or report an error', async () => {
    const t = setup();
    t.navigator.go('b.zz', 'link');
    t.navigator.go('c.zz', 'link');
    t.loads[0]!.reject(new Error('boom'));
    t.loads[1]!.resolve(site('c.zz'));
    await t.tick();
    expect(t.addrs()).toEqual(['a.zz', 'c.zz']);
    expect(t.commits).toHaveLength(1);
    expect(t.commits[0]!.result?.kind).toBe('site');
  });

  it('Back while a page is loading cancels it: no entry, nothing ahead', async () => {
    const t = setup();
    t.navigator.go('b.zz', 'link');
    t.loads[0]!.resolve(site('b.zz'));
    await t.tick();
    t.navigator.go('c.zz', 'link'); // loading...
    t.session.back();
    t.flush();
    expect(t.loads[1]!.signal.aborted).toBe(true);
    expect(t.pending.at(-1)).toBeNull();

    t.loads[1]!.resolve(site('c.zz')); // the answer arrives too late
    await t.tick();
    expect(t.shown()).toBe('a.zz');
    expect(t.addrs()).toEqual(['a.zz', 'b.zz']); // c.zz was never an entry
    expect(canForward(t.session.activeStack)).toBe(true); // b.zz only
    expect(t.hist.entries).toHaveLength(2);
  });

  it('switching person while a page is loading cancels it', async () => {
    const t = setup();
    t.navigator.go('b.zz', 'link');
    t.session.switchPerson('tomas');
    t.loads[0]!.resolve(site('b.zz'));
    await t.tick();
    expect(t.loads[0]!.signal.aborted).toBe(true);
    expect(t.session.activePerson).toBe('tomas');
    expect(t.addrs()).toEqual([HOME_ADDR]);
    expect(t.hist.entries).toHaveLength(1);
  });

  it('an internal page commits at once and cancels a load in flight', async () => {
    const t = setup();
    t.navigator.go('b.zz', 'link');
    t.navigator.go(searchAddr('tide'), 'typed');
    expect(t.loads[0]!.signal.aborted).toBe(true);
    expect(t.addrs()).toEqual(['a.zz', searchAddr('tide')]);
    expect(t.commits[0]!.result).toBeNull();

    t.loads[0]!.resolve(site('b.zz'));
    await t.tick();
    expect(t.addrs()).toEqual(['a.zz', searchAddr('tide')]);
  });

  it('going to the page already shown is a reload: no pending state, no entry', () => {
    const t = setup();
    t.navigator.go('a.zz', 'typed');
    expect(t.loads).toHaveLength(0);
    expect(t.commits[0]!.snap.cause).toBe('reload');
    expect(t.addrs()).toEqual(['a.zz']);
  });

  it('an address with nothing at it commits as Nowhere', async () => {
    const t = setup();
    t.navigator.go('ghost.zz', 'typed');
    t.loads[0]!.resolve(null);
    await t.tick();
    expect(t.addrs()).toEqual(['a.zz', 'ghost.zz']);
    expect(t.commits[0]!.result).toEqual({ kind: 'nowhere' });
  });

  it('a failed load commits as an error page that can be retried', async () => {
    const t = setup();
    t.navigator.go('b.zz', 'link');
    t.loads[0]!.reject(new Error('Cannot reach the Small Web server.'));
    await t.tick();
    expect(t.addrs()).toEqual(['a.zz', 'b.zz']);
    expect(t.commits[0]!.result).toEqual({ kind: 'error', message: 'Cannot reach the Small Web server.' });
  });

  it('reports pending while loading and clears it on commit', async () => {
    const t = setup();
    t.navigator.go('b.zz', 'link');
    t.loads[0]!.resolve(site('b.zz'));
    await t.tick();
    expect(t.pending).toEqual(['b.zz', null]);
  });
});
