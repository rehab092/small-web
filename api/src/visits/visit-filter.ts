/**
 * Pure helpers for GET /people/:id/visits?q=. A visit matches when EVERY word of the query matches at
 * least one of: the visited address, the page's current title, how the visit happened (via), or the word
 * "nowhere" (for visits to addresses with no site). All matching is case-insensitive substring matching.
 */
export const MAX_FILTER_LENGTH = 200;
export const MAX_FILTER_WORDS = 8;

/** The pseudo-word that matches visits to addresses that led nowhere (found = false). */
export const NOWHERE_WORD = 'nowhere';

/** Words of the filter: trimmed, at most 200 characters, split on whitespace, at most 8 words. */
export function filterWords(q: unknown): string[] {
  if (typeof q !== 'string') return [];
  return q.trim().slice(0, MAX_FILTER_LENGTH).split(/\s+/).filter(Boolean).slice(0, MAX_FILTER_WORDS);
}

/** Make user text safe to put inside a RegExp: it matches literally, whatever characters it contains. */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** True when the word is a substring of "nowhere", i.e. it should also match found = false rows. */
export function matchesNowhere(word: string): boolean {
  return NOWHERE_WORD.includes(word.toLowerCase());
}
