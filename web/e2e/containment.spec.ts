import { expect, test, type Page } from '@playwright/test';
import {
  SITE_FRAME,
  expectShowing,
  openAs,
  siteFrame,
  uniqueAddress,
  publishSubmit,
} from './helpers';

const PERSON = 'ines-varga';
const ATTACKER = 'attacker.invalid';

/** Everything an author might try to get out of their box, in one page. */
const HOSTILE = `<h1 id="mark">Hostile page</h1>
<script>alert('script'); document.title = 'PWNED'; try { top.location = 'https://${ATTACKER}/top'; } catch (e) {}</script>
<img src="https://${ATTACKER}/pixel.png" onerror="alert('onerror'); document.body.setAttribute('data-pwned', '1')">
<svg onload="alert('svg'); document.body.setAttribute('data-pwned', '1')"></svg>
<a id="js" href="javascript:alert('js-href')">javascript link</a>
<a id="out" href="https://${ATTACKER}/x">external link</a>
<base href="https://${ATTACKER}/">
<link rel="stylesheet" href="https://${ATTACKER}/x.css">
<iframe src="https://${ATTACKER}/frame"></iframe>
<object data="https://${ATTACKER}/o"></object>
<form id="f" action="https://${ATTACKER}/post" method="post"><input name="a" value="1"><button id="submit">go</button></form>
<style>.cover{position:fixed;inset:-9999px;z-index:2147483647;background:rgba(255,0,0,.95)}</style>
<div class="cover">COVERING EVERYTHING</div>`;

interface Watch {
  dialogs: string[];
  attackerRequests: string[];
}

/** Record anything that would show an attacker succeeded. */
function watch(page: Page): Watch {
  const seen: Watch = { dialogs: [], attackerRequests: [] };
  page.on('dialog', (d) => {
    seen.dialogs.push(`${d.type()}: ${d.message()}`);
    void d.dismiss();
  });
  page.on('request', (r) => {
    if (r.url().includes(ATTACKER)) seen.attackerRequests.push(r.url());
  });
  return seen;
}

/** The chrome must be untouched and on top of everything the page can paint. */
async function expectChromeIntact(page: Page, titleBefore: string, urlBefore: string): Promise<void> {
  await expect(page.locator('header.chrome')).toBeVisible();
  const covered = await page.evaluate(() => {
    const el = document.elementFromPoint(300, 20);
    return !el?.closest('header.chrome');
  });
  expect(covered, 'something painted over the browser chrome').toBe(false);
  expect(page.url()).toBe(urlBefore);
  expect(await page.title()).toBe(titleBefore);
}

test.describe('hostile pages are contained', () => {
  test('a malicious preview shows only what the server would keep, and cannot alert, navigate or cover the chrome', async ({ page }) => {
    const seen = watch(page);
    await openAs(page, PERSON, 'about:publish');
    const titleBefore = await page.title();
    const urlBefore = page.url();

    await page.getByPlaceholder('What the page is called').fill('Hostile');
    await page.locator('textarea').fill(HOSTILE);
    await expect(page.locator(SITE_FRAME)).toBeVisible();
    const frame = await siteFrame(page);
    await expect(frame.locator('h1')).toBeVisible();

    // the preview is the server's sanitized page: none of the dangerous markup is there at all
    const body = await frame.evaluate(() => document.body.innerHTML);
    expect(body).not.toMatch(/<script/i);
    expect(body).not.toMatch(/\son\w+\s*=/i);
    expect(body).not.toMatch(/<(iframe|object|embed|form|base|link)\b/i);
    expect(body).not.toMatch(/javascript:/i);
    // the full-screen overlay was defanged to something that cannot cover anything
    expect(await frame.locator('.cover').evaluate((el) => getComputedStyle(el).position)).not.toBe('fixed');

    // and nothing that was in the source ran
    expect(await frame.evaluate(() => document.title)).not.toBe('PWNED');
    expect(await frame.evaluate(() => document.body.getAttribute('data-pwned'))).toBeNull();
    await page.waitForTimeout(500);

    expect(seen.dialogs).toEqual([]);
    expect(seen.attackerRequests).toEqual([]);
    await expectChromeIntact(page, titleBefore, urlBefore);
  });

  test('the frame is sandboxed with an opaque origin and a strict CSP', async ({ page }) => {
    const seen = watch(page);
    await openAs(page, PERSON, 'about:publish');
    const urlBefore = page.url();
    await page.getByPlaceholder('What the page is called').fill('Probe');
    await page.locator('textarea').fill('<h1>probe</h1>');
    const frame = await siteFrame(page);
    await expect(frame.locator('h1')).toBeVisible();

    // exactly allow-scripts: never same-origin, top-navigation, forms, popups or modals
    expect(await page.locator(SITE_FRAME).getAttribute('sandbox')).toBe('allow-scripts');

    // the page cannot read the embedding app
    const probes = await frame.evaluate(() => {
      const attempt = (fn: () => unknown): string => {
        try {
          fn();
          return 'allowed';
        } catch (e) {
          return `blocked:${(e as Error).name}`;
        }
      };
      return {
        parentDom: attempt(() => parent.document.title),
        topDom: attempt(() => top!.document.body),
        localStorage: attempt(() => window.localStorage.getItem('x')),
        cookie: attempt(() => document.cookie),
        popup: window.open('about:blank') === null ? 'blocked' : 'allowed',
        origin: location.origin,
      };
    });
    expect(probes.parentDom).toBe('blocked:SecurityError');
    expect(probes.topDom).toBe('blocked:SecurityError');
    expect(probes.localStorage).toBe('blocked:SecurityError');
    expect(probes.cookie).toBe('blocked:SecurityError');
    expect(probes.popup).toBe('blocked');
    expect(probes.origin).toBe('null');

    // it cannot navigate the browser away, and modal dialogs are not allowed
    await frame.evaluate((url) => {
      try {
        top!.location.href = url;
      } catch {
        /* blocked is the expected outcome */
      }
      alert('modal');
    }, `https://${ATTACKER}/`);
    await page.waitForTimeout(500);
    expect(page.url()).toBe(urlBefore);
    expect(seen.dialogs).toEqual([]);
    expect(seen.attackerRequests).toEqual([]);

    // the policy inside the document denies by default and only runs our bridge
    const csp = await frame.evaluate(
      () => document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') ?? '',
    );
    expect(csp).toContain("default-src 'none'");
    expect(csp).toMatch(/script-src 'nonce-[\w-]+'/);
    expect(csp).toContain("form-action 'none'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe/);
    const metas = await frame.evaluate(() => [...document.head.children].map((el) => el.tagName));
    expect(metas.indexOf('META')).toBeLessThan(metas.indexOf('SCRIPT')); // policy comes before the bridge
  });

  test('a published hostile page comes back sanitized, and is still contained when visited', async ({ page }) => {
    const seen = watch(page);
    const address = uniqueAddress('hostile');
    await openAs(page, PERSON, 'about:publish');
    const titleBefore = await page.title();

    await page.getByPlaceholder('tidepool.zz', { exact: true }).fill(address);
    await page.getByPlaceholder('What the page is called').fill('Hostile published');
    await page.locator('textarea').fill(HOSTILE);
    await publishSubmit(page).click();
    await expect(page.locator('.published')).toContainText(`Published at ${address}`);

    await page.getByRole('button', { name: `Visit ${address}` }).click();
    await expectShowing(page, address);
    const urlBefore = page.url();
    const frame = await siteFrame(page);

    // what the server kept: no script, handlers, frames, forms, base or javascript: urls
    const body = await frame.evaluate(() => document.body.innerHTML);
    expect(body).not.toMatch(/<script/i);
    expect(body).not.toMatch(/\son\w+\s*=/i);
    expect(body).not.toMatch(/<(iframe|object|embed|form|base)\b/i);
    expect(body).not.toMatch(/javascript:/i);
    expect(body).toContain('Hostile page'); // harmless content survives

    // and whatever is left is still unable to reach out
    expect(await frame.evaluate(() => document.title)).not.toBe('PWNED');
    await page.waitForTimeout(500);
    expect(seen.dialogs).toEqual([]);
    expect(seen.attackerRequests).toEqual([]);
    await expectChromeIntact(page, await page.title(), urlBefore);
    expect(titleBefore).toMatch(/Small Web/);
  });

  test('links in a page: addresses are followed, real-web links are shown but never followed', async ({ page }) => {
    const seen = watch(page);
    await openAs(page, PERSON, 'about:publish');
    const address = uniqueAddress('linky');
    await page.getByPlaceholder('tidepool.zz', { exact: true }).fill(address);
    await page.getByPlaceholder('What the page is called').fill('Links');
    await page
      .locator('textarea')
      .fill(
        `<h1>Links</h1><p><a id="in" href="ironbread.zz">inside</a> <a id="out" href="https://${ATTACKER}/x">outside</a></p>`,
      );
    await publishSubmit(page).click();
    await page.getByRole('button', { name: /^Visit / }).click();
    // Wait until the page has really arrived (the URL's addr follows a moment after the frame appears).
    // Reading page.url() as soon as the frame was visible raced with that update on a slower machine.
    await expectShowing(page, address);
    const here = page.url();

    await page.frameLocator(SITE_FRAME).locator('#out').click();
    await expect(page.getByRole('status').filter({ hasText: 'outside the Small Web' })).toBeVisible();
    expect(page.url()).toBe(here);
    expect(seen.attackerRequests).toEqual([]);

    await page.frameLocator(SITE_FRAME).locator('#in').click();
    await expectShowing(page, 'ironbread.zz');
  });
});
