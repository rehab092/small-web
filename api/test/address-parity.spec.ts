/**
 * The web app deliberately re-implements address normalization (web/src/lib/address.ts) so the address
 * bar and link clicks never need a round trip. This test is what keeps the two identical: it feeds
 * thousands of generated inputs through BOTH and requires the same answer for every one. If either
 * side changes a rule without the other, this fails and names the input.
 */
import { toAddress } from '../src/common/address';
import { normalizeAddress as webNormalize } from '../../web/src/lib/address';

const SCHEMES = ['', 'http://', 'https://', 'HTTP://', 'web://', 'ftp://', '//', '/', 'mailto:', 'javascript:'];
const HOSTS = [
  'tidepool.zz', 'Tide-Pool.ZZ', 'tidepool', 'a.b.zz', 'a.b-c.zz', '-x.zz', 'x-.zz', 'example.com', 'a b.zz', '',
  'zz', '.zz', 'a..zz', 'xn--ls8h.zz', 'UPPER', 'a_b.zz', 'tidepool.zz.', 'tide pool', '1.2.3.4', 'x'.repeat(64) + '.zz',
  `${'a'.repeat(60)}.${'b'.repeat(60)}.zz`, 'ünï.zz', 'tide%70ool.zz', 'tidepool.zzz',
];
const SUFFIXES = [
  '', '/', '//', '/a', '/a/b?x#y', '?q', '#f', '/?q=1', '/#top', '/x.zz', ':80', ':80/x', '@evil', '\\x', '/ ', ' /x',
  '/..', '/%2e', '?', '#', '/a b', '\t',
];
const PADDING = ['', '  ', '\t', '\n'];

describe('address normalization: API and web agree', () => {
  const inputs: string[] = [];
  for (const pad of PADDING) for (const scheme of SCHEMES) for (const host of HOSTS) for (const suffix of SUFFIXES) inputs.push(`${pad}${scheme}${host}${suffix}${pad}`);

  it(`gives the same answer for all ${inputs.length} generated inputs`, () => {
    const disagreements: string[] = [];
    for (const input of inputs) {
      const api = toAddress(input);
      const web = webNormalize(input);
      if (api !== web) disagreements.push(`${JSON.stringify(input)}: api=${JSON.stringify(api)} web=${JSON.stringify(web)}`);
    }
    expect(disagreements.slice(0, 10)).toEqual([]);
    expect(disagreements).toHaveLength(0);
  });

  it('actually exercises both outcomes (the generator is not trivially all-invalid)', () => {
    const valid = inputs.filter((i) => toAddress(i) !== null).length;
    expect(valid).toBeGreaterThan(500);
    expect(valid).toBeLessThan(inputs.length - 500);
  });

  it('agrees on the documented vectors, including the path rule', () => {
    const documented: Array<[string, string | null]> = [
      ['tidepool.zz', 'tidepool.zz'],
      ['  TidePool.ZZ/ ', 'tidepool.zz'],
      ['tidepool.zz/reading', 'tidepool.zz'],
      ['https://Tidepool.zz/a/b?x#y', 'tidepool.zz'],
      ['tidepool/x', 'tidepool.zz'],
      ['//x.zz', null],
      ['/x.zz', null],
      ['example.com/x.zz', null],
      ['a b/c', null],
    ];
    for (const [input, expected] of documented) {
      expect(toAddress(input)).toBe(expected);
      expect(webNormalize(input)).toBe(expected);
    }
  });
});
