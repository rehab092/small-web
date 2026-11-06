import { describe, expect, it } from 'vitest';
import { relativeTime } from './relative-time';

const now = new Date('2026-11-06T12:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('relativeTime', () => {
  it('says just now for the last moments, and for a slightly fast clock', () => {
    expect(relativeTime(ago(5 * SEC), now)).toBe('just now');
    expect(relativeTime(ago(44 * SEC), now)).toBe('just now');
    expect(relativeTime(ago(-30 * SEC), now)).toBe('just now');
  });

  it('counts minutes, never saying 0', () => {
    expect(relativeTime(ago(46 * SEC), now)).toBe('1 min ago');
    expect(relativeTime(ago(5 * MIN), now)).toBe('5 min ago');
    expect(relativeTime(ago(59 * MIN), now)).toBe('59 min ago');
  });

  it('counts hours and days', () => {
    expect(relativeTime(ago(60 * MIN), now)).toBe('1 h ago');
    expect(relativeTime(ago(3 * HOUR), now)).toBe('3 h ago');
    expect(relativeTime(ago(23 * HOUR), now)).toBe('23 h ago');
    expect(relativeTime(ago(24 * HOUR), now)).toBe('1 d ago');
    expect(relativeTime(ago(6 * DAY), now)).toBe('6 d ago');
  });

  it('gives up after a week so the date can speak', () => {
    expect(relativeTime(ago(7 * DAY), now)).toBeNull();
    expect(relativeTime(ago(40 * DAY), now)).toBeNull();
  });

  it('returns null for something that is not a date', () => {
    expect(relativeTime('not a date', now)).toBeNull();
  });
});
