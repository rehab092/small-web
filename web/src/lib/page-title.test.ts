import { describe, expect, it } from 'vitest';
import { HISTORY_ADDR, HOME_ADDR, PUBLISH_ADDR, publishAddr, searchAddr } from './address';
import { pageTitle } from './page-title';

describe('pageTitle', () => {
  it('uses the site title', () => {
    expect(pageTitle({ kind: 'site', title: 'The Salt Road' })).toBe('The Salt Road · Small Web');
  });

  it('names Nowhere, errors and pages still loading, never falling back to a generic title', () => {
    expect(pageTitle({ kind: 'nowhere' })).toBe('Nowhere · Small Web');
    expect(pageTitle({ kind: 'error' })).toBe('Could not load · Small Web');
    expect(pageTitle({ kind: 'loading', addr: 'saltroad.zz' })).toBe('saltroad.zz · Small Web');
  });

  it('titles each built-in page', () => {
    expect(pageTitle({ kind: 'internal', addr: HOME_ADDR })).toBe('Small Web');
    expect(pageTitle({ kind: 'internal', addr: HISTORY_ADDR })).toBe('History · Small Web');
    expect(pageTitle({ kind: 'internal', addr: PUBLISH_ADDR })).toBe('Publish · Small Web');
    expect(pageTitle({ kind: 'internal', addr: publishAddr('ghost.zz') })).toBe('Publish · Small Web');
  });

  it('puts the query in the title of a search', () => {
    expect(pageTitle({ kind: 'internal', addr: searchAddr('salt marsh') })).toBe('Search: salt marsh · Small Web');
    expect(pageTitle({ kind: 'internal', addr: searchAddr('') })).toBe('Search · Small Web');
  });
});
