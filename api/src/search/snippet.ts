/**
 * Search helpers: turn a user's query into safe Mongo $text input and build
 * structured snippet segments. Snippets are never HTML, so the web app can
 * render them without dangerouslySetInnerHTML.
 */
export interface SnippetSegment {
  text: string;
  match: boolean;
}

export const MAX_QUERY_LENGTH = 200;
const SNIPPET_LENGTH = 180;
const LEAD = 60;

/** Words of the query: letters and digits only. Drops operators (-, ", $) that Mongo would interpret. */
export function queryTerms(q: string): string[] {
  const terms = q.slice(0, MAX_QUERY_LENGTH).toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return [...new Set(terms)];
}

/** What we hand to $search: plain words, OR-ed by Mongo and ranked by textScore. */
export function toTextSearch(terms: string[]): string {
  return terms.join(' ');
}

/** Light stemming so "tides" / "tiding" / "tided" highlight for the query "tide". */
export function stem(term: string): string {
  const stripped = term.replace(/(?:ing|ed|ly)$/, '').replace(/(?<!s)s$/, '');
  return stripped.length >= 3 ? stripped : term;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matcher(terms: string[]): RegExp | null {
  if (terms.length === 0) return null;
  const parts = terms.map((t) => escapeRegExp(stem(t))).sort((a, b) => b.length - a.length);
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${parts.join('|')})[\\p{L}\\p{N}]*`, 'giu');
}

/** Cut a window of text around the first match and split it into plain / highlighted segments. */
export function buildSnippet(text: string, terms: string[]): SnippetSegment[] {
  const re = matcher(terms);
  const hit = re ? text.search(re) : -1;

  let start = 0;
  if (hit > LEAD) {
    start = hit - LEAD;
    const space = text.indexOf(' ', start);
    if (space !== -1 && space < hit) start = space + 1;
  }
  let end = Math.min(text.length, start + SNIPPET_LENGTH);
  if (end < text.length) {
    const space = text.lastIndexOf(' ', end);
    if (space > start + SNIPPET_LENGTH / 2) end = space;
  }

  const window = text.slice(start, end);
  const lead = start > 0 ? '… ' : '';
  const tail = end < text.length ? ' …' : '';
  const segments: SnippetSegment[] = [];
  const push = (t: string, match: boolean) => {
    if (!t) return;
    const last = segments[segments.length - 1];
    if (last && last.match === match) last.text += t;
    else segments.push({ text: t, match });
  };

  push(lead, false);
  const re2 = matcher(terms);
  let cursor = 0;
  if (re2) {
    for (const m of window.matchAll(re2)) {
      const idx = m.index ?? 0;
      push(window.slice(cursor, idx), false);
      push(m[0], true);
      cursor = idx + m[0].length;
    }
  }
  push(window.slice(cursor), false);
  push(tail, false);
  return segments;
}
