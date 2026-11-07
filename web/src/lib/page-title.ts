import { internalPage, parseSearchAddr } from './address';

/** What the tab title is computed from; a pure function of the page being shown. */
export type TitleInput =
  | { kind: 'site'; title: string }
  | { kind: 'nowhere' }
  | { kind: 'loading'; addr: string }
  | { kind: 'error' }
  | { kind: 'internal'; addr: string };

const SUFFIX = 'Small Web';

/**
 * The tab title for the page on screen. Derived, never remembered, so it can
 * only ever be wrong if the page itself is: there is no moment in which the
 * title of the previous page, or a generic fallback, lingers.
 */
export function pageTitle(page: TitleInput): string {
  switch (page.kind) {
    case 'site':
      return `${page.title} · ${SUFFIX}`;
    case 'nowhere':
      return `Nowhere · ${SUFFIX}`;
    case 'loading':
      return `${page.addr} · ${SUFFIX}`;
    case 'error':
      return `Could not load · ${SUFFIX}`;
    case 'internal': {
      switch (internalPage(page.addr)) {
        case 'history':
          return `History · ${SUFFIX}`;
        case 'publish':
          return `Publish · ${SUFFIX}`;
        case 'search': {
          const q = (parseSearchAddr(page.addr) ?? '').trim();
          return q ? `Search: ${q} · ${SUFFIX}` : `Search · ${SUFFIX}`;
        }
        default:
          return SUFFIX;
      }
    }
  }
}
