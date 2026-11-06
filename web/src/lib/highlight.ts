import type { SnippetSegment } from './types';

const MAX_TERMS = 8;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Split `text` into segments, marking the parts that match any word of `query`
 * (case-insensitive, whole query words as typed). Used for result titles and
 * addresses, which the API does not segment; snippets arrive already segmented.
 * Always returns segments whose text joins back to `text`.
 */
export function highlightTerms(text: string, query: string): SnippetSegment[] {
  const terms = [
    ...new Set(
      query
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 0),
    ),
  ]
    .sort((a, b) => b.length - a.length) // longest first, so "tidepool" wins over "tide"
    .slice(0, MAX_TERMS);
  if (terms.length === 0 || text === '') return [{ text, match: false }];

  const pattern = new RegExp(terms.map(escapeRegExp).join('|'), 'gi');
  const segments: SnippetSegment[] = [];
  let last = 0;
  for (const found of text.matchAll(pattern)) {
    const start = found.index ?? 0;
    if (found[0] === '') continue;
    if (start > last) segments.push({ text: text.slice(last, start), match: false });
    segments.push({ text: found[0], match: true });
    last = start + found[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last), match: false });
  return segments.length > 0 ? segments : [{ text, match: false }];
}
