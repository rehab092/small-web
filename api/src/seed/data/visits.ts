/**
 * Seed browsing history: about an hour for five people, all hand-scripted or
 * walked by a fixed rule. No randomness anywhere, so the same command always
 * yields the same visits, down to the ids.
 */
import { createHash } from 'node:crypto';
import { toAddress } from '../../common/address';
import type { Via } from '../../visits/visit.schema';
import { SEED_BASE_TIME, SEED_SITES } from './sites';

export interface SeedVisit {
  /** Deterministic 24-hex ObjectId. */
  id: string;
  personId: string;
  address: string;
  at: Date;
  via: Via;
  found: boolean;
}

/** Browsing starts one hour after the sites were published. */
export const VISITS_START = new Date(SEED_BASE_TIME.getTime() + 60 * 60 * 1000);

type Step = [address: string, via: Via, gapSeconds: number];

const KNOWN = new Set(SEED_SITES.map((s) => s.address));

/** link graph derived from the site HTML itself, so it cannot drift from the pages */
export function linkGraph(): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  for (const site of SEED_SITES) {
    const out: string[] = [];
    for (const m of site.html.matchAll(/href="([^"]+)"/g)) {
      const addr = toAddress(m[1]);
      if (addr && addr !== site.address && !out.includes(addr)) out.push(addr);
    }
    graph.set(site.address, out);
  }
  return graph;
}

/** Deterministic wander: at each step take the link at a fixed, repeating offset. */
function walk(start: string, steps: number, stride: number): Step[] {
  const graph = linkGraph();
  const out: Step[] = [[start, 'typed', 20]];
  let at = start;
  for (let i = 1; i <= steps; i++) {
    const links = graph.get(at) ?? [];
    if (links.length === 0) break;
    const next = links[(i * stride) % links.length];
    // every fifth step the reader goes back one page before carrying on
    if (i % 5 === 0 && out.length > 1) {
      out.push([out[out.length - 2][0], 'back', 8 + (i % 4) * 3]);
      at = out[out.length - 1][0];
      continue;
    }
    out.push([next, 'link', 25 + ((i * 7) % 40)]);
    at = next;
  }
  return out;
}

const TRAILS: Record<string, Step[]> = {
  'ines-varga': [
    ['tidepool.zz', 'typed', 15],
    ['cartographers.zz', 'link', 40],
    ['tidepool.zz', 'back', 6],
    ['mothledger.zz', 'link', 55],
    ['nightfreight.zz', 'link', 35],
    ['mothledger.zz', 'back', 5],
    ['tidepool.zz', 'forward', 4],
    ['tidepool.zz', 'search', 120],
    ['saltroad.zz', 'link', 70],
    ['old-wells.zz', 'link', 20],
    ['saltroad.zz', 'back', 7],
    ['ironbread.zz', 'link', 45],
    ['pepperandrain.zz', 'link', 60],
    ['highline.zz', 'link', 50],
    ['mothledger.zz', 'link', 40],
    ['tidepool.zz', 'history', 180],
    ['highline.zz', 'typed', 90],
  ],
  'tomas-reyes': [
    ...walk('cartographers.zz', 46, 3),
    ['slowclock.zz', 'typed', 150],
    ['quietcircuits.zz', 'link', 45],
    ['pepperandrain.zz', 'link', 70],
    ['the-deep-archive.zz', 'typed', 30],
    ['ironbread.zz', 'search', 100],
    ['mothledger.zz', 'history', 60],
    ['saltroad.zz', 'link', 55],
    ['tidepool.zz', 'link', 65],
  ],
  'wen-zhao': [
    ['quietcircuits.zz', 'typed', 20],
    ['nightfreight.zz', 'link', 75],
    ['ironbread.zz', 'link', 50],
    ['nightfreight.zz', 'back', 6],
    ['saltroad.zz', 'link', 90],
    ['tidepool.zz', 'link', 40],
    ['lost-lighthouse.zz', 'link', 25],
    ['tidepool.zz', 'back', 5],
    ['quietcircuits.zz', 'history', 200],
    ['slowclock.zz', 'typed', 60],
    ['nightfreight.zz', 'link', 45],
    ['nightfreight.zz', 'search', 150],
  ],
  'odile-mercier': [
    ['pepperandrain.zz', 'typed', 30],
    ['highline.zz', 'link', 85],
    ['pepperandrain.zz', 'back', 8],
    ['ironbread.zz', 'link', 60],
    ['saltroad.zz', 'link', 80],
    ['pepperandrain.zz', 'search', 240],
    ['pepperandrain.zz', 'typed', 400],
    ['highline.zz', 'history', 90],
  ],
  'kofi-mensah': [
    ['tidepool.zz', 'search', 25],
    ['mothledger.zz', 'link', 70],
    ['tidepool.zz', 'back', 6],
    ['cartographers.zz', 'link', 45],
    ['slowclock.zz', 'link', 95],
    ['cartographers.zz', 'back', 7],
    ['highline.zz', 'link', 60],
    ['lost-lighthouse.zz', 'typed', 20],
    ['highline.zz', 'back', 5],
    ['pepperandrain.zz', 'link', 100],
    ['tidepool.zz', 'search', 300],
    ['saltroad.zz', 'link', 40],
    ['tidepool.zz', 'link', 55],
    ['nightfreight.zz', 'search', 130],
    ['ironbread.zz', 'link', 65],
    ['ironbread.zz', 'forward', 12],
    ['quietcircuits.zz', 'search', 210],
    ['tidepool.zz', 'history', 150],
    ['tidepool.zz', 'typed', 500],
    ['cartographers.zz', 'link', 70],
  ],
};

/** A fixed 24-hex id per (person, position) so reruns recreate identical rows. */
function visitId(personId: string, index: number): string {
  return createHash('sha1').update(`visit:${personId}:${index}`).digest('hex').slice(0, 24);
}

export function buildSeedVisits(): SeedVisit[] {
  const out: SeedVisit[] = [];
  for (const [personId, steps] of Object.entries(TRAILS)) {
    // stagger people so their hours overlap but never coincide
    let t = VISITS_START.getTime() + personOffsetSeconds(personId) * 1000;
    steps.forEach(([address, via, gap], i) => {
      t += gap * 1000;
      const normalized = toAddress(address) ?? address;
      out.push({ id: visitId(personId, i), personId, address: normalized, at: new Date(t), via, found: KNOWN.has(normalized) });
    });
  }
  return out;
}

function personOffsetSeconds(personId: string): number {
  const people = Object.keys(TRAILS);
  return people.indexOf(personId) * 420;
}
