/** `npm run seed`: populate the database. Safe to run any number of times. */
import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { getConnectionToken } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { AppModule } from '../app.module';
import { assertDatabaseReachable, exitWithStartupError } from '../db/database';
import { SeedService } from './seed.service';

async function main() {
  await assertDatabaseReachable();
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const counts = await app.get(SeedService).run();
    const db = app.get<Connection>(getConnectionToken()).db!;
    const totals = {
      people: await db.collection('people').countDocuments(),
      sites: await db.collection('sites').countDocuments(),
      visits: await db.collection('visits').countDocuments(),
    };
    console.log(`seeded ${counts.people} people, ${counts.sites} sites, ${counts.visits} visits`);
    console.log(`database now holds ${totals.people} people, ${totals.sites} sites, ${totals.visits} visits`);
  } finally {
    await app.close();
  }
}

main().catch(exitWithStartupError);
