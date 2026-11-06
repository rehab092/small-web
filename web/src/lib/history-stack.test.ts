import { describe, expect, it } from 'vitest';
import {
  EMPTY_STACK,
  back,
  canBack,
  canForward,
  current,
  forward,
  goToId,
  parseStack,
  push,
  setScroll,
  type Stack,
} from './history-stack';

let n = 0;
const e = (addr: string) => ({ id: `e${++n}`, addr });
const trail = (...addrs: string[]): Stack => addrs.reduce((s, a) => push(s, e(a)), EMPTY_STACK);
const addrs = (s: Stack) => s.entries.map((x) => x.addr);

describe('history stack', () => {
  it('starts empty with nothing to go back or forward to', () => {
    expect(current(EMPTY_STACK)).toBeNull();
    expect(canBack(EMPTY_STACK)).toBe(false);
    expect(canForward(EMPTY_STACK)).toBe(false);
  });

  it('push appends and moves to the new entry', () => {
    const s = trail('a.zz', 'b.zz', 'c.zz');
    expect(addrs(s)).toEqual(['a.zz', 'b.zz', 'c.zz']);
    expect(current(s)?.addr).toBe('c.zz');
    expect(canBack(s)).toBe(true);
    expect(canForward(s)).toBe(false);
  });

  it('back and forward only move the index', () => {
    const s = trail('a.zz', 'b.zz', 'c.zz');
    const b = back(back(s));
    expect(current(b)?.addr).toBe('a.zz');
    expect(canBack(b)).toBe(false);
    expect(canForward(b)).toBe(true);
    expect(addrs(b)).toEqual(addrs(s));
    expect(current(forward(b))?.addr).toBe('b.zz');
  });

  it('back at the start and forward at the end are no-ops', () => {
    const one = trail('a.zz');
    expect(back(one)).toBe(one);
    expect(forward(one)).toBe(one);
  });

  it('trail 4 deep, back x3, forward x2, then a new link truncates forward', () => {
    let s = trail('a.zz', 'b.zz', 'c.zz', 'd.zz');
    s = back(back(back(s)));
    s = forward(forward(s));
    expect(current(s)?.addr).toBe('c.zz');
    expect(canForward(s)).toBe(true); // d.zz is still ahead
    s = push(s, e('x.zz'));
    expect(addrs(s)).toEqual(['a.zz', 'b.zz', 'c.zz', 'x.zz']);
    expect(canForward(s)).toBe(false);
    expect(current(s)?.addr).toBe('x.zz');
  });

  it('pushing from the middle discards every entry ahead', () => {
    let s = trail('a.zz', 'b.zz', 'c.zz');
    s = back(back(s));
    s = push(s, e('z.zz'));
    expect(addrs(s)).toEqual(['a.zz', 'z.zz']);
  });

  it('is immutable: operations never modify the input', () => {
    const s = trail('a.zz', 'b.zz');
    const copy = JSON.stringify(s);
    back(s);
    push(s, e('c.zz'));
    setScroll(s, s.entries[0]!.id, 40);
    expect(JSON.stringify(s)).toBe(copy);
  });

  it('keeps scroll per entry and a fresh entry starts at the top', () => {
    let s = trail('a.zz', 'b.zz');
    const aId = s.entries[0]!.id;
    s = setScroll(s, aId, 480.4);
    expect(s.entries[0]?.scroll).toBe(480);
    expect(s.entries[1]?.scroll).toBe(0);
    s = back(s);
    expect(current(s)?.scroll).toBe(480);
  });

  it('setScroll ignores unknown ids and clamps negatives', () => {
    const s = trail('a.zz');
    expect(setScroll(s, 'nope', 10)).toBe(s);
    expect(setScroll(s, s.entries[0]!.id, -5)).toBe(s);
  });

  it('goToId jumps to an existing entry and ignores unknown ids', () => {
    const s = trail('a.zz', 'b.zz', 'c.zz');
    expect(current(goToId(s, s.entries[0]!.id))?.addr).toBe('a.zz');
    expect(goToId(s, 'nope')).toBe(s);
  });

  it('parseStack accepts a round trip and rejects garbage', () => {
    const s = back(trail('a.zz', 'b.zz'));
    expect(parseStack(JSON.parse(JSON.stringify(s)))).toEqual(s);
    expect(parseStack(null)).toBeNull();
    expect(parseStack({ entries: [], index: 0 })).toBeNull();
    expect(parseStack({ entries: [{ id: 1, addr: 'a' }], index: 0 })).toBeNull();
    expect(parseStack({ entries: [{ id: 'x', addr: 'a' }], index: 3 })).toBeNull();
  });
});
