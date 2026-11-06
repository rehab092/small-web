import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { getConnectionToken } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { toAddress } from '../src/common/address';
import { SEED_PEOPLE } from '../src/seed/data/people';
import { SEED_SITES } from '../src/seed/data/sites';
import { buildSeedVisits, linkGraph } from '../src/seed/data/visits';
import { startApp, TestApp } from './helpers';

describe('seed', () => {
  let t: TestApp;
  const collection = (name: string) => t.app.get<Connection>(getConnectionToken()).db!.collection(name);
  const dump = async () => ({
    people: await collection('people').find({}, { projection: { _id: 0 } }).sort({ slug: 1 }).toArray(),
    sites: await collection('sites').find({}, { projection: { _id: 0 } }).sort({ address: 1 }).toArray(),
    visits: await collection('visits').find({}).sort({ personId: 1, at: 1, _id: 1 }).toArray(),
  });

  beforeAll(async () => {
    t = await startApp();
  });
  afterAll(async () => {
    await t.close();
  });

  describe('idempotency', () => {
    it('running twice yields identical data: same counts, same addresses, same visits down to the ids', async () => {
      const first = await t.seed.run();
      const a = await dump();
      const second = await t.seed.run();
      const b = await dump();
      expect(second).toEqual(first);
      expect(b.people).toHaveLength(SEED_PEOPLE.length);
      expect(b.sites.map((s) => s.address)).toEqual(a.sites.map((s) => s.address));
      expect(b).toEqual(a); // deep equality: html, text, timestamps, visit ids, everything
    });

    it('does not double the web after several runs', async () => {
      await t.seed.run();
      await t.seed.run();
      expect(await collection('sites').countDocuments()).toBe(SEED_SITES.length);
      expect(await collection('people').countDocuments()).toBe(SEED_PEOPLE.length);
      expect(await collection('visits').countDocuments()).toBe(buildSeedVisits().length);
    });

    it('leaves sites published by others alone, and wipes only the seeded people\'s visits', async () => {
      await request(t.app.getHttpServer()).post('/sites').send({ address: 'mine.zz', title: 'Mine', html: '<p>mine</p>', authorId: 'wen-zhao' }).expect(201);
      await collection('visits').insertOne({ personId: 'stranger', address: 'mine.zz', at: new Date(), via: 'typed', found: true });
      await request(t.app.getHttpServer()).post('/people/wen-zhao/visits').send({ address: 'mine.zz', via: 'typed' }).expect(201);
      await t.seed.run();
      expect(await collection('sites').countDocuments({ address: 'mine.zz' })).toBe(1);
      expect(await collection('visits').countDocuments({ personId: 'stranger' })).toBe(1);
      expect(await collection('visits').countDocuments({ personId: 'wen-zhao', address: 'mine.zz' })).toBe(0); // recreated deterministically
      await collection('sites').deleteOne({ address: 'mine.zz' });
      await collection('visits').deleteOne({ personId: 'stranger' });
    });

    it('restores a seeded site that was edited', async () => {
      await request(t.app.getHttpServer()).put('/sites/tidepool.zz').send({ title: 'Hijacked', html: '<p>x</p>', authorId: 'ines-varga' }).expect(200);
      await t.seed.run();
      const res = await request(t.app.getHttpServer()).get('/sites/tidepool.zz').expect(200);
      expect(res.body.title).toMatch(/Field guide|field guide/);
      expect(res.body.revision).toBe(1);
    });

    it('uses no randomness or wall clock', () => {
      const dir = join(__dirname, '..', 'src', 'seed');
      const files: string[] = [];
      const walk = (d: string) => readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(join(d, e.name)) : files.push(join(d, e.name))));
      walk(dir);
      for (const f of files.filter((f) => f.endsWith('.ts'))) {
        const src = readFileSync(f, 'utf8');
        expect(src).not.toMatch(/Math\.random|Date\.now\(|new Date\(\)|randomUUID|randomBytes/);
      }
    });
  });

  describe('content', () => {
    it('has about ten sites with real prose', () => {
      expect(SEED_SITES.length).toBeGreaterThanOrEqual(10);
      for (const s of SEED_SITES) {
        const words = s.html.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
        expect(words).toBeGreaterThan(150);
      }
    });

    it('has five people and at least two authors with two or more sites', () => {
      expect(SEED_PEOPLE).toHaveLength(5);
      const counts = new Map<string, number>();
      SEED_SITES.forEach((s) => counts.set(s.authorId, (counts.get(s.authorId) ?? 0) + 1));
      expect([...counts.values()].filter((n) => n >= 2).length).toBeGreaterThanOrEqual(2);
      for (const s of SEED_SITES) expect(SEED_PEOPLE.find((p) => p.slug === s.authorId)?.roles).toContain('author');
    });

    it('links the sites well enough to wander 4+ steps, and includes links to addresses that never existed', () => {
      const graph = linkGraph();
      const known = new Set(SEED_SITES.map((s) => s.address));
      const dead = new Set<string>();
      for (const targets of graph.values()) targets.filter((a) => !known.has(a)).forEach((a) => dead.add(a));
      expect(dead.size).toBeGreaterThanOrEqual(2);
      expect(dead.size).toBeLessThanOrEqual(3);

      const longest = (at: string, seen: Set<string>): number => {
        let best = seen.size;
        for (const next of graph.get(at) ?? []) if (known.has(next) && !seen.has(next)) best = Math.max(best, longest(next, new Set(seen).add(next)));
        return best;
      };
      const deepest = Math.max(...[...known].map((a) => longest(a, new Set([a]))));
      expect(deepest).toBeGreaterThanOrEqual(5); // 5 pages = 4 steps without turning back
      expect(known.size).toBeGreaterThan(0);
    });

    it('every site is linked to by another site (nothing is an island)', () => {
      const graph = linkGraph();
      for (const s of SEED_SITES) {
        const inbound = [...graph.entries()].filter(([from, to]) => from !== s.address && to.includes(s.address));
        expect(inbound.length).toBeGreaterThan(0);
      }
    });

    it('keeps a link to a real web address that the browser must show but not follow', () => {
      const external = SEED_SITES.flatMap((s) => [...s.html.matchAll(/href="(https?:\/\/[^"]+)"/g)].map((m) => m[1])).filter((h) => toAddress(h) === null);
      expect(external.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('history', () => {
    const visits = buildSeedVisits();
    const by = (p: string) => visits.filter((v) => v.personId === p);

    it('spans roughly an hour and every visit is after the sites were published', () => {
      const times = visits.map((v) => v.at.getTime());
      const span = (Math.max(...times) - Math.min(...times)) / 60_000;
      expect(span).toBeGreaterThan(35);
      expect(span).toBeLessThan(90);
      expect(Math.min(...times)).toBeGreaterThan(new Date('2026-11-02T08:00:00Z').getTime());
    });

    it('is ordered, unique and sits on fixed, round timestamps', () => {
      expect(new Set(visits.map((v) => v.id)).size).toBe(visits.length);
      for (const p of SEED_PEOPLE) {
        const ts = by(p.slug).map((v) => v.at.getTime());
        expect(ts).toEqual([...ts].sort((a, b) => a - b));
        expect(new Set(ts).size).toBe(ts.length);
      }
      expect(visits.every((v) => v.at.getUTCMilliseconds() === 0)).toBe(true);
    });

    it('has one person who visited nearly everything', () => {
      const known = new Set(SEED_SITES.map((s) => s.address));
      const reach = (p: string) => new Set(by(p).filter((v) => known.has(v.address)).map((v) => v.address)).size;
      expect(Math.max(...SEED_PEOPLE.map((p) => reach(p.slug)))).toBeGreaterThanOrEqual(known.size - 1);
    });

    it('has repeat visits, a long trail, every kind of arrival and some dead ends', () => {
      const repeats = SEED_PEOPLE.filter((p) => by(p.slug).length > new Set(by(p.slug).map((v) => v.address)).size);
      expect(repeats.length).toBeGreaterThanOrEqual(3);
      expect(Math.max(...SEED_PEOPLE.map((p) => by(p.slug).length))).toBeGreaterThanOrEqual(30);
      expect(new Set(visits.map((v) => v.via))).toEqual(new Set(['typed', 'link', 'back', 'forward', 'history', 'search']));
      expect(visits.some((v) => !v.found)).toBe(true);
      for (const p of SEED_PEOPLE) expect(by(p.slug).length).toBeGreaterThan(5);
    });

    it('only visits addresses in the right shape, and found matches the seeded sites', () => {
      const known = new Set(SEED_SITES.map((s) => s.address));
      for (const v of visits) {
        expect(toAddress(v.address)).toBe(v.address);
        expect(v.found).toBe(known.has(v.address));
      }
    });
  });
});
