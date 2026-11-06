import { describe, expect, it } from 'vitest';
import { highlightTerms } from './highlight';

const joined = (segments: { text: string }[]) => segments.map((s) => s.text).join('');

describe('highlightTerms', () => {
  it('marks matches case-insensitively and keeps the original casing', () => {
    expect(highlightTerms('Tidepool: a field guide', 'tide')).toEqual([
      { text: 'Tide', match: true },
      { text: 'pool: a field guide', match: false },
    ]);
  });

  it('marks every word and every occurrence', () => {
    const segments = highlightTerms('Salt marsh, salt road', 'salt road');
    expect(segments.filter((s) => s.match).map((s) => s.text)).toEqual(['Salt', 'salt', 'road']);
    expect(joined(segments)).toBe('Salt marsh, salt road');
  });

  it('prefers the longer word when two overlap', () => {
    const segments = highlightTerms('tidepool', 'tide tidepool');
    expect(segments).toEqual([{ text: 'tidepool', match: true }]);
  });

  it('returns the text untouched for an empty query or empty text', () => {
    expect(highlightTerms('hello', '')).toEqual([{ text: 'hello', match: false }]);
    expect(highlightTerms('hello', '   ')).toEqual([{ text: 'hello', match: false }]);
    expect(highlightTerms('', 'x')).toEqual([{ text: '', match: false }]);
  });

  it('treats regex characters in the query as plain text', () => {
    const segments = highlightTerms('a.b (c) [d] a+b', '.* ( [ + \\');
    expect(joined(segments)).toBe('a.b (c) [d] a+b');
    expect(segments.some((s) => s.match)).toBe(true);
    expect(() => highlightTerms('x', '(((')).not.toThrow();
  });

  it('never loses or invents text, whatever the query', () => {
    const text = 'The quick brown fox — jumps over “the” lazy dog 123';
    for (const q of ['the', 'o', 'quick fox', '“the”', '123 dog', '—', 'zzz']) {
      expect(joined(highlightTerms(text, q))).toBe(text);
    }
  });

  it('matches unicode text', () => {
    expect(highlightTerms('Crème brûlée', 'brûlée')).toEqual([
      { text: 'Crème ', match: false },
      { text: 'brûlée', match: true },
    ]);
  });
});
