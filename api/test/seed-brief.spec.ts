/**
 * Self-check: the seed must satisfy the data requirements of the brief. These are pure
 * data tests (no database), so they are fast and run everywhere. If someone edits the
 * seed and breaks a requirement, this file says which one.
 */
import { toAddress } from '../src/common/address';
import { SEED_PEOPLE } from '../src/seed/data/people';
import { SEED_BASE_TIME, SEED_SITES } from '../src/seed/data/sites';
import { buildSeedVisits, linkGraph } from '../src/seed/data/visits';

const INTENTIONAL_BROKEN_LINKS = ['lost-lighthouse.zz', 'old-wells.zz', 'the-deep-archive.zz'];
const known = new Set(SEED_SITES.map((s) => s.address));
const visits = buildSeedVisits();

describe('seed self-check against the brief', () => {
  it('has roughly ten sites (at least 10)', () => {
    expect(SEED_SITES.length).toBeGreaterThanOrEqual(10);
    expect(new Set(SEED_SITES.map((s) => s.address)).size).toBe(SEED_SITES.length);
  });

  it('has real prose on every site, not stubs', () => {
    for (const site of SEED_SITES) {
      const prose = site.html.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ');
      const words = prose.split(/\s+/).filter(Boolean);
      expect(words.length).toBeGreaterThanOrEqual(150);
      expect(new Set(words.map((w) => w.toLowerCase())).size).toBeGreaterThan(90); // varied, not repeated filler
      expect(prose).not.toMatch(/lorem|ipsum|todo|fixme|placeholder/i);
    }
  });

  it('has a handful of people to browse as', () => {
    expect(SEED_PEOPLE.length).toBeGreaterThanOrEqual(3);
    expect(SEED_PEOPLE.length).toBeLessThanOrEqual(8);
    expect(new Set(SEED_PEOPLE.map((p) => p.slug)).size).toBe(SEED_PEOPLE.length);
  });

  it('has at least two authors with two or more sites each', () => {
    const perAuthor = new Map<string, number>();
    for (const site of SEED_SITES) perAuthor.set(site.authorId, (perAuthor.get(site.authorId) ?? 0) + 1);
    const prolific = [...perAuthor].filter(([, n]) => n >= 2);
    expect(prolific.length).toBeGreaterThanOrEqual(2);
    for (const [slug] of prolific) expect(SEED_PEOPLE.find((p) => p.slug === slug)?.roles).toContain('author');
  });

  it('resolves every internal link except the intentional broken ones', () => {
    const unresolved = new Set<string>();
    for (const targets of linkGraph().values()) targets.filter((a) => !known.has(a)).forEach((a) => unresolved.add(a));
    expect([...unresolved].sort()).toEqual(INTENTIONAL_BROKEN_LINKS);
  });

  it('has links to addresses that never existed, and none of them is a seeded site', () => {
    expect(INTENTIONAL_BROKEN_LINKS.length).toBeGreaterThanOrEqual(2);
    for (const address of INTENTIONAL_BROKEN_LINKS) expect(known.has(address)).toBe(false);
  });

  it('lets a reader wander 4+ steps without turning back', () => {
    const graph = linkGraph();
    const longest = (at: string, seen: Set<string>): number => {
      let best = seen.size;
      for (const next of graph.get(at) ?? []) if (known.has(next) && !seen.has(next)) best = Math.max(best, longest(next, new Set(seen).add(next)));
      return best;
    };
    expect(Math.max(...[...known].map((a) => longest(a, new Set([a]))))).toBeGreaterThanOrEqual(5); // 5 pages = 4 steps
  });

  it('has about an hour of browsing history', () => {
    const times = visits.map((v) => v.at.getTime());
    const minutes = (Math.max(...times) - Math.min(...times)) / 60_000;
    expect(minutes).toBeGreaterThanOrEqual(45);
    expect(minutes).toBeLessThanOrEqual(90);
    expect(Math.min(...times)).toBeGreaterThan(SEED_BASE_TIME.getTime());
  });

  it('has one person who visited at least 90% of the sites', () => {
    const reach = (slug: string) =>
      new Set(visits.filter((v) => v.personId === slug && known.has(v.address)).map((v) => v.address)).size;
    const best = Math.max(...SEED_PEOPLE.map((p) => reach(p.slug)));
    expect(best / known.size).toBeGreaterThanOrEqual(0.9);
  });

  it('has a trail of 4+ consecutive link-follows by one person', () => {
    let best = 0;
    for (const person of SEED_PEOPLE) {
      let run = 0;
      for (const v of visits.filter((x) => x.personId === person.slug)) {
        run = v.via === 'link' ? run + 1 : 0;
        best = Math.max(best, run);
      }
    }
    expect(best).toBeGreaterThanOrEqual(4);
  });

  it('has repeat visits, and every way of arriving', () => {
    const repeated = SEED_PEOPLE.filter((p) => {
      const mine = visits.filter((v) => v.personId === p.slug);
      return mine.length > new Set(mine.map((v) => v.address)).size;
    });
    expect(repeated.length).toBeGreaterThanOrEqual(2);
    expect(new Set(visits.map((v) => v.via))).toEqual(new Set(['typed', 'link', 'back', 'forward', 'history', 'search']));
  });

  it('is deterministic: building the visits twice gives identical rows', () => {
    expect(buildSeedVisits()).toEqual(buildSeedVisits());
    expect(visits.every((v) => toAddress(v.address) === v.address)).toBe(true);
  });
});
