/**
 * API changes from the reviewer critique: GET /resolve, GET /people/:id/visits?q=, and the limit ceiling.
 * (POST /sites/preview has its own file, preview.spec.ts.)
 */
import request from 'supertest';
import { startApp, TestApp } from './helpers';

type Visit = { id: string; address: string; title: string | null; at: string; via: string; found: boolean };

describe('reviewer-driven API', () => {
  let t: TestApp;
  const http = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await startApp();
    await t.seed.run();
  });
  afterAll(async () => {
    await t.close();
  });

  describe('GET /resolve?address=', () => {
    const resolve = (address: string) => http().get(`/resolve?address=${encodeURIComponent(address)}`);

    it('answers 200 { address, found: true } for a site that exists', async () => {
      const res = await resolve('tidepool.zz').expect(200);
      expect(res.body).toEqual({ address: 'tidepool.zz', found: true });
    });

    it('answers 200 { address, found: false } (not 404) for the seeded dead links', async () => {
      for (const dead of ['lost-lighthouse.zz', 'the-deep-archive.zz', 'old-wells.zz', 'madeupghost.zz']) {
        const res = await resolve(dead).expect(200);
        expect(res.body).toEqual({ address: dead, found: false });
      }
    });

    it('keeps GET /sites/:address as a 404 for the same address', async () => {
      await http().get('/sites/old-wells.zz').expect(404);
      await resolve('old-wells.zz').expect(200);
    });

    it.each([
      ['TidePool.ZZ', 'tidepool.zz'],
      ['http://tidepool.zz/', 'tidepool.zz'],
      ['tidepool', 'tidepool.zz'],
      ['tidepool.zz/reading', 'tidepool.zz'],
      ['https://Tidepool.zz/a/b?x#y', 'tidepool.zz'],
    ])('normalizes %s to %s before looking it up', async (input, normalized) => {
      expect((await resolve(input).expect(200)).body).toEqual({ address: normalized, found: true });
    });

    it.each([[''], ['   '], ['example.com'], ['a b'], ['a b/c'], ['-bad.zz'], ['javascript:alert(1)'], ['//x.zz'], ['example.com/x.zz']])(
      'answers 400 with fields.address for the bad address %j, like the other routes',
      async (address) => {
        const res = await resolve(address).expect(400);
        expect(res.body).toMatchObject({ statusCode: 400, error: 'Bad Request', message: 'Validation failed' });
        expect(res.body.fields.address).toBeDefined();
      },
    );

    it('answers 400 when the address is missing or sent twice', async () => {
      expect((await http().get('/resolve').expect(400)).body.fields.address).toBeDefined();
      await http().get('/resolve?address=a.zz&address=b.zz').expect(400);
    });

    it('does not record a visit, and a newly published site flips to found: true', async () => {
      const before = (await http().get('/people/wen-zhao/visits?limit=100').expect(200)).body.items.length;
      await resolve('brand-new.zz').expect(200);
      expect((await http().get('/people/wen-zhao/visits?limit=100').expect(200)).body.items.length).toBe(before);
      expect((await resolve('brand-new.zz')).body.found).toBe(false);
      await http().post('/sites').send({ address: 'brand-new.zz', title: 'Brand new', html: '<p>fresh</p>', authorId: 'wen-zhao' }).expect(201);
      expect((await resolve('brand-new.zz')).body).toEqual({ address: 'brand-new.zz', found: true });
    });

    it('returns exactly address and found, nothing else', async () => {
      expect(Object.keys((await resolve('tidepool.zz')).body).sort()).toEqual(['address', 'found']);
    });
  });

  describe('GET /people/:id/visits?q= (filters the whole history on the server)', () => {
    const PERSON = 'tomas-reyes';

    /** Follow nextCursor to the end. Returns every row for this q, in the order served. */
    async function pageAll(q: string | undefined, limit: number, person = PERSON): Promise<{ rows: Visit[]; pages: number }> {
      const rows: Visit[] = [];
      let cursor: string | null = null;
      let pages = 0;
      for (; pages < 500; ) {
        const qs: string = [`limit=${limit}`, q === undefined ? '' : `q=${encodeURIComponent(q)}`, cursor ? `cursor=${cursor}` : ''].filter(Boolean).join('&');
        const res: request.Response = await http().get(`/people/${person}/visits?${qs}`).expect(200);
        rows.push(...res.body.items);
        pages++;
        cursor = res.body.nextCursor;
        if (!cursor) return { rows, pages };
      }
      throw new Error('cursor never ended');
    }

    // The documented rule, written independently of the implementation: every word must match
    // the address, the current title, the way of arriving, or the word "nowhere" for found=false rows.
    const words = (q: string) => q.trim().slice(0, 200).split(/\s+/).filter(Boolean).slice(0, 8);
    const matches = (v: Visit, word: string) => {
      const w = word.toLowerCase();
      return v.address.toLowerCase().includes(w) || v.via.toLowerCase().includes(w) || (v.title ?? '').toLowerCase().includes(w) || (!v.found && 'nowhere'.includes(w));
    };
    const oracle = (all: Visit[], q: string) => all.filter((v) => words(q).every((w) => matches(v, w)));

    /** The address this person visited most: guarantees a filter with enough matches to span several pages. */
    const busiestAddress = (rows: Visit[]) => {
      const counts = new Map<string, number>();
      for (const v of rows) counts.set(v.address, (counts.get(v.address) ?? 0) + 1);
      return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
    };

    let everything: Visit[];
    beforeAll(async () => {
      everything = (await pageAll(undefined, 100)).rows;
    });

    it('has a long enough history to make paging meaningful', () => {
      expect(everything.length).toBeGreaterThan(40);
    });

    it('is the same as no filter when q is missing, empty or only whitespace', async () => {
      const ids = (rows: Visit[]) => rows.map((v) => v.id);
      expect(ids((await pageAll('', 100)).rows)).toEqual(ids(everything));
      expect(ids((await pageAll('   \t ', 100)).rows)).toEqual(ids(everything));
    });

    it.each([
      ['saltroad'], // address
      ['SALTROAD'], // case-insensitive
      ['salt'], // substring of an address and a title
      ['field guide'], // two words, matches the TITLE of tidepool.zz and not its address
      ['salt road'], // two words, both in one title
      ['tide'],
      ['back'], // via
      ['forward'],
      ['history'],
      ['typed'],
      ['nowhere'], // the pseudo-word for found=false rows
      ['now'], // a substring of nowhere
      ['lighthouse'], // an address that led nowhere
      ['link cartographers'], // via AND address/title
      ['typed tidepool'],
      ['back nowhere'], // matches nothing together if no row is both
      ['.zz'],
      ['zzz-matches-nothing'],
      ['a b c d e f g h i j k'], // more than 8 words: only the first 8 count
    ])('finds exactly the rows the rule describes, across every page: %j', async (q) => {
      const expected = oracle(everything, q);
      const { rows } = await pageAll(q, 3);
      expect(rows.map((v) => v.id)).toEqual(expected.map((v) => v.id));
    });

    it('searches ACROSS pages, not within the first one (the critique: matches on older pages were invisible)', async () => {
      const q = busiestAddress(everything);
      const expected = oracle(everything, q);
      expect(expected.length).toBeGreaterThan(2);
      const { rows, pages } = await pageAll(q, 2);
      expect(rows).toHaveLength(expected.length);
      expect(pages).toBeGreaterThan(1);
      // and the oldest match is reachable even though it is far down the unfiltered history
      const oldestIndex = everything.findIndex((v) => v.id === expected[expected.length - 1].id);
      expect(oldestIndex).toBeGreaterThan(2);
      expect(rows[rows.length - 1].id).toBe(expected[expected.length - 1].id);
    });

    it('matches the current page title, which lives on the site and not on the visit', async () => {
      const { rows } = await pageAll('field guide', 100);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((v) => v.address === 'tidepool.zz')).toBe(true);
      expect(rows.some((v) => v.address.includes('field'))).toBe(false);
    });

    it('sees a title published after the visit was recorded', async () => {
      await http().post('/sites').send({ address: 'quokka-corner.zz', title: 'Marsupial Gazette', html: '<p>smiling animals</p>', authorId: 'odile-mercier' }).expect(201);
      await http().post(`/people/${PERSON}/visits`).send({ address: 'quokka-corner.zz', via: 'typed' }).expect(201);
      const { rows } = await pageAll('marsupial', 10);
      expect(rows.map((v) => v.address)).toEqual(['quokka-corner.zz']);
    });

    it('keeps newest-first order within the filtered results', async () => {
      const { rows } = await pageAll('.zz', 7);
      const times = rows.map((v) => Date.parse(v.at));
      expect(times).toEqual([...times].sort((a, b) => b - a));
    });

    it('matches nowhere rows only, for the word nowhere', async () => {
      const { rows } = await pageAll('nowhere', 100);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((v) => v.found === false)).toBe(true);
      expect(rows).toHaveLength(everything.filter((v) => !v.found).length);
    });

    it('treats regex characters as plain text: no error, no accidental wildcard', async () => {
      for (const q of ['(', ')', '[', ']', '{', '}', '*', '+', '?', '\\', '^', '$', '|', '.*', 'a|b', '(?i)', '[a-z]+', '.+', '\\d', '(a+)+$', '(((((']) {
        const { rows } = await pageAll(q, 100);
        expect(rows.map((v) => v.id)).toEqual(oracle(everything, q).map((v) => v.id)); // literal substring semantics
      }
      expect((await pageAll('.*', 100)).rows).toHaveLength(0); // "*" is not in any address, so ".*" matches nothing
      const now = (await pageAll(undefined, 100)).rows; // earlier tests add visits, so compare with the history as it is now
      expect((await pageAll('.', 100)).rows).toHaveLength(now.length); // "." IS in every address: literal, not wildcard
    });

    it('does not let a Mongo operator in q change the query', async () => {
      for (const q of ['{"$ne":null}', '$where', '$regex', '{ $gt: "" }']) {
        const res = await http().get(`/people/${PERSON}/visits?q=${encodeURIComponent(q)}`).expect(200);
        expect(res.body.items).toEqual([]);
      }
    });

    it('accepts a 200-character filter and ignores the rest of a longer one', async () => {
      const long = `tidepool ${'x'.repeat(190)}`;
      await http().get(`/people/${PERSON}/visits?q=${encodeURIComponent(long)}`).expect(200);
      const huge = 'tidepool ' + 'y'.repeat(5000);
      const res = await http().get(`/people/${PERSON}/visits?q=${encodeURIComponent(huge)}`).expect(200);
      expect(res.body.items).toEqual([]); // "yyyy…" is cut at 200 characters, still matches nothing
    });

    it('uses the first value when q is repeated (not the literal text "a,b", which would match nothing)', async () => {
      const single = (await http().get(`/people/${PERSON}/visits?q=saltroad&limit=100`).expect(200)).body.items;
      const repeated = (await http().get(`/people/${PERSON}/visits?q=saltroad&q=zzz-nothing&limit=100`).expect(200)).body.items;
      expect(single.length).toBeGreaterThan(0);
      expect(repeated.map((v: Visit) => v.id)).toEqual(single.map((v: Visit) => v.id));
    });

    it('keeps the cursor valid for the same q across requests, and never leaks another person', async () => {
      const q = busiestAddress(everything);
      const first = (await http().get(`/people/${PERSON}/visits?q=${encodeURIComponent(q)}&limit=2`).expect(200)).body;
      expect(first.nextCursor).not.toBeNull();
      const second = (await http().get(`/people/${PERSON}/visits?q=${encodeURIComponent(q)}&limit=2&cursor=${first.nextCursor}`).expect(200)).body;
      expect(second.items.map((v: Visit) => v.id)).not.toContain(first.items[0].id);
      const ines = (await pageAll(q, 100, 'ines-varga')).rows;
      const tomasIds = new Set((await pageAll(q, 100)).rows.map((v) => v.id));
      expect(ines.some((v) => tomasIds.has(v.id))).toBe(false);
    });

    it('still answers 404 for an unknown person and 400 for a bad cursor when q is given', async () => {
      await http().get('/people/nobody/visits?q=tide').expect(404);
      await http().get(`/people/${PERSON}/visits?q=tide&cursor=garbage`).expect(400);
    });
  });

  describe('limit ceiling on visits', () => {
    it('returns exactly 100 for limit=200 or 101 when there are more than 100 visits, and says there is more', async () => {
      const person = 'kofi-mensah';
      const posts = Array.from({ length: 120 }, (_, i) => ({ address: i % 2 ? 'tidepool.zz' : 'saltroad.zz', via: 'link' }));
      for (let i = 0; i < posts.length; i += 12) {
        await Promise.all(posts.slice(i, i + 12).map((body) => http().post(`/people/${person}/visits`).send(body).expect(201)));
      }
      for (const limit of ['200', '101', '100000']) {
        const res = await http().get(`/people/${person}/visits?limit=${limit}`).expect(200);
        expect(res.body.items).toHaveLength(100);
        expect(res.body.nextCursor).not.toBeNull();
      }
      expect((await http().get(`/people/${person}/visits?limit=100`).expect(200)).body.items).toHaveLength(100);
      expect((await http().get(`/people/${person}/visits?limit=99`).expect(200)).body.items).toHaveLength(99);
      expect((await http().get(`/people/${person}/visits?limit=0`).expect(200)).body.items).toHaveLength(1);
    });
  });
});
