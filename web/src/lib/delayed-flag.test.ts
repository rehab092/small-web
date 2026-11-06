import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DelayedFlag } from './delayed-flag';

describe('DelayedFlag', () => {
  let changes: boolean[];
  let flag: DelayedFlag;

  beforeEach(() => {
    vi.useFakeTimers();
    changes = [];
    flag = new DelayedFlag((v) => changes.push(v), 150, 350, () => Date.now());
  });

  afterEach(() => {
    flag.dispose();
    vi.useRealTimers();
  });

  it('never shows for work that finishes within the delay', () => {
    flag.set(true);
    vi.advanceTimersByTime(149);
    flag.set(false);
    vi.advanceTimersByTime(1000);
    expect(changes).toEqual([]);
  });

  it('shows after the delay when the work is still going', () => {
    flag.set(true);
    vi.advanceTimersByTime(150);
    expect(changes).toEqual([true]);
  });

  it('stays visible for the minimum time, then hides', () => {
    flag.set(true);
    vi.advanceTimersByTime(150); // shown at t=150
    vi.advanceTimersByTime(50);
    flag.set(false); // wanted off at t=200: visible for 50ms so far, 300ms of the 350 are left
    vi.advanceTimersByTime(299);
    expect(changes).toEqual([true]);
    vi.advanceTimersByTime(1);
    expect(changes).toEqual([true, false]);
  });

  it('hides at once when it was visible long enough already', () => {
    flag.set(true);
    vi.advanceTimersByTime(150);
    vi.advanceTimersByTime(500);
    flag.set(false);
    vi.advanceTimersByTime(0);
    expect(changes).toEqual([true, false]);
  });

  it('a new wish while hiding keeps it visible without a blink', () => {
    flag.set(true);
    vi.advanceTimersByTime(150);
    flag.set(false);
    vi.advanceTimersByTime(100);
    flag.set(true); // wanted again before the hide fired
    vi.advanceTimersByTime(1000);
    expect(changes).toEqual([true]);
  });

  it('repeated identical calls do not stack timers', () => {
    flag.set(true);
    flag.set(true);
    flag.set(true);
    vi.advanceTimersByTime(150);
    expect(changes).toEqual([true]);
  });

  it('dispose cancels everything pending', () => {
    flag.set(true);
    flag.dispose();
    vi.advanceTimersByTime(1000);
    expect(changes).toEqual([]);
  });
});
