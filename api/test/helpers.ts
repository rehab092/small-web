import type { NestExpressApplication } from '@nestjs/platform-express';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import type { Connection } from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { SeedService } from '../src/seed/seed.service';

export interface TestApp {
  app: NestExpressApplication;
  /** Only set when no TEST_MONGO_URI was given and an in-memory mongod was started. */
  mongo?: MongoMemoryServer;
  seed: SeedService;
  close(): Promise<void>;
}

/**
 * Boot the real app (same pipeline as main.ts) against a throwaway database.
 *
 *  - TEST_MONGO_URI set (CI): a real MongoDB server, given WITHOUT a database name, e.g.
 *    mongodb://127.0.0.1:27017. Each call uses its own uniquely named database and drops
 *    exactly that one when closed, so nothing else on the server is touched.
 *  - otherwise: an in-memory MongoDB via mongodb-memory-server (downloads mongod once).
 */
export async function startApp(): Promise<TestApp> {
  const external = process.env.TEST_MONGO_URI?.trim();
  let mongo: MongoMemoryServer | undefined;
  if (external) {
    const dbName = `small-web-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    process.env.MONGO_URI = `${external.replace(/\/+$/, '')}/${dbName}`;
  } else {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    mongo = await MongoMemoryServer.create();
    process.env.MONGO_URI = mongo.getUri('small-web-test');
  }

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
  return {
    app,
    mongo,
    seed: app.get(SeedService),
    close: async () => {
      if (external) await app.get<Connection>(getConnectionToken()).dropDatabase(); // only our unique test database
      await app.close();
      await mongo?.stop();
    },
  };
}
