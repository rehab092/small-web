import { expect, test, type Page } from '@playwright/test';
import { addressBar, backButton, expectShowing, forwardButton, openAs, recentVisits, typeAddress, tool } from './helpers';

const PERSON = 'kofi-mensah';

const resultAddresses = (page: Page) => page.locator('.result__address').allTextContents();
const resultsScroll = (page: Page) =>
  page.locator('.page-scroll').evaluate((el) => Math.round(el.scrollTop));

async function search(page: Page, query: string): Promise<void> {
  const input = page.getByLabel('Search query');
  await input.fill(query);
  await input.press('Enter');
}

test.describe('search', () => {
  test('ranks the page that is about the term first', async ({ page }) => {
    await openAs(page, PERSON);
    await tool(page, 'Search').click();
    await search(page, 'tide');

    await expect(page.locator('.result').first()).toBeVisible();
    expect((await resultAddresses(page))[0]).toBe('tidepool.zz');
    expect(await page.locator('.result').count()).toBeGreaterThan(1);
    await expect(page.getByRole('status').filter({ hasText: 'for “tide”' })).toBeVisible();
    // snippets highlight the match and are plain text, never injected HTML
    await expect(page.locator('.result__snippet mark').first()).toBeVisible();
  });

  test('finds pages by what is written in them, not only by title', async ({ page }) => {
    await openAs(page, PERSON);
    await tool(page, 'Search').click();
    await search(page, 'limpets'); // only appears in body text on tidepool.zz
    await expect(page.locator('.result').first()).toBeVisible();
    expect(await resultAddresses(page)).toContain('tidepool.zz');
  });

  test('empty and no-hit searches are friendly, not errors', async ({ page }) => {
    await openAs(page, PERSON);
    await tool(page, 'Search').click();
    await expect(page.getByText('Search looks inside every page')).toBeVisible();

    await search(page, 'zzqxjwv');
    await expect(page.getByText('No pages match “zzqxjwv”.')).toBeVisible();
    await expect(page.locator('.result')).toHaveCount(0);
  });

  test('free text typed in the address bar becomes a search', async ({ page }) => {
    await openAs(page, PERSON);
    await typeAddress(page, 'rock pools');
    await expect(page.getByLabel('Search query')).toHaveValue('rock pools');
    await expect(page.locator('.result').first()).toBeVisible();
  });

  test('going back from a result returns to the same results at the same scroll', async ({ page, request }) => {
    await page.setViewportSize({ width: 1280, height: 360 }); // short, so the results must scroll
    await openAs(page, PERSON);
    await tool(page, 'Search').click();
    await search(page, 'tide');
    await expect(page.locator('.result').nth(3)).toBeVisible();

    const before = await resultAddresses(page);
    await page.locator('.page-scroll').evaluate((el) => {
      el.scrollTop = 160;
    });
    await expect.poll(() => resultsScroll(page)).toBeGreaterThan(40);
    const left = await resultsScroll(page);

    await page.locator('.result__link').nth(1).click();
    await expectShowing(page, before[1]!);

    await backButton(page).click();
    await expect(page.locator('.result').first()).toBeVisible();
    expect(await resultAddresses(page)).toEqual(before);
    await expect(page.getByLabel('Search query')).toHaveValue('tide');
    await expect.poll(() => resultsScroll(page)).toBeGreaterThanOrEqual(left - 2);
    expect(await resultsScroll(page)).toBeLessThanOrEqual(left + 2);

    // the real browser Back and Forward land in the same places
    await forwardButton(page).click();
    await expectShowing(page, before[1]!);
    await page.goBack();
    await expect(page.locator('.result').first()).toBeVisible();
    expect(await resultAddresses(page)).toEqual(before);
    await expect(addressBar(page)).toHaveValue('tide');

    // the arrival from the result was recorded as coming from search
    await expect
      .poll(async () => (await recentVisits(request, PERSON, 3)).map((v) => `${v.address}:${v.via}`))
      .toContain(`${before[1]}:search`);
  });
});
