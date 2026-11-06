/**
 * Containment of pages nobody on this team wrote.
 *
 * THIS FILE IS THE LINE. Everything a published page can do is decided here
 * (plus the server-side sanitizer in the API, which is the first layer).
 * Layers, outermost first:
 *
 *  1. IFRAME_SANDBOX: the page lives in an <iframe sandbox="allow-scripts">.
 *     `allow-same-origin` is never granted, so the frame has an opaque origin
 *     and cannot read the parent's DOM, storage or cookies, and `window.top`
 *     is cross-origin. There is no allow-top-navigation, allow-forms,
 *     allow-popups or allow-modals: it cannot navigate the browser away,
 *     submit, open windows or call alert(). `position: fixed` content is
 *     clipped to the frame, so it cannot cover the browser chrome.
 *  2. CSP in the document itself (first element of <head>, before any author
 *     markup): `default-src 'none'` blocks images, fonts, XHR, frames, media;
 *     `script-src 'nonce-...'` only runs our bridge (inline author scripts and
 *     on* handlers are refused even if the sanitizer missed one);
 *     `form-action 'none'` and `base-uri 'none'` close the remaining doors.
 *     The parent page additionally sets `frame-src about:` (next.config.mjs)
 *     so a surviving <meta refresh> cannot send the frame to a real site.
 *  3. The bridge is the only script, and the only channel out. It reports
 *     clicks on links and scroll position with postMessage; the parent
 *     accepts a message only from this frame's window, with this frame's
 *     random id, in an exact shape (parseBridgeMessage).
 *
 * What it costs authors: no JavaScript, no external CSS / images / fonts, no
 * forms, no iframes, no links that open anything real. Plain HTML + inline
 * <style> only. In return a page can neither read nor affect anything outside
 * its own box.
 */

/** Never add allow-same-origin, allow-top-navigation*, allow-forms, allow-popups, allow-modals. */
export const IFRAME_SANDBOX = 'allow-scripts';

export const BRIDGE_VERSION = 1;
export const MAX_HREF_LENGTH = 2048;

export interface BridgeLinkMessage {
  sw: typeof BRIDGE_VERSION;
  frame: string;
  type: 'link';
  href: string;
}
export interface BridgeScrollMessage {
  sw: typeof BRIDGE_VERSION;
  frame: string;
  type: 'scroll';
  y: number;
}
export interface BridgeReadyMessage {
  sw: typeof BRIDGE_VERSION;
  frame: string;
  type: 'ready';
}
export type BridgeMessage = BridgeLinkMessage | BridgeScrollMessage | BridgeReadyMessage;

/**
 * Validate a raw `message` event payload from the iframe. Returns the typed
 * message, or null for anything that is not exactly one of ours for `frame`.
 * Callers must ALSO check `event.source === iframe.contentWindow`.
 */
export function parseBridgeMessage(data: unknown, frame: string): BridgeMessage | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const m = data as Record<string, unknown>;
  if (m.sw !== BRIDGE_VERSION || m.frame !== frame) return null;
  switch (m.type) {
    case 'link':
      if (typeof m.href !== 'string' || m.href.length === 0 || m.href.length > MAX_HREF_LENGTH) {
        return null;
      }
      return { sw: BRIDGE_VERSION, frame, type: 'link', href: m.href };
    case 'scroll':
      if (typeof m.y !== 'number' || !Number.isFinite(m.y) || m.y < 0 || m.y > 1e8) return null;
      return { sw: BRIDGE_VERSION, frame, type: 'scroll', y: Math.round(m.y) };
    case 'ready':
      return { sw: BRIDGE_VERSION, frame, type: 'ready' };
    default:
      return null;
  }
}

export interface SrcDocOptions {
  /** Random per-render id; must be echoed by every message. */
  frame: string;
  /** Random per-render CSP nonce for the bridge script. */
  nonce: string;
  /** Origin of the embedding page: the only target the bridge posts to. */
  parentOrigin: string;
  /** Scroll offset to restore once the page is laid out. */
  restoreY: number;
  /** Page title, used for the document <title>. */
  title: string;
}

export function buildCsp(nonce: string): string {
  return [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    `script-src 'nonce-${nonce}'`,
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

/** Random token for frame ids and nonces (base64url, 128 bits). */
export function randomToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** JSON that is safe to place inside an inline <script>. */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

const BASE_STYLES = `
html{scroll-behavior:auto}
body{margin:0;padding:24px 28px 64px;font:16px/1.65 Georgia,'Times New Roman',serif;color:#1d2530;background:#fffdf8;overflow-wrap:anywhere}
a{color:#1f5fbf}
img,video,audio{display:none}
`;

/**
 * The bridge: runs inside the frame. It is registered in <head> with event
 * delegation so it works however the author's markup is (mis)formed.
 */
function bridgeSource(opts: SrcDocOptions): string {
  const config = jsonForScript({
    v: BRIDGE_VERSION,
    frame: opts.frame,
    origin: opts.parentOrigin,
    y: Math.max(0, Math.round(opts.restoreY)),
    max: MAX_HREF_LENGTH,
  });
  return `(function(){
var C=${config};
function send(m){m.sw=C.v;m.frame=C.frame;try{parent.postMessage(m,C.origin);}catch(e){}}
document.addEventListener('click',function(ev){
  var n=ev.target;
  while(n&&n.nodeType===1&&!(n.tagName==='A'&&n.hasAttribute('href'))){n=n.parentNode;}
  if(!n||n.nodeType!==1)return;
  ev.preventDefault();
  var href=String(n.getAttribute('href')||'');
  if(href.charAt(0)==='#'){
    var id=href.slice(1);try{id=decodeURIComponent(id);}catch(e){}
    var t=id?document.getElementById(id):null;
    if(t){t.scrollIntoView();}else if(!id){window.scrollTo(0,0);}
    return;
  }
  if(href&&href.length<=C.max)send({type:'link',href:href});
},true);
document.addEventListener('submit',function(ev){ev.preventDefault();},true);
var queued=false;
window.addEventListener('scroll',function(){
  if(queued)return;queued=true;
  requestAnimationFrame(function(){queued=false;send({type:'scroll',y:window.pageYOffset||0});});
},{passive:true});
var userMoved=false,restoring=false;
['wheel','touchstart','keydown','mousedown'].forEach(function(t){
  window.addEventListener(t,function(){userMoved=true;},{passive:true,capture:true});
});
function restore(){
  if(C.y<=0||restoring)return;
  restoring=true;
  var tries=0;
  (function step(){
    if(userMoved)return;
    window.scrollTo(0,C.y);
    if(Math.abs((window.pageYOffset||0)-C.y)>1&&tries++<40)requestAnimationFrame(step);
  })();
}
document.addEventListener('DOMContentLoaded',restore);
window.addEventListener('load',function(){restore();send({type:'ready'});});
})();`;
}

/**
 * Build the complete srcdoc for one page view. `html` is the author's
 * (already server-sanitized) markup and is placed in <body>, after all of our
 * own head content. It is never executed or trusted: see the layers above.
 */
export function buildSrcDoc(html: string, opts: SrcDocOptions): string {
  return [
    '<!doctype html>',
    '<html lang="en"><head>',
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${escapeHtml(buildCsp(opts.nonce))}">`,
    `<title>${escapeHtml(opts.title)}</title>`,
    `<style>${BASE_STYLES}</style>`,
    `<script nonce="${escapeHtml(opts.nonce)}">${bridgeSource(opts)}</script>`,
    '</head><body>',
    html,
    '</body></html>',
  ].join('\n');
}
