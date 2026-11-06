import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Person } from '../people/person.schema';
import { prepareSite } from '../sites/sites.service';
import { Site } from '../sites/site.schema';
import { Visit } from '../visits/visit.schema';
import { SEED_PEOPLE } from './data/people';
import { SEED_BASE_TIME, SEED_SITES } from './data/sites';
import { buildSeedVisits } from './data/visits';

export interface SeedCounts {
  people: number;
  sites: number;
  visits: number;
}

/**
 * Idempotent seeding.
 *  - people and sites are upserted by slug / address (never duplicated; sites
 *    published by users at other addresses are left alone)
 *  - visits of the seeded people are wiped and recreated with fixed ids and
 *    timestamps, so a second run produces byte-identical history
 */
@Injectable()
export class SeedService {
  constructor(
    @InjectModel(Person.name) private readonly people: Model<Person>,
    @InjectModel(Site.name) private readonly sites: Model<Site>,
    @InjectModel(Visit.name) private readonly visits: Model<Visit>,
  ) {}

  async run(): Promise<SeedCounts> {
    await Promise.all([this.people.init(), this.sites.init(), this.visits.init()]);

    await this.people.bulkWrite(
      SEED_PEOPLE.map((p) => ({
        updateOne: { filter: { slug: p.slug }, update: { $set: { slug: p.slug, name: p.name, roles: p.roles } }, upsert: true },
      })),
    );

    await this.sites.bulkWrite(
      SEED_SITES.map((s) => {
        const prepared = prepareSite(s);
        const publishedAt = new Date(SEED_BASE_TIME.getTime() + s.publishedMinutes * 60_000);
        return {
          updateOne: {
            filter: { address: s.address },
            update: { $set: { ...prepared, revision: 1, createdAt: publishedAt, updatedAt: publishedAt } },
            upsert: true,
          },
        };
      }),
    );

    const seeded = SEED_PEOPLE.map((p) => p.slug);
    const visits = buildSeedVisits();
    await this.visits.deleteMany({ personId: { $in: seeded } });
    await this.visits.insertMany(
      visits.map((v) => ({ _id: new Types.ObjectId(v.id), personId: v.personId, address: v.address, at: v.at, via: v.via, found: v.found })),
      { ordered: true },
    );

    return { people: SEED_PEOPLE.length, sites: SEED_SITES.length, visits: visits.length };
  }
}
