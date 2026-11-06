import type { VisitDto } from './types';

/**
 * Client-side filter for the history list. Every word typed must appear in the
 * visit's title, address, how it was reached, or "nowhere" for pages that were
 * not found. Case-insensitive; an empty filter keeps everything.
 */
export function filterVisits(items: VisitDto[], query: string): VisitDto[] {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (terms.length === 0) return items;
  return items.filter((visit) => {
    const haystack = [visit.title ?? '', visit.address, visit.via, visit.found ? '' : 'nowhere not found']
      .join(' ')
      .toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}
