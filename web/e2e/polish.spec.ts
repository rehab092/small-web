import { expect, test, type Page } from '@playwright/test';
import {
  addressBar,
  backButton,
  expectShowing,
  followLink,
  forwardButton,
  historyLength,
  openAs,
  recentVisits,
  siteFrame,
  tool,
} from './helpers';

/** Make every site request take `ms`, so navigations stay pending long enough to interrupt. */
async function slowSites(page: Page, ms: number): Promise<void> {
  await page.route(/\/sites\/[^/?]+/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    await route.continue();
  });
}

const visitTags = async (request: Parameters<typeof recentVisits>[0], person: string, n: number) =>
  (await recentVisits(request, person, n)).map((v) => `${v.address}:${v.via}`);

test.describe('navigations that never finish leave nothing behind', () => {
  test('several links followed in the same tick leave one entry and one visit', async ({ page, request }) => {
    const who = 'kofi-mensah';
    await openAs(page, who, 'tidepool.zz');
    await expectShowing(page, 'tidepool.zz');
    const length = await historyLength(page);
    await slowSites(page, 600);

    // three links, one tick: the first two are superseded before their pages arrive
    const frame = await siteFrame(page);
    await frame.evaluate(() => {
      for (const href of ['saltroad.zz', 'cartographers.zz', 'mothledger.zz']) {
        document.querySelector<HTMLElement>(`a[href="${href}"]`)?.click();
      }
    });
    await expect(page.getByRole('status', { name: 'Loading' })).toBeVisible();
    await expectShowing(page, 'mothledger.zz');

    expect(await historyLength(page)).toBe(length + 1); // exactly one real entry was added
    await expect
      .poll(async () => (await visitTags(request, who, 2)).join())
      .toBe('mothledger.zz:link,tidepool.zz:typed');
    await page.waitForTimeout(900); // long enough for any aborted load to misbehave
    const recent = await visitTags(request, who, 4);
    expect(recent).not.toContain('saltroad.zz:link');
    expect(recent).not.toContain('cartographers.zz:link');

    // the trail has no ghost pages: Back is the page we came from
    await backButton(page).click();
    await expectShowing(page, 'tidepool.zz');
    await expect(backButton(page)).toBeDisabled();
    await forwardButton(page).click();
    await expectShowing(page, 'mothledger.zz');
    await expect(forwardButton(page)).toBeDisabled();
  });

  test('pressing Back while a page is loading cancels it for good', async ({ page, request }) => {
    const who = 'wen-zhao';
    await openAs(page, who, 'tidepool.zz');
    await followLink(page, 'saltroad.zz');
    const length = await historyLength(page);
    const before = await visitTags(request, who, 1);
    await slowSites(page, 900);

    await (await siteFrame(page)).locator('a[href="nightfreight.zz"]').first().dispatchEvent('click');
    await expect(page.getByRole('status', { name: 'Loading' })).toBeVisible();
    await expect(addressBar(page)).toHaveValue('nightfreight.zz'); // shows what is being loaded
    await backButton(page).click();
    await expectShowing(page, 'tidepool.zz');

    await page.waitForTimeout(1300); // the cancelled load would have finished by now
    await expectShowing(page, 'tidepool.zz'); // still here: it did not sneak in afterwards
    expect(await historyLength(page)).toBe(length);
    await expect(page.getByRole('status', { name: 'Loading' })).toHaveCount(0);
    expect((await visitTags(request, who, 5)).filter((t) => t.startsWith('nightfreight.zz:link'))).toEqual(
      before.filter((t) => t.startsWith('nightfreight.zz:link')),
    );

    // forward is the page we left, never the page that was cancelled
    await forwardButton(page).click();
    await expectShowing(page, 'saltroad.zz');
    await expect(forwardButton(page)).toBeDisabled();
  });

  test('switching person while a page is loading cancels it', async ({ page }) => {
    await openAs(page, 'ines-varga', 'tidepool.zz');
    await slowSites(page, 700);
    await (await siteFrame(page)).locator('a[href="saltroad.zz"]').first().dispatchEvent('click');
    await expect(page.getByRole('status', { name: 'Loading' })).toBeVisible();

    await page.getByLabel('Browsing as').selectOption('tomas-reyes');
    await page.waitForTimeout(1000);
    await expect(addressBar(page)).toHaveValue(''); // Tomas's Home; the old load never landed
    await expect(backButton(page)).toBeDisabled();
    await expect(page).toHaveURL(/p=tomas-reyes/);
  });
});

test.describe('the page URL encodes the search query once', () => {
  async function search(page: Page, query: string): Promise<void> {
    const input = page.getByLabel('Search query');
    await input.fill(query);
    await input.press('Enter');
    await expect(page.getByText(/No pages match|pages? for/)).toBeVisible();
  }

  test('a query with spaces reads naturally in the URL and survives reload and Back', async ({ page }) => {
    await openAs(page, 'kofi-mensah');
    await tool(page, 'Search').click();
    await search(page, 'xyzzyplugh nothinghere');

    expect(page.url()).toContain('q=xyzzyplugh+nothinghere');
    expect(page.url()).not.toContain('%25');
    expect(page.url()).not.toContain('%2520');

    await page.reload();
    await expect(page.getByLabel('Search query')).toHaveValue('xyzzyplugh nothinghere');
    await expect(page.getByText('No pages match “xyzzyplugh nothinghere”.')).toBeVisible();

    await tool(page, 'Home').click();
    await page.goBack();
    await expect(page.getByLabel('Search query')).toHaveValue('xyzzyplugh nothinghere');
    expect(page.url()).not.toContain('%25');
  });

  test('special characters are encoded once and round-trip', async ({ page }) => {
    await openAs(page, 'kofi-mensah');
    await tool(page, 'Search').click();
    await search(page, 'salt & pepper');
    expect(page.url()).toContain('q=salt+%26+pepper');
    expect(page.url()).not.toContain('%25');

    await page.reload();
    await expect(page.getByLabel('Search query')).toHaveValue('salt & pepper');
  });

  test('a query typed in the address bar is encoded once too', async ({ page }) => {
    await openAs(page, 'kofi-mensah');
    await addressBar(page).fill('rock pools at dawn');
    await addressBar(page).press('Enter');
    await expect(page.getByLabel('Search query')).toHaveValue('rock pools at dawn');
    expect(page.url()).toContain('q=rock+pools+at+dawn');
    expect(page.url()).not.toContain('%25');
  });
});

test.describe('favicon', () => {
  test('the page declares an icon, it loads, and there is no favicon 404', async ({ page }) => {
    const missing: string[] = [];
    page.on('response', (r) => {
      if (/favicon|icon\./.test(r.url()) && r.status() >= 400) missing.push(`${r.status()} ${r.url()}`);
    });
    await openAs(page, 'kofi-mensah');

    const href = await page.locator('link[rel~="icon"]').first().getAttribute('href');
    expect(href).toBeTruthy();
    const res = await page.request.get(new URL(href!, page.url()).toString());
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('image/svg+xml');
    expect(await res.text()).toContain('<svg');

    await page.waitForTimeout(500);
    expect(missing).toEqual([]);
  });
});
