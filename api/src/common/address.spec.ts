import { normalizeAddress, toAddress } from './address';

/** These vectors are copied verbatim into docs/api.md; the web app must agree with every row. */
const VECTORS: Array<[input: string, address: string | null]> = [
  ['tidepool.zz', 'tidepool.zz'],
  ['  TidePool.ZZ/ ', 'tidepool.zz'],
  ['http://tidepool.zz/', 'tidepool.zz'],
  ['https://Tidepool.zz//', 'tidepool.zz'],
  ['web://tidepool.zz', 'tidepool.zz'],
  ['tidepool', 'tidepool.zz'],
  ['tidepool.zz#top', 'tidepool.zz'],
  ['tidepool.zz?x=1', 'tidepool.zz'],
  ['a.b-c.zz', 'a.b-c.zz'],
  ['-bad.zz', null],
  ['bad-.zz', null],
  ['example.com', null],
  ['tide pool.zz', null],
  ['', null],
  ['   ', null],
  ['javascript:alert(1)', null],
  ['.zz', null],
  ['zz', 'zz.zz'],
  ['a'.repeat(64) + '.zz', null],
];

describe('normalizeAddress', () => {
  it.each(VECTORS)('%j -> %j', (input, expected) => {
    expect(toAddress(input)).toBe(expected);
    expect(normalizeAddress(input).valid).toBe(expected !== null);
  });

  it('rejects non-strings', () => {
    expect(normalizeAddress(undefined).valid).toBe(false);
    expect(normalizeAddress(42).valid).toBe(false);
    expect(normalizeAddress(null).valid).toBe(false);
  });

  it('rejects addresses longer than 100 characters', () => {
    const long = `${'a'.repeat(60)}.${'b'.repeat(60)}.zz`;
    expect(toAddress(long)).toBeNull();
  });

  it('is idempotent', () => {
    for (const [, address] of VECTORS) {
      if (address) expect(toAddress(address)).toBe(address);
    }
  });
});
