import { describe, expect, it } from 'vitest';
import { dayLabel, groupVisitsByDay } from './group-by-day';
import type { VisitDto } from './types';

// Local-time constructors keep these tests independent of the machine's timezone.
const at = (y: number, mo: number, d: number, h: number, mi = 0) =>
  new Date(y, mo - 1, d, h, mi).toISOString();

const visit = (id: string, iso: string): VisitDto => ({
  id,
  address: `${id}.zz`,
  title: id,
  at: iso,
  via: 'link',
  found: true,
});

const now = new Date(2026, 10, 6, 15, 0); // 6 Nov 2026, local

describe('groupVisitsByDay', () => {
  it('groups newest-first visits into consecutive days', () => {
    const groups = groupVisitsByDay(
      [
        visit('a', at(2026, 11, 6, 14)),
        visit('b', at(2026, 11, 6, 9)),
        visit('c', at(2026, 11, 5, 23, 30)),
        visit('d', at(2026, 11, 2, 8)),
      ],
      now,
    );
    expect(groups.map((g) => [g.key, g.items.map((i) => i.id)])).toEqual([
      ['2026-11-06', ['a', 'b']],
      ['2026-11-05', ['c']],
      ['2026-11-02', ['d']],
    ]);
  });

  it('labels today and yesterday and spells out older days', () => {
    const groups = groupVisitsByDay(
      [visit('a', at(2026, 11, 6, 14)), visit('b', at(2026, 11, 5, 14)), visit('c', at(2026, 11, 2, 14))],
      now,
    );
    expect(groups.map((g) => g.label).slice(0, 2)).toEqual(['Today', 'Yesterday']);
    expect(groups[2]?.label).toMatch(/Monday.*2 November 2026/);
  });

  it('puts a late-night visit and the next morning in separate days', () => {
    const groups = groupVisitsByDay(
      [visit('a', at(2026, 11, 6, 0, 5)), visit('b', at(2026, 11, 5, 23, 55))],
      now,
    );
    expect(groups).toHaveLength(2);
  });

  it('returns nothing for no visits', () => {
    expect(groupVisitsByDay([], now)).toEqual([]);
  });

  it('dayLabel handles month boundaries', () => {
    expect(dayLabel(new Date(2026, 9, 31), new Date(2026, 10, 1))).toBe('Yesterday');
  });
});
