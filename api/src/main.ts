import 'reflect-metadata';
import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { assertPortFree } from './common/startup';
import { configureApp } from './configure-app';
import { assertDatabaseReachable, exitWithStartupError } from './db/database';

async function bootstrap() {
  const port = Number(process.env.PORT ?? 4000);
  await assertPortFree(port);
  await assertDatabaseReachable();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);
  await app.listen(port);
  new Logger('Bootstrap').log(`Small Web API listening on http://localhost:${port}`);
}

bootstrap().catch(exitWithStartupError);
