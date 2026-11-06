import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { waitUntilReady } from './wait-ready.mjs';

/** A server whose /health answers `statuses` in order, then keeps repeating the last one. */
function serverAnswering(statuses) {
  let calls = 0;
  const server = createServer((_req, res) => {
    res.statusCode = statuses[Math.min(calls++, statuses.length - 1)];
    res.end('{}');
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve({ url: `http://127.0.0.1:${server.address().port}/health`, calls: () => calls, close: () => server.close() }),
    ),
  );
}

test('resolves true as soon as the url answers 200', async () => {
  const s = await serverAnswering([200]);
  try {
    assert.equal(await waitUntilReady({ url: s.url, intervalMs: 20 }), true);
    assert.equal(s.calls(), 1);
  } finally {
    s.close();
  }
});

test('keeps waiting through 503s (database not ready) and then succeeds', async () => {
  const s = await serverAnswering([503, 503, 503, 200]);
  try {
    assert.equal(await waitUntilReady({ url: s.url, intervalMs: 20 }), true);
    assert.equal(s.calls(), 4);
  } finally {
    s.close();
  }
});

test('waits for a server that is not listening yet, then succeeds when it appears', async () => {
  const probe = await serverAnswering([200]);
  const url = probe.url;
  probe.close(); // the port is now closed
  await new Promise((r) => setTimeout(r, 50));
  const port = new URL(url).port;
  const pending = waitUntilReady({ url, intervalMs: 30, timeoutMs: 5000 });
  await new Promise((r) => setTimeout(r, 200));
  const server = createServer((_req, res) => res.end('{}'));
  await new Promise((resolve) => server.listen(Number(port), '127.0.0.1', resolve));
  try {
    assert.equal(await pending, true);
  } finally {
    server.close();
  }
});

test('gives up with false after the timeout when it never becomes ready', async () => {
  const s = await serverAnswering([503]);
  try {
    const started = Date.now();
    assert.equal(await waitUntilReady({ url: s.url, intervalMs: 20, timeoutMs: 300 }), false);
    assert.ok(Date.now() - started < 3000);
  } finally {
    s.close();
  }
});

test('calls onSlow exactly once when it takes too long', async () => {
  const s = await serverAnswering([503]);
  let slow = 0;
  try {
    await waitUntilReady({ url: s.url, intervalMs: 20, timeoutMs: 400, slowAfterMs: 100, onSlow: () => slow++ });
    assert.equal(slow, 1);
  } finally {
    s.close();
  }
});

test('stops waiting at once when told to stop', async () => {
  const s = await serverAnswering([503]);
  let stop = false;
  setTimeout(() => (stop = true), 100);
  try {
    const started = Date.now();
    assert.equal(await waitUntilReady({ url: s.url, intervalMs: 20, timeoutMs: 60_000, isStopped: () => stop }), false);
    assert.ok(Date.now() - started < 2000);
  } finally {
    s.close();
  }
});

test('does not hang on a server that accepts the connection and never answers', async () => {
  const server = createServer(() => {}); // never responds
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/health`;
    const started = Date.now();
    assert.equal(await waitUntilReady({ url, intervalMs: 20, timeoutMs: 600, requestTimeoutMs: 100 }), false);
    assert.ok(Date.now() - started < 3000);
  } finally {
    server.closeAllConnections?.();
    server.close();
  }
});
