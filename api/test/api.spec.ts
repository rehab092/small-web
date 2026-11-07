import request from 'supertest';
import { EMPTY_AFTER_SANITIZING, NOTHING_TO_SHOW_MESSAGE } from './fixtures';
import { startApp, TestApp } from './helpers';

describe('API (seeded database)', () => {
  let t: TestApp;
  const http = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await startApp();
    await t.seed.run();
  });
  afterAll(async () => {
    await t.close();
  });

  describe('GET /sites/:address', () => {
    it('returns a seeded site with its author and sanitized html', async () => {
      const res = await http().get('/sites/tidepool.zz').expect(200);
      expect(res.body).toMatchObject({ address: 'tidepool.zz', author: { id: 'ines-varga', name: 'Ines Varga' }, revision: 1 });
      expect(res.body.title).toMatch(/Tidepool/);
      expect(res.body.html).toContain('href="cartographers.zz"');
      expect(res.body.html).not.toMatch(/<script/i);
    });

    it.each(['TidePool.ZZ', 'http://tidepool.zz/', 'tidepool', 'https://tidepool.zz//'])('normalizes %s', async (raw) => {
      const res = await http().get(`/sites/${encodeURIComponent(raw)}`).expect(200);
      expect(res.body.address).toBe('tidepool.zz');
    });

    it('answers 404 "nowhere" for addresses that never existed (the seeded dead links)', async () => {
      for (const dead of ['lost-lighthouse.zz', 'the-deep-archive.zz', 'old-wells.zz']) {
        const res = await http().get(`/sites/${dead}`).expect(404);
        expect(res.body).toEqual({ statusCode: 404, error: 'Not Found', message: 'nowhere', address: dead });
      }
    });

    it('answers 404 "nowhere" for syntactically invalid addresses too', async () => {
      const res = await http().get('/sites/' + encodeURIComponent('example.com')).expect(404);
      expect(res.body.message).toBe('nowhere');
    });
  });

  describe('GET /sites', () => {
    it('lists the directory sorted by address', async () => {
      const res = await http().get('/sites').expect(200);
      expect(res.body.total).toBeGreaterThanOrEqual(10);
      const addresses = res.body.items.map((i: { address: string }) => i.address);
      expect(addresses).toEqual([...addresses].sort());
    });
    it('pages', async () => {
      const res = await http().get('/sites?limit=3&offset=2').expect(200);
      expect(res.body.items).toHaveLength(3);
    });
    it('rejects a limit that is not an integer with a field error', async () => {
      for (const bad of ['abc', '1.5', '1e3x', 'NaN']) {
        const res = await http().get(`/sites?limit=${bad}`).expect(400);
        expect(res.body.fields.limit).toBeDefined();
      }
    });
    it('clamps an out-of-range limit to [1, 100] instead of failing', async () => {
      expect((await http().get('/sites?limit=0').expect(200)).body.items).toHaveLength(1);
      expect((await http().get('/sites?limit=-5').expect(200)).body.items).toHaveLength(1);
      const big = (await http().get('/sites?limit=100000').expect(200)).body;
      expect(big.items.length).toBe(Math.min(100, big.total));
    });
  });

  describe('POST /sites (publish)', () => {
    const body = { address: 'driftwood.zz', title: 'Driftwood', html: '<h1>Driftwood</h1><p>Silver wood on a grey beach.</p>', authorId: 'wen-zhao' };

    it('publishes, then the site can be fetched and is found by search', async () => {
      const created = await http().post('/sites').send(body).expect(201);
      expect(created.body).toMatchObject({ address: 'driftwood.zz', revision: 1, author: { id: 'wen-zhao' } });
      await http().get('/sites/driftwood.zz').expect(200);
      const found = await http().get('/search?q=driftwood').expect(200);
      expect(found.body.results[0].address).toBe('driftwood.zz');
    });

    it('answers 409 for a duplicate address, even spelled differently', async () => {
      await http().post('/sites').send({ ...body, address: 'HTTP://Driftwood.ZZ/' }).expect(409);
      await http().post('/sites').send({ ...body, address: 'tidepool.zz' }).expect(409);
    });

    it('normalizes the stored address', async () => {
      const res = await http().post('/sites').send({ ...body, address: '  HTTPS://Pebbles.ZZ/ ', title: 'Pebbles' }).expect(201);
      expect(res.body.address).toBe('pebbles.zz');
    });

    it.each([['example.com'], ['has space.zz'], [''], ['-x.zz']])('rejects invalid address %j with a field error', async (address) => {
      const res = await http().post('/sites').send({ ...body, address }).expect(400);
      expect(res.body.fields.address).toBeDefined();
    });

    it('reports every bad field at once, so a form can show all errors together', async () => {
      const res = await http().post('/sites').send({ address: 'example.com', title: '', html: '', authorId: 'kofi-mensah' }).expect(400);
      expect(Object.keys(res.body.fields).sort()).toEqual(['address', 'html', 'title']);
    });

    it('rejects empty title, empty html and unknown fields are ignored', async () => {
      const res = await http().post('/sites').send({ ...body, address: 'x1.zz', title: '   ', html: '' }).expect(400);
      expect(res.body.fields).toHaveProperty('title');
      expect(res.body.fields).toHaveProperty('html');
      await http().post('/sites').send({ ...body, address: 'x2.zz', extra: 'ignored' }).expect(201);
    });

    it('rejects html over 100 000 characters but accepts exactly the limit', async () => {
      const res = await http().post('/sites').send({ ...body, address: 'big1.zz', html: '<p>' + 'a'.repeat(100_001) + '</p>' }).expect(400);
      expect(res.body.fields.html).toBeDefined();
      await http().post('/sites').send({ ...body, address: 'big2.zz', html: 'a'.repeat(100_000) }).expect(201);
    });

    it('answers 413 for a request body over 1 MB', async () => {
      const res = await http().post('/sites').send({ ...body, address: 'huge.zz', html: 'a'.repeat(1_200_000) }).expect(413);
      expect(res.body.statusCode).toBe(413);
    });

    it('rejects an author who is not an author, and an unknown author', async () => {
      const reader = await http().post('/sites').send({ ...body, address: 'kofi1.zz', authorId: 'kofi-mensah' }).expect(400);
      expect(reader.body.fields.authorId).toBeDefined();
      await http().post('/sites').send({ ...body, address: 'ghost1.zz', authorId: 'nobody' }).expect(400);
    });

    it('stores only sanitized html', async () => {
      const evil = '<p>hi</p><script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">x</a><iframe src="https://e.example"></iframe>';
      const res = await http().post('/sites').send({ ...body, address: 'evil.zz', title: 'Evil', html: evil }).expect(201);
      expect(res.body.html).not.toMatch(/<script|onerror|javascript:|<iframe/i);
      const again = await http().get('/sites/evil.zz').expect(200);
      expect(again.body.html).toBe(res.body.html);
    });

    it('returns a JSON validation shape with statusCode, error, message and fields', async () => {
      const res = await http().post('/sites').send({}).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400, error: 'Bad Request', message: 'Validation failed' });
      expect(Object.keys(res.body.fields)).toEqual(expect.arrayContaining(['address', 'title', 'html', 'authorId']));
    });

    it('rejects malformed JSON as 400, not 500', async () => {
      const res = await http().post('/sites').set('Content-Type', 'application/json').send('{"address": ').expect(400);
      expect(res.body.statusCode).toBe(400);
    });
  });

  describe('content that is empty after sanitizing (was a 500 on POST, and stored html="" on PUT)', () => {
    const MESSAGE = NOTHING_TO_SHOW_MESSAGE;

    it.each(EMPTY_AFTER_SANITIZING)('POST answers 400 with fields.html, not 500: %s', async (_name, html) => {
      const res = await http().post('/sites').send({ address: 'emptyish.zz', title: 'Empty', html, authorId: 'wen-zhao' }).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400, error: 'Bad Request', message: 'Validation failed' });
      expect(res.body.fields.html).toEqual([MESSAGE]);
      await http().get('/sites/emptyish.zz').expect(404); // nothing was stored
    });

    it.each(EMPTY_AFTER_SANITIZING)('PUT answers 400 with fields.html and keeps the old page: %s', async (_name, html) => {
      await http().post('/sites').send({ address: 'keepme.zz', title: 'Keep', html: '<p>original words</p>', authorId: 'wen-zhao' }).then((r) => {
        if (r.status !== 201 && r.status !== 409) throw new Error(`setup failed: ${r.status}`);
      });
      const res = await http().put('/sites/keepme.zz').send({ title: 'Keep', html, authorId: 'wen-zhao' }).expect(400);
      expect(res.body.fields.html).toEqual([MESSAGE]);
      const after = (await http().get('/sites/keepme.zz').expect(200)).body;
      expect(after.html).toContain('original words');
      expect(after.revision).toBe(1);
    });

    it('still accepts a page that keeps some visible text after sanitizing', async () => {
      const res = await http()
        .post('/sites')
        .send({ address: 'partly.zz', title: 'Partly', html: '<script>alert(1)</script><p>but this stays</p>', authorId: 'wen-zhao' })
        .expect(201);
      expect(res.body.html).toBe('<p>but this stays</p>');
    });

    it('reports an empty-after-sanitizing page together with other bad fields', async () => {
      const res = await http().post('/sites').send({ address: 'emptyish2.zz', title: 'x', html: '<script>1</script>', authorId: 'nobody' }).expect(400);
      expect(Object.keys(res.body.fields).sort()).toEqual(['authorId', 'html']);
    });

    it('treats zero-width and blank characters as no content', async () => {
      const res = await http()
        .post('/sites')
        .send({ address: 'zerowidth.zz', title: 'Z', html: '<p>&#8203;&#8203;</p><p>&#160; &#8203;</p>', authorId: 'wen-zhao' })
        .expect(400);
      expect(res.body.fields.html).toEqual([MESSAGE]);
    });

    it('accepts a page whose only content is a symbol or punctuation', async () => {
      await http().post('/sites').send({ address: 'justasymbol.zz', title: 'Symbol', html: '<p>★</p>', authorId: 'wen-zhao' }).expect(201);
    });
  });

  describe('PUT /sites/:address (replace)', () => {
    it('replaces in place, bumps the revision and keeps createdAt', async () => {
      await http().post('/sites').send({ address: 'ledger2.zz', title: 'One', html: '<p>first</p>', authorId: 'odile-mercier' }).expect(201);
      const before = (await http().get('/sites/ledger2.zz')).body;
      const res = await http().put('/sites/ledger2.zz').send({ title: 'Two', html: '<p>second</p>', authorId: 'odile-mercier' }).expect(200);
      expect(res.body).toMatchObject({ title: 'Two', revision: 2, createdAt: before.createdAt });
      expect(res.body.html).toContain('second');
    });

    it('answers 403 for someone else, 404 for an unknown address, 400 for bad input', async () => {
      await http().put('/sites/ledger2.zz').send({ title: 'x', html: '<p>x</p>', authorId: 'wen-zhao' }).expect(403);
      await http().put('/sites/never.zz').send({ title: 'x', html: '<p>x</p>', authorId: 'wen-zhao' }).expect(404);
      await http().put('/sites/ledger2.zz').send({ title: '', html: '', authorId: 'odile-mercier' }).expect(400);
    });

    it('re-indexes search text after a replace', async () => {
      await http().post('/sites').send({ address: 'reindex.zz', title: 'Reindex', html: '<p>quokka</p>', authorId: 'wen-zhao' }).expect(201);
      expect((await http().get('/search?q=quokka')).body.results.map((r: { address: string }) => r.address)).toContain('reindex.zz');
      await http().put('/sites/reindex.zz').send({ title: 'Reindex', html: '<p>wombat</p>', authorId: 'wen-zhao' }).expect(200);
      expect((await http().get('/search?q=quokka')).body.total).toBe(0);
      expect((await http().get('/search?q=wombat')).body.results[0].address).toBe('reindex.zz');
    });
  });

  describe('GET /search', () => {
    const top = async (q: string) => (await http().get(`/search?q=${encodeURIComponent(q)}`).expect(200)).body;

    it('ranks the right site first: "tide" -> tidepool.zz', async () => {
      const body = await top('tide');
      expect(body.results[0].address).toBe('tidepool.zz');
      expect(body.total).toBeGreaterThan(1); // other sites mention tides too, and rank below
      const scores = body.results.map((r: { score: number }) => r.score);
      expect(scores).toEqual([...scores].sort((a, b) => b - a));
      expect(scores[0]).toBeGreaterThan(scores[1]);
    });

    it.each([
      ['bread', 'ironbread.zz'],
      ['moth', 'mothledger.zz'],
      ['sourdough starter', 'ironbread.zz'],
      ['freight train', 'nightfreight.zz'],
      ['valve radio', 'quietcircuits.zz'],
      ['monsoon', 'pepperandrain.zz'],
      ['watch repair', 'slowclock.zz'],
      ['rooftop garden', 'highline.zz'],
    ])('"%s" -> %s first', async (q, address) => {
      expect((await top(q)).results[0].address).toBe(address);
    });

    it('finds words that only appear in the body, not the title or address', async () => {
      const body = await top('rasam');
      expect(body.results.map((r: { address: string }) => r.address)).toEqual(['pepperandrain.zz']);
    });

    it('matches inflected forms (stemming)', async () => {
      expect((await top('tides')).results[0].address).toBe('tidepool.zz');
    });

    it('returns structured snippets with the match highlighted, never html', async () => {
      const [first] = (await top('anemones')).results;
      expect(first.address).toBe('tidepool.zz');
      expect(first.snippet.some((s: { match: boolean; text: string }) => s.match && /anemone/i.test(s.text))).toBe(true);
      expect(first.snippet.map((s: { text: string }) => s.text).join('')).not.toMatch(/<[a-z]/i);
    });

    it('answers empty and whitespace queries with an empty 200', async () => {
      for (const q of ['', '   ', '---', '"" ']) {
        expect(await top(q)).toEqual({ query: '', total: 0, results: [] });
      }
      expect((await http().get('/search').expect(200)).body.results).toEqual([]);
    });

    it('answers a query with no hits with total 0', async () => {
      expect(await top('zzyzx')).toMatchObject({ total: 0, results: [] });
    });

    it('treats mongo operators as plain words (no injection, no 500)', async () => {
      for (const q of ['-tide', '"salt road"', '$where', '{"$ne": 1}', 'tide -salt']) {
        await http().get(`/search?q=${encodeURIComponent(q)}`).expect(200);
      }
    });

    it('ignores array-valued q instead of crashing', async () => {
      await http().get('/search?q=a&q=b').expect(200);
    });

    it('pages with limit and offset and validates them', async () => {
      const all = await top('salt');
      expect(all.results.length).toBeGreaterThan(2);
      const page = (await http().get('/search?q=salt&limit=1&offset=1').expect(200)).body;
      expect(page.total).toBe(all.total);
      expect(page.results).toHaveLength(1);
      expect(page.results[0].address).toBe(all.results[1].address);
      // an out-of-range limit is clamped to [1, 50], not rejected
      expect((await http().get('/search?q=salt&limit=51').expect(200)).body.results.length).toBeLessThanOrEqual(50);
      expect((await http().get('/search?q=salt&limit=0').expect(200)).body.results).toHaveLength(1);
      await http().get('/search?q=salt&limit=abc').expect(400);
    });
  });

  describe('people', () => {
    it('lists everyone sorted by name, and filters by role', async () => {
      const all = (await http().get('/people').expect(200)).body;
      expect(all.map((p: { id: string }) => p.id)).toEqual(expect.arrayContaining(['ines-varga', 'tomas-reyes', 'wen-zhao', 'odile-mercier', 'kofi-mensah']));
      const authors = (await http().get('/people?role=author').expect(200)).body;
      expect(authors.every((p: { roles: string[] }) => p.roles.includes('author'))).toBe(true);
      expect(authors.map((p: { id: string }) => p.id)).not.toContain('kofi-mensah');
      await http().get('/people?role=wizard').expect(400);
    });
    it('gets one person, or 404', async () => {
      expect((await http().get('/people/wen-zhao').expect(200)).body).toEqual({ id: 'wen-zhao', name: 'Wen Zhao', roles: ['browser', 'author'] });
      await http().get('/people/nobody').expect(404);
    });
  });

  describe('visits', () => {
    type V = { id: string; address: string; at: string; via: string; found: boolean; title: string | null };

    async function allVisits(person: string, limit = 7): Promise<V[]> {
      const out: V[] = [];
      let cursor: string | null = null;
      for (let i = 0; i < 100; i++) {
        const res: request.Response = await http().get(`/people/${person}/visits?limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`).expect(200);
        out.push(...res.body.items);
        cursor = res.body.nextCursor;
        if (!cursor) return out;
      }
      throw new Error('cursor never ended');
    }

    it('pages the whole history newest first with no gaps or duplicates', async () => {
      const visits = await allVisits('tomas-reyes');
      expect(visits.length).toBeGreaterThan(40);
      expect(new Set(visits.map((v) => v.id)).size).toBe(visits.length);
      const times = visits.map((v) => Date.parse(v.at));
      expect(times).toEqual([...times].sort((a, b) => b - a));
      const bigPage = (await http().get('/people/tomas-reyes/visits?limit=100').expect(200)).body.items as V[];
      expect(visits.map((v) => v.id)).toEqual(bigPage.map((v) => v.id).concat(visits.slice(bigPage.length).map((v) => v.id)));
    });

    it('marks unknown addresses found:false with no title, and found sites carry their title', async () => {
      const visits = await allVisits('kofi-mensah');
      const dead = visits.find((v) => v.address === 'lost-lighthouse.zz')!;
      expect(dead).toMatchObject({ found: false, title: null });
      const live = visits.find((v) => v.address === 'tidepool.zz')!;
      expect(live).toMatchObject({ found: true });
      expect(live.title).toMatch(/Tidepool/);
    });

    it('does not mix people', async () => {
      const wen = await allVisits('wen-zhao');
      const odile = await allVisits('odile-mercier');
      const ids = new Set(wen.map((v) => v.id));
      expect(odile.some((v) => ids.has(v.id))).toBe(false);
    });

    it('answers 404 for an unknown person and 400 for a bad cursor or a non-integer limit', async () => {
      await http().get('/people/nobody/visits').expect(404);
      await http().post('/people/nobody/visits').send({ address: 'tidepool.zz', via: 'typed' }).expect(404);
      await http().get('/people/wen-zhao/visits?cursor=garbage').expect(400);
      await http().get('/people/wen-zhao/visits?limit=abc').expect(400);
    });

    it('no longer rejects an out-of-range limit: 200 and 101 succeed, 0 and -3 give one item (was a 400)', async () => {
      const tomas = (limit: string) => http().get(`/people/tomas-reyes/visits?limit=${limit}`).expect(200);
      const total = (await allVisits('tomas-reyes')).length;
      expect((await tomas('200')).body.items).toHaveLength(Math.min(100, total));
      expect((await tomas('101')).body.items).toHaveLength(Math.min(100, total));
      expect((await tomas('0')).body.items).toHaveLength(1);
      expect((await tomas('-3')).body.items).toHaveLength(1);
    }); // the ceiling of exactly 100 is proved in reviewer-api.spec.ts, with a person who has more than 100 visits

    describe('POST', () => {
      const person = 'odile-mercier';

      it('records an arrival; the server computes found and at', async () => {
        const before = Date.now();
        const res = await http().post(`/people/${person}/visits`).send({ address: 'HTTP://Tidepool.ZZ/', via: 'typed', found: false, at: '2001-01-01T00:00:00Z' }).expect(201);
        expect(res.body).toMatchObject({ address: 'tidepool.zz', via: 'typed', found: true });
        expect(Date.parse(res.body.at)).toBeGreaterThanOrEqual(before - 1000);
        const newest = (await http().get(`/people/${person}/visits?limit=1`)).body.items[0];
        expect(newest.id).toBe(res.body.id);
      });

      it('records a visit to nowhere as found:false', async () => {
        const res = await http().post(`/people/${person}/visits`).send({ address: 'old-wells.zz', via: 'link' }).expect(201);
        expect(res.body).toMatchObject({ address: 'old-wells.zz', found: false, title: null });
      });

      it('is idempotent per requestId: a replay returns the stored visit and writes nothing new', async () => {
        const before = (await allVisits(person)).length;
        const first = await http().post(`/people/${person}/visits`).send({ address: 'saltroad.zz', via: 'link', requestId: 'req-1' }).expect(201);
        const second = await http().post(`/people/${person}/visits`).send({ address: 'saltroad.zz', via: 'link', requestId: 'req-1' }).expect(200);
        expect(second.body).toEqual(first.body);
        expect((await allVisits(person)).length).toBe(before + 1);
      });

      it('scopes requestId to the person', async () => {
        await http().post('/people/wen-zhao/visits').send({ address: 'saltroad.zz', via: 'link', requestId: 'req-1' }).expect(201);
      });

      it('survives a race: concurrent identical requestIds create exactly one visit', async () => {
        const before = (await allVisits(person)).length;
        const results = await Promise.all(
          Array.from({ length: 8 }, () => http().post(`/people/${person}/visits`).send({ address: 'highline.zz', via: 'back', requestId: 'req-race' })),
        );
        expect(results.every((r) => r.status === 200 || r.status === 201)).toBe(true);
        expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
        expect((await allVisits(person)).length).toBe(before + 1);
      });

      it('allows repeat visits to the same address without a requestId', async () => {
        const before = (await allVisits(person)).length;
        await http().post(`/people/${person}/visits`).send({ address: 'highline.zz', via: 'link' }).expect(201);
        await http().post(`/people/${person}/visits`).send({ address: 'highline.zz', via: 'link' }).expect(201);
        expect((await allVisits(person)).length).toBe(before + 2);
      });

      it.each(['typed', 'link', 'back', 'forward', 'history', 'search'])('accepts via=%s', async (via) => {
        await http().post(`/people/${person}/visits`).send({ address: 'tidepool.zz', via }).expect(201);
      });

      it('rejects a bad via, a non-address, and a missing body', async () => {
        const bad = await http().post(`/people/${person}/visits`).send({ address: 'tidepool.zz', via: 'teleport' }).expect(400);
        expect(bad.body.fields.via).toBeDefined();
        const ext = await http().post(`/people/${person}/visits`).send({ address: 'example.com', via: 'link' }).expect(400);
        expect(ext.body.fields.address).toBeDefined();
        await http().post(`/people/${person}/visits`).send({}).expect(400);
      });
    });
  });

  describe('platform', () => {
    it('serves /health as a readiness check that pings the database', async () => {
      expect((await http().get('/health').expect(200)).body).toEqual({ ok: true, db: 'up' });
    });
    it('sends CORS headers for the configured origin', async () => {
      const res = await http().get('/health').set('Origin', 'http://localhost:3000').expect(200);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    });
    it('answers unknown routes with a JSON 404', async () => {
      const res = await http().get('/nope').expect(404);
      expect(res.body.statusCode).toBe(404);
    });
  });
});
