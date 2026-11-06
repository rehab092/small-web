import { buildSnippet, queryTerms, stem, toTextSearch } from './snippet';

const plain = (segments: { text: string }[]) => segments.map((s) => s.text).join('');

describe('queryTerms', () => {
  it('lowercases, splits on non-letters and drops Mongo operators', () => {
    expect(queryTerms('Tide -salt "pool" $where')).toEqual(['tide', 'salt', 'pool', 'where']);
  });
  it('de-duplicates', () => {
    expect(queryTerms('tide TIDE tide')).toEqual(['tide']);
  });
  it('returns nothing for punctuation only', () => {
    expect(queryTerms('  --- !!! ')).toEqual([]);
  });
  it('caps the query length', () => {
    expect(toTextSearch(queryTerms('word '.repeat(500))).length).toBeLessThanOrEqual(200);
  });
});

describe('stem', () => {
  it('trims common endings but never to nothing', () => {
    expect(stem('tides')).toBe('tide');
    expect(stem('tide')).toBe('tide');
    expect(stem('is')).toBe('is');
  });
});

describe('buildSnippet', () => {
  const text = 'Twice a day the sea withdraws from the rocky shore. '.repeat(3) + 'The tide table says low water is at noon. ' + 'More text follows here. '.repeat(10);

  it('highlights the matching word, case-insensitively', () => {
    const seg = buildSnippet(text, ['tide']);
    expect(seg.filter((s) => s.match).map((s) => s.text.toLowerCase())).toContain('tide');
  });

  it('centres the window on the first match with ellipses', () => {
    const seg = buildSnippet(text, ['tide']);
    const out = plain(seg);
    expect(out.startsWith('…')).toBe(true);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThan(260);
    expect(out).toContain('tide table');
  });

  it('highlights inflected forms (tides)', () => {
    const seg = buildSnippet('The tides turn at dusk and the tide returns.', ['tide']);
    expect(seg.filter((s) => s.match).map((s) => s.text)).toEqual(['tides', 'tide']);
  });

  it('does not highlight inside other words', () => {
    const seg = buildSnippet('A subtide is not a tide.', ['tide']);
    expect(seg.filter((s) => s.match).map((s) => s.text)).toEqual(['tide']);
  });

  it('returns the start of the text unhighlighted when only the title matched', () => {
    const seg = buildSnippet('Plain words about bread and flour.', ['tide']);
    expect(seg).toEqual([{ text: 'Plain words about bread and flour.', match: false }]);
  });

  it('is HTML-inert: characters pass through untouched as text', () => {
    const seg = buildSnippet('<b>tide</b> & "quotes"', ['tide']);
    expect(plain(seg)).toBe('<b>tide</b> & "quotes"');
  });

  it('handles empty text', () => {
    expect(buildSnippet('', ['tide'])).toEqual([]);
  });
});
