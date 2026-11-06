/**
 * Session history stack: the model behind Back and Forward.
 *
 * One stack per person. `entries` is every page reached in this session and
 * `index` points at the one currently shown (-1 only for the empty stack).
 * All functions are pure and return new stacks, so the stack is trivial to
 * persist, compare and test.
 *
 * Rules (the same ones a real browser follows):
 *  - push after the current entry drops everything that was ahead (forward is lost);
 *  - back/forward only move `index`, they never add or remove entries;
 *  - scroll position is stored per entry so returning to a page restores it.
 */

export interface StackEntry {
  /** Unique within the stack; also stored in window.history.state. */
  id: string;
  /** A small-web address, or an `about:` pseudo address for internal pages. */
  addr: string;
  /** Scroll offset (px) the page was left at. */
  scroll: number;
}

export interface Stack {
  entries: StackEntry[];
  index: number;
}

export const EMPTY_STACK: Stack = { entries: [], index: -1 };

export function current(stack: Stack): StackEntry | null {
  return stack.entries[stack.index] ?? null;
}

export function canBack(stack: Stack): boolean {
  return stack.index > 0;
}

export function canForward(stack: Stack): boolean {
  return stack.index >= 0 && stack.index < stack.entries.length - 1;
}

/** Navigate to a new page: truncates forward history, then appends. */
export function push(stack: Stack, entry: { id: string; addr: string }): Stack {
  const kept = stack.entries.slice(0, stack.index + 1);
  const next: StackEntry = { id: entry.id, addr: entry.addr, scroll: 0 };
  return { entries: [...kept, next], index: kept.length };
}

/** Move one step back; a no-op at the start. */
export function back(stack: Stack): Stack {
  return canBack(stack) ? { ...stack, index: stack.index - 1 } : stack;
}

/** Move one step forward; a no-op at the end. */
export function forward(stack: Stack): Stack {
  return canForward(stack) ? { ...stack, index: stack.index + 1 } : stack;
}

export function indexOfId(stack: Stack, id: string): number {
  return stack.entries.findIndex((e) => e.id === id);
}

/** Point the stack at an existing entry; unchanged when the id is unknown. */
export function goToId(stack: Stack, id: string): Stack {
  const i = indexOfId(stack, id);
  return i < 0 || i === stack.index ? stack : { ...stack, index: i };
}

/** Remember how far the entry `id` was scrolled. */
export function setScroll(stack: Stack, id: string, scroll: number): Stack {
  const i = indexOfId(stack, id);
  const entry = stack.entries[i];
  const value = Math.max(0, Math.round(scroll));
  if (!entry || entry.scroll === value) return stack;
  const entries = stack.entries.slice();
  entries[i] = { ...entry, scroll: value };
  return { ...stack, entries };
}

/** Defensive parse for data coming back from sessionStorage. */
export function parseStack(value: unknown): Stack | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as { entries?: unknown; index?: unknown };
  if (!Array.isArray(v.entries) || typeof v.index !== 'number') return null;
  const entries: StackEntry[] = [];
  for (const raw of v.entries) {
    const e = raw as Partial<StackEntry> | null;
    if (!e || typeof e.id !== 'string' || typeof e.addr !== 'string') return null;
    entries.push({ id: e.id, addr: e.addr, scroll: typeof e.scroll === 'number' ? e.scroll : 0 });
  }
  if (entries.length === 0 || v.index < 0 || v.index >= entries.length) return null;
  return { entries, index: v.index };
}
