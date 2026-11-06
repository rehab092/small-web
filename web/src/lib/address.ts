/**
 * Small-web address rules. This is a deliberate re-implementation of the API's
 * normalization (docs/api.md, "Address normalization") so the address bar,
 * link clicks and the server always agree on what an address is.
 */

const VALID_ADDRESS = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+zz$/;
const MAX_ADDRESS_LENGTH = 100;

/**
 * Normalize user input to a canonical small-web address, or `null` when the
 * input is not a small-web address (empty, whitespace inside, wrong TLD,
 * unsupported scheme, ...).
 */
export function normalizeAddress(input: string): string | null {
  let s = input.trim();
  if (/\s/.test(s)) return null;
  s = s.toLowerCase();
  s = s.replace(/^(https?|web):\/\//, '');
  s = s.replace(/[?#].*$/, '').replace(/\/+$/, '');
  if (s !== '' && !s.includes('.')) s += '.zz';
  if (s.length > MAX_ADDRESS_LENGTH || !VALID_ADDRESS.test(s)) return null;
  return s;
}

export type LinkTarget =
  | { kind: 'site'; address: string }
  | { kind: 'anchor'; id: string }
  | { kind: 'external'; href: string }
  | { kind: 'blocked'; href: string };

/**
 * Decide what a clicked `href` inside a page means.
 *  - site:     a small-web address; the browser navigates there.
 *  - anchor:   `#id` inside the current page; handled in-page.
 *  - external: looks like a real-web URL; shown, never followed (no real network).
 *  - blocked:  any other scheme (`javascript:`, `data:`, `mailto:` ...).
 */
export function classifyHref(href: string): LinkTarget {
  const raw = href.trim();
  if (raw.startsWith('#')) return { kind: 'anchor', id: decodeSafe(raw.slice(1)) };
  const address = normalizeAddress(raw);
  if (address) return { kind: 'site', address };
  if (/^(https?:)?\/\//i.test(raw) || (/^[^\s:/]+\.[^\s:]+/.test(raw) && !raw.includes(':'))) {
    return { kind: 'external', href: raw };
  }
  return { kind: 'blocked', href: raw };
}

function decodeSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Internal (non-site) pages are addressed with an `about:` pseudo address. */
export const HOME_ADDR = 'about:home';
export const HISTORY_ADDR = 'about:history';
export const PUBLISH_ADDR = 'about:publish';

export function searchAddr(query: string): string {
  return `about:search?q=${encodeURIComponent(query)}`;
}

/** The publish form, optionally prefilled with an address (e.g. from a Nowhere page). */
export function publishAddr(address?: string): string {
  return address ? `${PUBLISH_ADDR}?address=${encodeURIComponent(address)}` : PUBLISH_ADDR;
}

export function parsePublishAddr(addr: string): string | null {
  if (!addr.startsWith(PUBLISH_ADDR)) return null;
  const q = addr.slice(PUBLISH_ADDR.length + 1);
  return new URLSearchParams(q).get('address');
}

export type InternalPage = 'home' | 'history' | 'search' | 'publish';

/** Which built-in page an `about:` address is; null for unknown ones. */
export function internalPage(addr: string): InternalPage | null {
  if (addr === HOME_ADDR) return 'home';
  if (addr === HISTORY_ADDR) return 'history';
  if (addr.startsWith('about:search')) return 'search';
  if (addr.startsWith(PUBLISH_ADDR)) return 'publish';
  return null;
}

export function isInternalAddr(addr: string): boolean {
  return addr.startsWith('about:');
}

export function parseSearchAddr(addr: string): string | null {
  if (!addr.startsWith('about:search')) return null;
  const q = new URLSearchParams(addr.slice('about:search'.length + 1)).get('q');
  return q ?? '';
}

export type TypedResolution =
  | { kind: 'address'; addr: string }
  | { kind: 'search'; query: string }
  | { kind: 'external'; href: string };

/**
 * Interpret address-bar input. A small-web address (or an about: page) is
 * navigated to; a real-web URL is reported as external (never requested);
 * anything else is treated as a search query. Empty input yields null.
 */
export function resolveTyped(input: string): TypedResolution | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;
  const lowered = trimmed.toLowerCase();
  if (lowered === HOME_ADDR || lowered === HISTORY_ADDR || lowered === PUBLISH_ADDR) {
    return { kind: 'address', addr: lowered };
  }
  const addr = normalizeAddress(trimmed);
  if (addr) return { kind: 'address', addr };
  if (!/\s/.test(trimmed)) {
    const target = classifyHref(trimmed);
    if (target.kind === 'external' || target.kind === 'blocked') {
      return { kind: 'external', href: trimmed };
    }
  }
  return { kind: 'search', query: trimmed };
}
