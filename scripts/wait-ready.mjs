// Polls a URL until it answers with a success status. Used by the dev runner (scripts/dev.mjs).
import { setTimeout as sleep } from 'node:timers/promises';

/**
 * Resolves true once `url` answers 2xx; false when `timeoutMs` passes or `isStopped()` turns true.
 * `onSlow` is called once if `slowAfterMs` passes without success (a hint for the user).
 */
export async function waitUntilReady({
  url,
  timeoutMs = 120_000,
  intervalMs = 1000,
  requestTimeoutMs = 3000,
  slowAfterMs = Infinity,
  onSlow = () => {},
  isStopped = () => false,
}) {
  const started = Date.now();
  let warned = false;
  while (!isStopped() && Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(requestTimeoutMs) });
      if (res.ok) return true;
    } catch {
      // not up yet
    }
    if (!warned && Date.now() - started >= slowAfterMs) {
      warned = true;
      onSlow();
    }
    await sleep(intervalMs);
  }
  return false;
}
