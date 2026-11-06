// Runs the API and the web app together: `npm run dev`, or `npm start` (--prod, after `npm run build`).
// No dependencies on purpose; stops both when either exits or on Ctrl+C.
// Prints a "ready" line for each app once it really answers (the API's /health pings MongoDB).
import { spawn, spawnSync } from 'node:child_process';
import { waitUntilReady } from './wait-ready.mjs';

const API_PORT = Number(process.env.PORT ?? 4000);
const WEB_PORT = 3000; // fixed by web's "dev" script
const READY_TIMEOUT_MS = 120_000;
const DB_HINT_AFTER_MS = 20_000;

const production = process.argv.includes('--prod');
const apps = [
  { name: 'api', script: production ? 'start:api' : 'dev:api', url: `http://localhost:${API_PORT}/health` },
  { name: 'web', script: production ? 'start:web' : 'dev:web', url: `http://localhost:${WEB_PORT}` },
];
const children = [];
let stopping = false;

function prefixLines(name, stream, out) {
  let buffer = '';
  stream.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) out.write(`[${name}] ${line}\n`);
  });
  stream.on('end', () => buffer && out.write(`[${name}] ${buffer}\n`));
}

function kill(child) {
  if (child.exitCode !== null || !child.pid) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
  else child.kill('SIGTERM');
}

function stop(code) {
  if (stopping) return;
  stopping = true;
  children.forEach(kill);
  setTimeout(() => process.exit(code), 300);
}

for (const app of apps) {
  const child = spawn('npm', ['run', app.script], { stdio: ['ignore', 'pipe', 'pipe'], shell: true });
  children.push(child);
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  prefixLines(app.name, child.stdout, process.stdout);
  prefixLines(app.name, child.stderr, process.stderr);
  child.on('exit', (code) => {
    if (!stopping) console.error(`[${app.name}] exited with code ${code}; stopping the other app`);
    stop(code ?? 1);
  });
}

const readiness = apps.map(async (app) => {
  const ok = await waitUntilReady({
    url: app.url,
    timeoutMs: READY_TIMEOUT_MS,
    isStopped: () => stopping,
    // only the api depends on MongoDB; its /health answers 503 until the database responds
    slowAfterMs: app.name === 'api' ? DB_HINT_AFTER_MS : Infinity,
    onSlow: () => console.log('[dev] the api is not ready yet: is MongoDB running? (npm run dev:db, or docker compose up -d)'),
  });
  if (ok) console.log(`[dev] ${app.name} ready: ${app.url.replace(/\/health$/, '')}`);
  else if (!stopping) console.error(`[dev] ${app.name} did not become ready within ${READY_TIMEOUT_MS / 1000} s (${app.url})`);
  return ok;
});
Promise.all(readiness).then((results) => {
  if (!stopping && results.every(Boolean)) console.log(`[dev] ready: web http://localhost:${WEB_PORT}  api http://localhost:${API_PORT}`);
});

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
