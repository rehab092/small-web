import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { SeedService } from '../src/seed/seed.service';

export interface TestApp {
  app: NestExpressApplication;
  mongo: MongoMemoryServer;
  seed: SeedService;
  close(): Promise<void>;
}

/** Boot the real app (same pipeline as main.ts) against a throwaway in-memory MongoDB. */
export async function startApp(): Promise<TestApp> {
  const mongo = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongo.getUri('small-web-test');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
  return {
    app,
    mongo,
    seed: app.get(SeedService),
    close: async () => {
      await app.close();
      await mongo.stop();
    },
  };
}
