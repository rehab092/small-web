/**
 * Address normalization. The rules are the contract in docs/api.md; the web
 * app re-implements them with the same test vectors.
 */
const ADDRESS_RE = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+zz$/;
const MAX_LENGTH = 100;

export const ADDRESS_PATTERN = ADDRESS_RE;
export const ADDRESS_HINT = 'address must be a name ending in .zz, e.g. tidepool.zz';

export interface NormalizedAddress {
  /** Canonical form when valid; the best-effort cleaned input otherwise. */
  address: string;
  valid: boolean;
}

export function normalizeAddress(input: unknown): NormalizedAddress {
  if (typeof input !== 'string') return { address: '', valid: false };
  let a = input.trim().toLowerCase();
  if (/\s/.test(a)) return { address: a, valid: false };
  a = a.replace(/^(?:https?|web):\/\//, '');
  // A path, query or fragment never changes which site it is: the host routes.
  // (The host is validated afterwards, so this cannot turn an invalid host valid.)
  a = a.replace(/[?#].*$/, '').replace(/\/.*$/, '');
  if (a !== '' && !a.includes('.') && /^[a-z0-9-]+$/.test(a)) a = `${a}.zz`;
  const valid = a.length > 0 && a.length <= MAX_LENGTH && ADDRESS_RE.test(a);
  return { address: a, valid };
}

/** Returns the canonical address, or null when the input is not a small-web address. */
export function toAddress(input: unknown): string | null {
  const n = normalizeAddress(input);
  return n.valid ? n.address : null;
}
