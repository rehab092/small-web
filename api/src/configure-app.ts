import { ValidationError, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { fieldErrors } from './common/errors';
import { JsonErrorFilter } from './common/http-exception.filter';

function collect(errors: ValidationError[], out: Record<string, string[]> = {}, prefix = ''): Record<string, string[]> {
  for (const e of errors) {
    const key = prefix ? `${prefix}.${e.property}` : e.property;
    if (e.constraints) out[key] = Object.values(e.constraints);
    if (e.children?.length) collect(e.children, out, key);
  }
  return out;
}

/** Shared by main.ts and the e2e tests so both run the same pipeline. */
export function configureApp(app: NestExpressApplication): NestExpressApplication {
  app.enableCors({ origin: (process.env.CORS_ORIGIN ?? 'http://localhost:3000').split(',').map((s) => s.trim()) });
  app.useBodyParser('json', { limit: '1mb' });
  app.useGlobalFilters(new JsonErrorFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      exceptionFactory: (errors) => fieldErrors(collect(errors)),
    }),
  );
  return app;
}
