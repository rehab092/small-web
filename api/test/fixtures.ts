/** Inputs shared by the publish and preview tests, so both are always checked against the same pages. */

export const NOTHING_TO_SHOW_MESSAGE = 'nothing left to show after removing disallowed content';

/** Pages that sanitize to nothing readable. Publishing any of them must be a 400 with fields.html. */
export const EMPTY_AFTER_SANITIZING: Array<[name: string, html: string]> = [
  ['script only', '<script>alert(1)</script>'],
  ['empty div', '<div></div>'],
  ['empty paragraph', '<p></p>'],
  ['style only', '<style>p{color:red}</style>'],
  ['whitespace only', '   \n\t  '],
  ['comment only', '<!-- nothing to see -->'],
  ['disallowed elements only', '<iframe src="https://e.example"></iframe><form><input name=x></form>'],
  ['image only (images are not allowed)', '<img src=x onerror=alert(1)>'],
  ['non-breaking spaces only', '<p>&nbsp;&nbsp;</p>'],
  ['whole empty document', '<html><head><title>T</title></head><body></body></html>'],
];

/** Pages with something readable, including hostile ones whose dangerous parts must be removed. */
export const READABLE_PAGES: Array<[name: string, html: string]> = [
  ['plain prose', '<h1>Hello</h1><p>Some words here.</p>'],
  ['script plus text', '<script>alert(1)</script><p>but this stays</p>'],
  ['position comment bypass', '<style>.c{position/**/:fixed;top:0}</style><div class="c" style="position:/* x */sticky">covers the page</div>'],
  ['position var() bypass', '<div style="--p:fixed;position:var(--p)">text</div>'],
  ['javascript link', '<p><a href="javascript:alert(1)">click</a></p>'],
  ['event handler', '<p onclick="alert(1)">text</p>'],
  ['stray document tags', '<!doctype html><html lang="en"><head><title>Secret</title></head><body class="x"><p>body text</p></body></html>'],
  ['symbol only', '<p>★</p>'],
  ['unicode prose', '<p>Zażółć gęślą jaźń — 你好 — مرحبا</p>'],
];
