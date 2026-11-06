import { expect, type APIRequestContext, type Frame, type Page } from '@playwright/test';
import { API_URL } from '../playwright.config';

export const SITE_FRAME = 'iframe.site-frame';

export interface VisitRow {
  address: string;
  via: string;
  found: boolean;
  title: string | null;
}

/** Open the browser as `person`, optionally straight at an address. */
export async function openAs(page: Page, person: string, addr?: string): Promise<void> {
  const qs = new URLSearchParams({ p: person });
  if (addr) qs.set('addr', addr);
  await page.goto(`/?${qs}`);
  await expect(page.getByLabel('Address bar')).toBeVisible();
  await expect(backButton(page)).toBeVisible();
}

export const addressBar = (page: Page) => page.getByLabel('Address bar');
/** A button in the browser chrome. Scoped and exact: page content has buttons with similar names. */
export const tool = (page: Page, name: string) =>
  page.locator('header.chrome').getByRole('button', { name, exact: true });
export const backButton = (page: Page) => tool(page, 'Back');
export const forwardButton = (page: Page) => tool(page, 'Forward');
/** The submit button of the publish form. */
export const publishSubmit = (page: Page) => page.locator('form.form button[type="submit"]');
export const pageFrame = (page: Page) => page.frameLocator(SITE_FRAME);

/** Type into the address bar and press Enter. */
export async function typeAddress(page: Page, text: string): Promise<void> {
  const bar = addressBar(page);
  await bar.fill(text);
  await bar.press('Enter');
}

/** Wait until the address bar and the rendered page agree on `address`. */
export async function expectShowing(page: Page, address: string): Promise<void> {
  await expect(addressBar(page)).toHaveValue(address);
  await expect(page.locator(SITE_FRAME)).toBeVisible();
  await expect(pageFrame(page).locator('h1').first()).toBeVisible();
}

/** Click a link inside the page and wait for the destination to show. */
export async function followLink(page: Page, href: string): Promise<void> {
  await pageFrame(page).locator(`a[href="${href}"]`).first().click();
  await expectShowing(page, href);
}

/**
 * Follow a link without scrolling to it first. A real click scrolls the link into
 * view, which changes the position being tested; this leaves the page where it is.
 */
export async function followLinkInPlace(page: Page, href: string): Promise<void> {
  await pageFrame(page).locator(`a[href="${href}"]`).first().dispatchEvent('click');
  await expectShowing(page, href);
}

/** The live Frame of the current page (re-fetch after every navigation). */
export async function siteFrame(page: Page): Promise<Frame> {
  const handle = await page.locator(SITE_FRAME).elementHandle();
  const frame = await handle?.contentFrame();
  if (!frame) throw new Error('no page frame');
  return frame;
}

export const frameScroll = async (page: Page): Promise<number> =>
  Math.round(await (await siteFrame(page)).evaluate(() => window.pageYOffset));

/**
 * Scroll the page inside the frame (clamped to what it can scroll) and wait until
 * the browser has recorded exactly that offset. Returns the offset.
 */
export async function scrollPageTo(page: Page, person: string, address: string, y: number): Promise<number> {
  const frame = await siteFrame(page);
  const actual = await frame.evaluate((top) => {
    window.scrollTo(0, Math.min(top, document.documentElement.scrollHeight - window.innerHeight));
    return Math.round(window.pageYOffset);
  }, y);
  await expect.poll(() => storedScroll(page, person, address)).toBe(actual);
  return actual;
}

/** What the session has remembered for the entry showing `address`. */
export async function storedScroll(page: Page, person: string, address: string): Promise<number> {
  return page.evaluate(
    ([who, addr]) => {
      const raw = sessionStorage.getItem(`sw:stack:${who}`);
      if (!raw) return -1;
      const { stack } = JSON.parse(raw) as { stack: { index: number; entries: { addr: string; scroll: number }[] } };
      const entry = stack.entries[stack.index];
      return entry && entry.addr === addr ? entry.scroll : -1;
    },
    [person, address] as const,
  );
}

/** Wait until the page is scrolled to within two pixels of `y`. */
export async function expectScrollNear(page: Page, y: number): Promise<void> {
  await expect
    .poll(async () => Math.abs((await frameScroll(page)) - y), { message: `scroll should be near ${y}` })
    .toBeLessThanOrEqual(2);
}

export const historyLength = (page: Page) => page.evaluate(() => history.length);

/** Newest-first visits recorded by the API for `person`. */
export async function recentVisits(
  request: APIRequestContext,
  person: string,
  limit = 10,
): Promise<VisitRow[]> {
  const res = await request.get(`${API_URL}/people/${person}/visits?limit=${limit}`);
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { items: VisitRow[] };
  return body.items.map(({ address, via, found, title }) => ({ address, via, found, title }));
}

/** A unique, valid address so reruns never collide with earlier publishes. */
export function uniqueAddress(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}.zz`;
}
