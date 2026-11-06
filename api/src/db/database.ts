/** Database URI resolution and start-up error reporting, shared by the API and the seed command. */
import { createConnection } from 'mongoose';
import { PortInUseError } from '../common/startup';

export const DEV_DB_URI = 'mongodb://127.0.0.1:27018/small-web';

/**
 * MONGO_URI wins. When it is unset we fall back to the development database
 * started by `npm run dev:db` (an in-memory mongod with a persistent dbPath).
 */
export function resolveMongoUri(env: NodeJS.ProcessEnv = process.env): string {
  const uri = env.MONGO_URI?.trim();
  return uri ? uri : DEV_DB_URI;
}

/** host:port of a Mongo URI with any credentials, options and database name removed: safe to print. */
export function redactUri(uri: string): string {
  const withoutScheme = uri.replace(/^mongodb(?:\+srv)?:\/\//i, '');
  const authority = withoutScheme.split('/')[0].split('?')[0];
  return authority.slice(authority.lastIndexOf('@') + 1) || 'the configured host';
}

const UNREACHABLE = /ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ServerSelection|Unable to connect to the database|getaddrinfo|timed out/i;

/**
 * A human message when the error means "MongoDB is not there", otherwise null.
 * Never includes the URI's credentials.
 */
export function describeStartupError(err: unknown, uri: string = resolveMongoUri()): string | null {
  const text = `${(err as Error)?.name ?? ''} ${(err as Error)?.message ?? ''} ${String((err as { cause?: unknown })?.cause ?? '')}`;
  if (!UNREACHABLE.test(text)) return null;
  return [
    `Could not reach MongoDB at ${redactUri(uri)}.`,
    '  - Start the local development database:   npm run dev:db',
    '  - or use Docker:                          docker compose up -d   (and set MONGO_URI=mongodb://127.0.0.1:27017/small-web)',
    '  - or point MONGO_URI at your own MongoDB (api/.env).',
  ].join('\n');
}

/**
 * Pre-flight: connect once, briefly, before NestJS starts. NestJS logs a stack trace and exits on
 * its own when its database module cannot connect, so this is what lets us print a clear message.
 * Rejects with the driver's error (which describeStartupError recognizes).
 */
export async function assertDatabaseReachable(uri: string = resolveMongoUri(), timeoutMs = 3000): Promise<void> {
  const connection = createConnection(uri, { serverSelectionTimeoutMS: timeoutMs });
  try {
    await connection.asPromise();
  } finally {
    await connection.close().catch(() => undefined);
  }
}

/** Print a friendly message for "MongoDB is down", or the full error for anything else; then exit 1. */
export function exitWithStartupError(err: unknown): never {
  const friendly = err instanceof PortInUseError ? err.message : describeStartupError(err);
  if (friendly) console.error(`\n${friendly}\n`);
  else console.error(err);
  process.exit(1);
}
