import { describe, expect, it } from 'vitest';
import {
  addressParts,
  classifyHref,
  internalPage,
  normalizeAddress,
  parsePublishAddr,
  parseSearchAddr,
  publishAddr,
  resolveTyped,
  searchAddr,
} from './address';

describe('normalizeAddress (vectors from docs/api.md)', () => {
  const cases: Array<[string, string | null]> = [
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
    ['tidepool.zz/about', null],
    [`${'a'.repeat(64)}.zz`, null],
    [`${'a.'.repeat(60)}zz`, null],
  ];
  it.each(cases)('%j -> %j', (input, expected) => {
    expect(normalizeAddress(input)).toBe(expected);
  });
});

describe('classifyHref', () => {
  it('recognises small-web addresses in any spelling', () => {
    expect(classifyHref('tidepool.zz')).toEqual({ kind: 'site', address: 'tidepool.zz' });
    expect(classifyHref('http://Ironbread.zz/')).toEqual({ kind: 'site', address: 'ironbread.zz' });
  });
  it('treats links to addresses that never existed like any other address', () => {
    expect(classifyHref('ghostship.zz')).toEqual({ kind: 'site', address: 'ghostship.zz' });
  });
  it('detects in-page anchors', () => {
    expect(classifyHref('#tides')).toEqual({ kind: 'anchor', id: 'tides' });
  });
  it('marks real-web URLs external and unsafe schemes blocked', () => {
    expect(classifyHref('https://example.com/x').kind).toBe('external');
    expect(classifyHref('example.com').kind).toBe('external');
    expect(classifyHref('javascript:alert(1)').kind).toBe('blocked');
    expect(classifyHref('data:text/html,<b>x</b>').kind).toBe('blocked');
    expect(classifyHref('mailto:a@b.co').kind).toBe('blocked');
  });
});

describe('resolveTyped', () => {
  it('navigates to addresses and about pages', () => {
    expect(resolveTyped(' Tidepool ')).toEqual({ kind: 'address', addr: 'tidepool.zz' });
    expect(resolveTyped('about:history')).toEqual({ kind: 'address', addr: 'about:history' });
  });
  it('reports real-web urls as external and never as a search', () => {
    expect(resolveTyped('https://example.com')).toEqual({
      kind: 'external',
      href: 'https://example.com',
    });
  });
  it('falls back to search for free text', () => {
    expect(resolveTyped('salt marsh tides')).toEqual({ kind: 'search', query: 'salt marsh tides' });
  });
  it('returns null for empty input', () => {
    expect(resolveTyped('   ')).toBeNull();
  });
});

describe('search addresses', () => {
  it('round-trips the query', () => {
    expect(parseSearchAddr(searchAddr('tide & pool'))).toBe('tide & pool');
    expect(parseSearchAddr('about:home')).toBeNull();
  });
});

describe('internal pages', () => {
  it('recognises the built-in pages and rejects unknown about: addresses', () => {
    expect(internalPage('about:home')).toBe('home');
    expect(internalPage('about:history')).toBe('history');
    expect(internalPage('about:search?q=tide')).toBe('search');
    expect(internalPage('about:publish')).toBe('publish');
    expect(internalPage('about:config')).toBeNull();
  });

  it('carries a prefilled address through the publish page', () => {
    expect(parsePublishAddr(publishAddr('ghostship.zz'))).toBe('ghostship.zz');
    expect(parsePublishAddr(publishAddr())).toBeNull();
    expect(parsePublishAddr('about:home')).toBeNull();
  });
});

describe('addressParts', () => {
  it('splits a site address into its name and .zz, with no invented scheme', () => {
    expect(addressParts('tidepool.zz')).toEqual({ scheme: '', host: 'tidepool', tld: '.zz' });
    expect(addressParts('a.b-c.zz')).toEqual({ scheme: '', host: 'a.b-c', tld: '.zz' });
  });

  it('draws built-in pages with their own scheme', () => {
    expect(addressParts('about:history')).toEqual({ scheme: 'about:', host: 'history', tld: '' });
  });

  it('leaves free text, partial input and other addresses alone', () => {
    expect(addressParts('')).toBeNull();
    expect(addressParts('tide')).toBeNull(); // not an address as typed
    expect(addressParts('salt marsh')).toBeNull();
    expect(addressParts('example.com')).toBeNull();
    expect(addressParts('TidePool.zz')).toBeNull(); // only the normalized form is styled
    expect(addressParts('about:search?q=tide')).toBeNull();
  });
});
