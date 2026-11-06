/**
 * The single definition of "what a page becomes when it is stored": sanitize the author's HTML,
 * derive its search text, and decide whether anything readable is left. Publish, replace, the
 * seed and POST /sites/preview all go through inspectPage(), so the preview shows exactly what
 * publishing would store, and "empty" means the same thing everywhere.
 */
import { extractText, sanitizeSiteHtml } from './sanitizer';

export const NOTHING_TO_SHOW = 'nothing left to show after removing disallowed content';

/** A letter, digit, punctuation or symbol: zero-width and blank characters do not count as content. */
const VISIBLE_CHARACTER = /[\p{L}\p{N}\p{P}\p{S}]/u;

export interface PageContent {
  /** Sanitized HTML: what is stored and what the browser renders (still only inside the sandboxed frame). */
  html: string;
  /** Plain text of the sanitized HTML, used for search. */
  text: string;
  /** True when nothing readable survives sanitizing. Such a page cannot be published. */
  empty: boolean;
  /** The user-facing reason when empty, otherwise null. One wording for server and client. */
  message: string | null;
}

/** True when something readable survives. Pure; exported so no one writes a second definition. */
export function hasVisibleContent(page: Pick<PageContent, 'html' | 'text'>): boolean {
  return page.html.trim() !== '' && VISIBLE_CHARACTER.test(page.text);
}

/** Sanitize, extract text, and judge emptiness. Never throws for any string input. */
export function inspectPage(rawHtml: string): PageContent {
  const html = sanitizeSiteHtml(rawHtml);
  const text = extractText(html);
  const empty = !hasVisibleContent({ html, text });
  return { html, text, empty, message: empty ? NOTHING_TO_SHOW : null };
}
