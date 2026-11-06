import { describe, expect, it } from 'vitest';
import { filterVisits } from './visit-filter';
import type { VisitDto } from './types';

const visit = (over: Partial<VisitDto> & { address: string }): VisitDto => ({
  id: over.address,
  title: over.address,
  at: '2026-11-02T09:00:00.000Z',
  via: 'link',
  found: true,
  ...over,
});

const items = [
  visit({ address: 'tidepool.zz', title: 'Tidepool: a field guide to the rock pools', via: 'typed' }),
  visit({ address: 'ironbread.zz', title: 'Iron Bread: sourdough from a cast-iron pot', via: 'search' }),
  visit({ address: 'ghostship.zz', title: null, found: false, via: 'typed' }),
  visit({ address: 'saltroad.zz', title: 'The Salt Road', via: 'back' }),
];

const addresses = (rows: VisitDto[]) => rows.map((v) => v.address);

describe('filterVisits', () => {
  it('keeps everything for an empty or blank filter', () => {
    expect(filterVisits(items, '')).toBe(items);
    expect(filterVisits(items, '   ')).toBe(items);
  });

  it('matches titles and addresses, ignoring case', () => {
    expect(addresses(filterVisits(items, 'SOURDOUGH'))).toEqual(['ironbread.zz']);
    expect(addresses(filterVisits(items, 'saltroad'))).toEqual(['saltroad.zz']);
  });

  it('requires every word', () => {
    expect(addresses(filterVisits(items, 'iron pot'))).toEqual(['ironbread.zz']);
    expect(addresses(filterVisits(items, 'iron field'))).toEqual([]);
  });

  it('matches how a page was reached', () => {
    expect(addresses(filterVisits(items, 'typed'))).toEqual(['tidepool.zz', 'ghostship.zz']);
    expect(addresses(filterVisits(items, 'back'))).toEqual(['saltroad.zz']);
  });

  it('finds pages that were not found', () => {
    expect(addresses(filterVisits(items, 'nowhere'))).toEqual(['ghostship.zz']);
    expect(addresses(filterVisits(items, 'not found'))).toEqual(['ghostship.zz']);
  });

  it('does not mutate its input and returns an empty list for no match', () => {
    const copy = [...items];
    expect(filterVisits(items, 'zzzz')).toEqual([]);
    expect(items).toEqual(copy);
  });
});
