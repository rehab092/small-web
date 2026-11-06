import { expect, test, type Page } from '@playwright/test';
import {
  addressBar,
  backButton,
  expectShowing,
  forwardButton,
  openAs,
  recentVisits,
  typeAddress,
  tool,
} from './helpers';

const PERSON = 'wen-zhao';
const nowhere = (page: Page) => page.getByRole('heading', { name: 'There is nothing at this address' });

test.describe('addresses that lead nowhere', () => {
  test('a typed address with no site shows Nowhere and is recorded as not found', async ({ page, request }) => {
    await openAs(page, PERSON);
    await typeAddress(page, 'ghostship.zz');
    await expect(nowhere(page)).toBeVisible();
    await expect(addressBar(page)).toHaveValue('ghostship.zz');
    await expect(page.locator('main')).toContainText('ghostship.zz');

    await expect
      .poll(async () => (await recentVisits(request, PERSON, 1))[0])
      .toMatchObject({ address: 'ghostship.zz', via: 'typed', found: false });
  });

  test('a broken link inside a page works the same way, and Back returns to the page', async ({ page, request }) => {
    await openAs(page, PERSON, 'tidepool.zz');
    await expectShowing(page, 'tidepool.zz');
    await page.frameLocator('iframe.site-frame').locator('a[href="lost-lighthouse.zz"]').click();
    await expect(nowhere(page)).toBeVisible();
    await expect(addressBar(page)).toHaveValue('lost-lighthouse.zz');

    await expect
      .poll(async () => (await recentVisits(request, PERSON, 1))[0])
      .toMatchObject({ address: 'lost-lighthouse.zz', via: 'link', found: false });

    await backButton(page).click();
    await expectShowing(page, 'tidepool.zz');
    await forwardButton(page).click();
    await expect(nowhere(page)).toBeVisible(); // Nowhere is a real stop on the trail
  });

  test('Nowhere appears in history, marked as not found', async ({ page }) => {
    await openAs(page, PERSON);
    await typeAddress(page, 'ghostship.zz');
    await expect(nowhere(page)).toBeVisible();

    await tool(page, 'History').click();
    const row = page.locator('.visit').filter({ hasText: 'ghostship.zz' }).first();
    await expect(row).toBeVisible();
    await expect(row.getByText('not found')).toBeVisible();
  });

  test('Nowhere offers to publish a site at that address', async ({ page }) => {
    await openAs(page, PERSON);
    await typeAddress(page, 'ghostship.zz');
    await page.getByRole('button', { name: 'Publish a site here' }).click();
    await expect(page.getByPlaceholder('tidepool.zz', { exact: true })).toHaveValue('ghostship.zz');
  });
});
