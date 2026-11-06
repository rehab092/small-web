/**
 * Server-side HTML sanitizer: the first of two containment layers (the second
 * is the sandboxed, CSP'd iframe in web/src/lib/containment.ts).
 *
 * Trade-off: authors get structure, text, links and inline <style>. They get no
 * script, no forms, no embeds, no external resources and no images.
 */
import sanitizeHtml from 'sanitize-html';

export const MAX_HTML_LENGTH = 100_000;

/**
 * Pages are fragments. html/head/body/title are deliberately NOT allowed: the web app
 * places the markup inside the <body> of its own frame document, where a stray <html> or
 * <body> start tag would merge its attributes onto the frame's real root elements, and a
 * <title> is just a second copy of the site's title field.
 */
export const ALLOWED_TAGS = [
  'style',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr', 'div', 'span', 'section',
  'article', 'header', 'footer', 'main', 'nav', 'aside', 'figure', 'figcaption',
  'blockquote', 'pre', 'code', 'em', 'strong', 'b', 'i', 'u', 's', 'small', 'sub',
  'sup', 'mark', 'abbr', 'cite', 'q', 'kbd', 'samp', 'var', 'time', 'del', 'ins',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
  'details', 'summary', 'a',
];

/** Style content that could load resources, run script or break out of the sheet. */
const DANGEROUS_CSS = /@import|@charset|@namespace|url\s*\(|image-set\s*\(|expression\s*\(|behaviou?r\s*:|-moz-binding|javascript:|vbscript:/gi;

/** Overlay tricks: authors may not take their page out of normal flow. */
const FIXED_POSITION = /position\s*:\s*(?:fixed|sticky)/gi;

/**
 * Neutralize a stylesheet or style attribute.
 *  - `<` is never valid CSS outside strings, and removing it means a sheet can
 *    never close its own <style> element or open a tag (mXSS)
 *  - `\` is removed so escaped spellings (`ur\6c(`) cannot dodge the filters
 *  - dangerous tokens are removed repeatedly until none are left, because
 *    removing one can splice its neighbours into a new one (`u` + `url(` + `rl(`)
 */
export function cleanCss(css: string): string {
  let out = css.replace(/[<\\]/g, '');
  let previous: string;
  do {
    previous = out;
    out = out.replace(DANGEROUS_CSS, '').replace(FIXED_POSITION, 'position:static');
  } while (out !== previous);
  return out;
}

export function sanitizeSiteHtml(html: string): string {
  const out = sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    // <style> is the one tag sanitize-html calls "vulnerable": we allow it on purpose (authors need
    // some styling) and neutralize its body ourselves in cleanCss(), with tests in sanitizer.spec.ts.
    allowVulnerableTags: true,
    allowedAttributes: {
      a: ['href', 'title', 'rel'],
      '*': ['class', 'id', 'lang', 'dir', 'title', 'style'],
      th: ['colspan', 'rowspan', 'scope'],
      td: ['colspan', 'rowspan'],
      ol: ['start', 'type'],
      time: ['datetime'],
    },
    // Only plain links: http(s) are shown but never followed by the browser;
    // bare addresses (tidepool.zz) are the small-web links.
    allowedSchemes: ['http', 'https'],
    allowedSchemesAppliedToAttributes: ['href'],
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    // 'title' is dropped with its text, so removing the tag does not leave its text in the page
    nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'iframe', 'object', 'embed', 'template', 'title'],
    allowedStyles: undefined,
    transformTags: {
      a: (tagName, attribs) => {
        const next = { ...attribs };
        delete next.target;
        next.rel = 'noopener noreferrer nofollow';
        return { tagName, attribs: next };
      },
    },
    exclusiveFilter: undefined,
  });
  return stripStyleAttributesAndCleanSheets(out);
}

/**
 * sanitize-html passes <style> bodies and style="" through verbatim, so run
 * both through cleanCss as a second pass.
 */
function stripStyleAttributesAndCleanSheets(html: string): string {
  return html
    .replace(/<style([^>]*)>([\s\S]*?)<\/style>/gi, (_m, attrs: string, css: string) => `<style${attrs}>${cleanCss(css)}</style>`)
    .replace(/\sstyle="([^"]*)"/gi, (_m, css: string) => ` style="${cleanCss(css).replace(/"/g, '&quot;')}"`);
}

/** Plain text of the (already sanitized or raw) HTML, for full-text search. */
export function extractText(html: string): string {
  // block-level boundaries become spaces so "<h1>Tide</h1><p>Low" does not read "TideLow"
  const spaced = html.replace(/<\/?(?:p|div|h[1-6]|li|ul|ol|br|hr|tr|td|th|table|section|article|header|footer|main|nav|aside|figure|figcaption|blockquote|pre|dt|dd|dl|details|summary)\b[^>]*>/gi, ' ');
  const text = sanitizeHtml(spaced, { allowedTags: [], allowedAttributes: {}, nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'title'] });
  return decodeEntities(text).replace(/\s+/g, ' ').trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
}
