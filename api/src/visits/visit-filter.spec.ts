import { escapeRegExp, filterWords, matchesNowhere, MAX_FILTER_LENGTH, MAX_FILTER_WORDS } from './visit-filter';

describe('filterWords', () => {
  it('splits on any whitespace and drops empties', () => {
    expect(filterWords('  field \t guide\n ')).toEqual(['field', 'guide']);
  });
  it('returns nothing for missing, empty, blank or non-string input', () => {
    for (const q of [undefined, null, '', '   ', 42, ['a'], {}]) expect(filterWords(q)).toEqual([]);
  });
  it('cuts the filter at 200 characters', () => {
    const words = filterWords('a'.repeat(500));
    expect(words).toHaveLength(1);
    expect(words[0]).toHaveLength(MAX_FILTER_LENGTH);
  });
  it('keeps at most 8 words', () => {
    expect(filterWords('1 2 3 4 5 6 7 8 9 10')).toHaveLength(MAX_FILTER_WORDS);
    expect(filterWords('1 2 3 4 5 6 7 8 9 10')[7]).toBe('8');
  });
  it('keeps the original case (matching is case-insensitive downstream)', () => {
    expect(filterWords('TidePool')).toEqual(['TidePool']);
  });
});

describe('escapeRegExp', () => {
  it('escapes every regex metacharacter so the text matches literally', () => {
    for (const text of ['.', '*', '+', '?', '^', '$', '{', '}', '(', ')', '|', '[', ']', '\\', '.*', '(a+)+$', '[a-z]+', 'a.b']) {
      const rx = new RegExp(escapeRegExp(text));
      expect(rx.test(text)).toBe(true);
      expect(rx.test(`xx${text}yy`)).toBe(true);
    }
  });
  it('does not match what the unescaped pattern would', () => {
    expect(new RegExp(escapeRegExp('a.b')).test('axb')).toBe(false);
    expect(new RegExp(escapeRegExp('.*')).test('anything')).toBe(false);
    expect(new RegExp(escapeRegExp('(a|b)')).test('a')).toBe(false);
  });
  it('leaves ordinary text alone', () => {
    expect(escapeRegExp('tidepool-zz_1')).toBe('tidepool-zz_1');
  });
});

describe('matchesNowhere', () => {
  it.each(['nowhere', 'NOWHERE', 'now', 'here', 'where', 'owh', 'n'])('%s matches the word nowhere', (w) => {
    expect(matchesNowhere(w)).toBe(true);
  });
  it.each(['somewhere', 'nowhere2', 'tide', 'nowherex', 'nope'])('%s does not', (w) => {
    expect(matchesNowhere(w)).toBe(false);
  });
});
