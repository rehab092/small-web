import { describe, expect, it } from 'vitest';
import {
  IFRAME_SANDBOX,
  buildCsp,
  buildSrcDoc,
  parseBridgeMessage,
  randomToken,
} from './containment';

const opts = {
  frame: 'frame-123',
  nonce: 'nonce-abc',
  parentOrigin: 'http://localhost:3000',
  restoreY: 0,
  title: 'Tidepool',
};

describe('iframe sandbox', () => {
  it('only allows scripts (for the bridge), never same-origin or navigation', () => {
    expect(IFRAME_SANDBOX).toBe('allow-scripts');
    for (const forbidden of [
      'allow-same-origin',
      'allow-top-navigation',
      'allow-forms',
      'allow-popups',
      'allow-modals',
    ]) {
      expect(IFRAME_SANDBOX).not.toContain(forbidden);
    }
  });
});

describe('buildCsp', () => {
  const csp = buildCsp('N0NCE');
  it('denies everything by default', () => {
    expect(csp).toContain("default-src 'none'");
  });
  it('allows scripts only with the nonce, never unsafe-inline for scripts', () => {
    expect(csp).toContain("script-src 'nonce-N0NCE'");
    expect(csp.match(/script-src[^;]*/)?.[0]).not.toContain('unsafe');
  });
  it('allows inline styles only', () => {
    expect(csp).toContain("style-src 'unsafe-inline'");
    expect(csp).not.toMatch(/img-src|connect-src|frame-src|font-src/);
  });
  it('blocks forms and base rewrites', () => {
    expect(csp).toContain("form-action 'none'");
    expect(csp).toContain("base-uri 'none'");
  });
});

describe('buildSrcDoc', () => {
  const doc = buildSrcDoc('<h1>Hello</h1><a href="ironbread.zz">bread</a>', opts);

  it('puts the CSP before the bridge and before any author markup', () => {
    const csp = doc.indexOf('Content-Security-Policy');
    const bridge = doc.indexOf('<script nonce=');
    const author = doc.indexOf('<h1>Hello</h1>');
    expect(csp).toBeGreaterThan(-1);
    expect(csp).toBeLessThan(bridge);
    expect(bridge).toBeLessThan(author);
  });

  it('has exactly one script, and it carries the nonce', () => {
    expect(doc.match(/<script/g)).toHaveLength(1);
    expect(doc).toContain('<script nonce="nonce-abc">');
  });

  it('places the author html in the body', () => {
    expect(doc).toMatch(/<body>\n<h1>Hello<\/h1>/);
  });

  it('posts only to the parent origin, tagged with the frame id', () => {
    expect(doc).toContain('"origin":"http://localhost:3000"');
    expect(doc).toContain('"frame":"frame-123"');
    expect(doc).not.toMatch(/postMessage\([^)]*['"]\*['"]/);
  });

  it('embeds the scroll position to restore', () => {
    expect(buildSrcDoc('<p>x</p>', { ...opts, restoreY: 733.6 })).toContain('"y":734');
  });

  it('keeps retrying the restore until layout settles, and yields to the user', () => {
    // Regression: a single scrollTo at DOMContentLoaded/load clamped to 0 because the
    // document was not tall enough yet, so Back never restored the position.
    expect(doc).toContain('requestAnimationFrame(step)');
    expect(doc).toContain('userMoved');
  });

  it('forwards only the browser shortcuts out of the page', () => {
    expect(doc).toContain("send({type:'key',action:a})");
    expect(doc).toContain("a='back'");
  });

  it('escapes a hostile title so it cannot break out of <title>', () => {
    const hostile = buildSrcDoc('<p>x</p>', { ...opts, title: '</title><script>alert(1)</script>' });
    expect(hostile).not.toContain('</title><script>alert(1)');
    expect(hostile.match(/<script/g)).toHaveLength(1);
  });

  it('cannot be broken out of via the config values', () => {
    const hostile = buildSrcDoc('<p>x</p>', {
      ...opts,
      frame: '</script><script>alert(1)</script>',
      parentOrigin: '"};alert(1);//',
    });
    expect(hostile.match(/<script/g)).toHaveLength(1);
    expect(hostile).not.toContain('</script><script>alert(1)');
  });
});

describe('parseBridgeMessage', () => {
  const good = { sw: 1, frame: 'frame-123' };

  it('accepts well-formed link, scroll and ready messages', () => {
    expect(parseBridgeMessage({ ...good, type: 'link', href: 'a.zz' }, 'frame-123')).toEqual({
      ...good,
      type: 'link',
      href: 'a.zz',
    });
    expect(parseBridgeMessage({ ...good, type: 'scroll', y: 120.4 }, 'frame-123')).toEqual({
      ...good,
      type: 'scroll',
      y: 120,
    });
    expect(parseBridgeMessage({ ...good, type: 'ready' }, 'frame-123')?.type).toBe('ready');
  });

  it('accepts only the three shortcut actions', () => {
    for (const action of ['back', 'forward', 'address']) {
      expect(parseBridgeMessage({ ...good, type: 'key', action }, 'frame-123')).toEqual({ ...good, type: 'key', action });
    }
  });

  it('drops extra fields instead of passing them along', () => {
    const m = parseBridgeMessage({ ...good, type: 'link', href: 'a.zz', evil: 'x' }, 'frame-123');
    expect(m).not.toHaveProperty('evil');
  });

  const rejects: Array<[string, unknown]> = [
    ['null', null],
    ['string', 'link'],
    ['array', []],
    ['wrong version', { sw: 2, frame: 'frame-123', type: 'ready' }],
    ['wrong frame (stale page)', { sw: 1, frame: 'other', type: 'ready' }],
    ['missing frame', { sw: 1, type: 'ready' }],
    ['unknown type', { ...good, type: 'navigate-top' }],
    ['link without href', { ...good, type: 'link' }],
    ['link with non-string href', { ...good, type: 'link', href: { toString: 1 } }],
    ['empty href', { ...good, type: 'link', href: '' }],
    ['huge href', { ...good, type: 'link', href: 'a'.repeat(5000) }],
    ['key with an unknown action', { ...good, type: 'key', action: 'navigate' }],
    ['key without an action', { ...good, type: 'key' }],
    ['key with a non-string action', { ...good, type: 'key', action: ['back'] }],
    ['scroll NaN', { ...good, type: 'scroll', y: NaN }],
    ['scroll Infinity', { ...good, type: 'scroll', y: Infinity }],
    ['scroll negative', { ...good, type: 'scroll', y: -1 }],
    ['scroll string', { ...good, type: 'scroll', y: '10' }],
  ];
  it.each(rejects)('rejects %s', (_name, payload) => {
    expect(parseBridgeMessage(payload, 'frame-123')).toBeNull();
  });
});

describe('randomToken', () => {
  it('is unguessable-looking and unique', () => {
    const a = randomToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(randomToken()).not.toBe(a);
  });
});
