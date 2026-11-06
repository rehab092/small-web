import request from 'supertest';
import { extractText } from '../src/common/sanitizer';
import { EMPTY_AFTER_SANITIZING, NOTHING_TO_SHOW_MESSAGE, READABLE_PAGES } from './fixtures';
import { startApp, TestApp } from './helpers';

describe('POST /sites/preview (dry run of publish)', () => {
  let t: TestApp;
  const http = () => request(t.app.getHttpServer());
  const preview = (body: unknown) => http().post('/sites/preview').send(body as object);
  let counter = 0;
  const freshAddress = () => `preview-check-${++counter}.zz`;

  beforeAll(async () => {
    t = await startApp();
    await t.seed.run();
  });
  afterAll(async () => {
    await t.close();
  });

  it('answers 200 (not 201) with html, text, empty and message', async () => {
    const res = await preview({ html: '<h1>Hi</h1><p>Some words.</p>' }).expect(200);
    expect(res.body).toEqual({ html: '<h1>Hi</h1><p>Some words.</p>', text: 'Hi Some words.', empty: false, message: null });
  });

  describe('is identical to what publishing stores', () => {
    it.each(READABLE_PAGES)('same sanitized html and search text as POST /sites: %s', async (_name, html) => {
      const previewed = (await preview({ html }).expect(200)).body;
      const address = freshAddress();
      const published = (await http().post('/sites').send({ address, title: 'Compare', html, authorId: 'wen-zhao' }).expect(201)).body;
      expect(previewed.html).toBe(published.html);
      expect(previewed.empty).toBe(false);
      expect(previewed.text).toBe(extractText(published.html));
      const stored = (await http().get(`/sites/${address}`).expect(200)).body;
      expect(stored.html).toBe(previewed.html); // and what is read back later is the same again
    });

    it('neutralizes the position bypasses exactly like publish (comment trick and var())', async () => {
      const html = '<style>.c{position/**/:fixed}</style><div class="c" style="position:/* x */sticky">x</div><div style="--p:fixed;position:var(--p)">y</div>';
      const out = (await preview({ html }).expect(200)).body.html as string;
      expect(out).not.toMatch(/position\s*:\s*(fixed|sticky)|var\s*\(/i); // an inert "--p:fixed" may remain; nothing reads it
      expect(out).toContain('position:static');
    });

    it.each(EMPTY_AFTER_SANITIZING)('empty:true exactly when publish would answer 400 with fields.html: %s', async (_name, html) => {
      const previewed = (await preview({ html }).expect(200)).body;
      expect(previewed.empty).toBe(true);
      expect(previewed.message).toBe(NOTHING_TO_SHOW_MESSAGE);
      const publish = await http().post('/sites').send({ address: freshAddress(), title: 'Empty', html, authorId: 'wen-zhao' }).expect(400);
      expect(publish.body.fields.html).toEqual([previewed.message]); // one wording for client and server
    });

    it.each(READABLE_PAGES)('empty:false exactly when publish succeeds: %s', async (_name, html) => {
      expect((await preview({ html }).expect(200)).body.empty).toBe(false);
    });
  });

  describe('never fails on content', () => {
    it.each(EMPTY_AFTER_SANITIZING)('answers 200 { empty: true }, never a 500: %s', async (_name, html) => {
      const res = await preview({ html }).expect(200);
      expect(res.body.empty).toBe(true);
    });

    it('treats the empty string as an empty page, not an error', async () => {
      const res = await preview({ html: '' }).expect(200);
      expect(res.body).toEqual({ html: '', text: '', empty: true, message: NOTHING_TO_SHOW_MESSAGE });
    });

    it('treats zero-width characters as empty, like publish', async () => {
      expect((await preview({ html: '<p>&#8203;&#8203;</p>' }).expect(200)).body.empty).toBe(true);
    });

    it('accepts exactly 100 000 characters and rejects one more with the publish error shape', async () => {
      await preview({ html: '<p>' + 'a'.repeat(99_997) }).expect(200);
      const res = await preview({ html: 'a'.repeat(100_001) }).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400, error: 'Bad Request', message: 'Validation failed' });
      expect(res.body.fields.html).toBeDefined();
    });

    it('answers 413 for a body over 1 MB, like every other route', async () => {
      await preview({ html: 'a'.repeat(1_200_000) }).expect(413);
    });

    it.each([
      ['a missing body', {}],
      ['a non-string html', { html: 42 }],
      ['an array html', { html: ['<p>x</p>'] }],
      ['a null html', { html: null }],
    ])('answers 400 with fields.html for %s', async (_name, body) => {
      const res = await preview(body).expect(400);
      expect(res.body.fields.html).toBeDefined();
    });

    it('answers 400, not 500, for malformed JSON', async () => {
      await http().post('/sites/preview').set('Content-Type', 'application/json').send('{"html": ').expect(400);
    });
  });

  describe('is a pure dry run', () => {
    it('writes nothing: site count and search results are unchanged', async () => {
      const before = (await http().get('/sites?limit=1').expect(200)).body.total;
      await preview({ html: '<h1>Zebrafish</h1><p>Zebrafish zebrafish zebrafish.</p>' }).expect(200);
      expect((await http().get('/sites?limit=1').expect(200)).body.total).toBe(before);
      expect((await http().get('/search?q=zebrafish').expect(200)).body.total).toBe(0);
    });

    it('ignores address, title and authorId if sent, and needs no author', async () => {
      const res = await preview({ html: '<p>words</p>', address: 'tidepool.zz', title: 'x', authorId: 'nobody' }).expect(200);
      expect(res.body.html).toBe('<p>words</p>');
      expect((await http().get('/sites/tidepool.zz').expect(200)).body.revision).toBe(1); // nothing replaced
    });

    it('is not shadowed by the :address routes', async () => {
      await http().get('/sites/preview').expect(404); // GET treats "preview" as an address that is nowhere
      await preview({ html: '<p>x</p>' }).expect(200);
    });

    it('gives the same answer every time', async () => {
      const html = READABLE_PAGES[2][1];
      const a = (await preview({ html }).expect(200)).body;
      const b = (await preview({ html }).expect(200)).body;
      expect(a).toEqual(b);
    });
  });
});
