/**
 * A browser history with the semantics the session depends on: pushState
 * truncates what is ahead, replaceState keeps the position, and go() is
 * asynchronous (the traversal lands, and popstate fires, when `flush` runs).
 * Test support only.
 */

import type { HistoryLike } from './session';

export class FakeHistory implements HistoryLike {
  entries: Array<{ state: unknown; url: string }> = [{ state: null, url: '/' }];
  pos = 0;
  private queue: number[] = [];

  get state() {
    return this.entries[this.pos]?.state;
  }

  get url() {
    return this.entries[this.pos]?.url ?? '/';
  }

  pushState(state: unknown, _unused: string, url?: string | null) {
    this.entries.length = this.pos + 1;
    this.entries.push({ state, url: url ?? this.url });
    this.pos += 1;
  }

  replaceState(state: unknown, _unused: string, url?: string | null) {
    this.entries[this.pos] = { state, url: url ?? this.url };
  }

  go(delta: number) {
    this.queue.push(delta);
  }

  back() {
    this.go(-1);
  }

  forward() {
    this.go(1);
  }

  /** Apply queued traversals, firing popstate for each one that lands. */
  flush(onPop: (state: unknown, search: string) => void) {
    while (this.queue.length) {
      const target = this.pos + (this.queue.shift() as number);
      if (target < 0 || target >= this.entries.length) continue;
      this.pos = target;
      onPop(this.state, this.url.slice(this.url.indexOf('?')));
    }
  }
}
