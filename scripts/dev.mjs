// Runs the API and the web app together: `npm run dev`.
// No dependencies on purpose; stops both when either exits or on Ctrl+C.
import { spawn, spawnSync } from 'node:child_process';

const apps = [
  { name: 'api', script: 'dev:api' },
  { name: 'web', script: 'dev:web' },
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

for (const { name, script } of apps) {
  const child = spawn('npm', ['run', script], { stdio: ['ignore', 'pipe', 'pipe'], shell: true });
  children.push(child);
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  prefixLines(name, child.stdout, process.stdout);
  prefixLines(name, child.stderr, process.stderr);
  child.on('exit', (code) => {
    if (!stopping) console.error(`[${name}] exited with code ${code}; stopping the other app`);
    stop(code ?? 1);
  });
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
