/** `npm run dev:db`: a local mongod (via mongodb-memory-server) for machines without MongoDB. */
import { MongoMemoryServer } from 'mongodb-memory-server';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

async function main() {
  const dbPath = join(__dirname, '..', '..', '.mongo-data');
  mkdirSync(dbPath, { recursive: true });
  const server = await MongoMemoryServer.create({
    instance: { port: 27018, ip: '127.0.0.1', dbPath, storageEngine: 'wiredTiger' },
  });
  console.log(`dev mongod listening on ${server.getUri()}small-web  (data: ${dbPath})`);
  const stop = async () => {
    await server.stop({ doCleanup: false });
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
