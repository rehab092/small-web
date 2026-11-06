import { spawnSync } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { E2E_MONGO_URI } from '../playwright.config';

/** Fail fast, with a useful message, when the dev mongod is not running. */
function assertMongoReachable(uri: string): Promise<void> {
  const url = new URL(uri);
  const port = Number(url.port || 27017);
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: url.hostname, port, timeout: 3000 });
    socket.once('connect', () => {
      socket.destroy();
      resolve();
    });
    const fail = () => {
      socket.destroy();
      reject(
        new Error(
          `MongoDB is not reachable at ${url.hostname}:${port}. Start the dev database first: npm run dev:db -w api`,
        ),
      );
    };
    socket.once('error', fail);
    socket.once('timeout', fail);
  });
}

/** Re-seed the e2e database so every run starts from the same data. */
export default async function globalSetup(): Promise<void> {
  await assertMongoReachable(E2E_MONGO_URI);
  const repoRoot = path.resolve(__dirname, '..', '..');
  const result = spawnSync('npm', ['run', 'seed', '-w', 'api'], {
    cwd: repoRoot,
    env: { ...process.env, MONGO_URI: E2E_MONGO_URI },
    encoding: 'utf8',
    shell: true,
  });
  if (result.status !== 0) {
    throw new Error(`seeding the e2e database failed:\n${result.stdout}\n${result.stderr}`);
  }
}
