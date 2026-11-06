import { expect, test, type Page } from '@playwright/test';
import { backButton, expectShowing, openAs, recentVisits, typeAddress, tool } from './helpers';

const PERSON = 'tomas-reyes'; // has visited nearly everything

const rows = (page: Page) => page.locator('.visit');
const historyScroll = (page: Page) => page.locator('.page-scroll').evaluate((el) => Math.round(el.scrollTop));

test.describe('history', () => {
  test('lists the person’s visits newest first, grouped by day', async ({ page }) => {
    await openAs(page, PERSON, 'about:history');
    await expect(rows(page).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /Where Tomas Reyes has been/ })).toBeVisible();

    // the seeded hour of browsing was on 2 November 2026
    await expect(page.getByRole('heading', { name: /2 November 2026/ })).toBeVisible();

    const times = await page.locator('.visit__time').evaluateAll((els) => els.map((e) => e.getAttribute('datetime') ?? ''));
    expect(times.length).toBeGreaterThan(10);
    const sorted = [...times].sort().reverse();
    expect(times).toEqual(sorted);
  });

  test('is per person', async ({ page }) => {
    await openAs(page, PERSON, 'about:history');
    await expect(rows(page).first()).toBeVisible();
    const tomas = await rows(page).count();

    await page.getByLabel('Browsing as').selectOption('kofi-mensah');
    await tool(page, 'History').click();
    await expect(page.getByRole('heading', { name: /Where Kofi Mensah has been/ })).toBeVisible();
    await expect(rows(page).first()).toBeVisible();
    expect(await rows(page).count()).not.toBe(tomas);
  });

  test('loads more as the list is scrolled', async ({ page }) => {
    await openAs(page, PERSON, 'about:history');
    await expect(rows(page).first()).toBeVisible();
    const first = await rows(page).count();
    expect(first).toBe(50); // one API page

    await page.locator('.page-scroll').evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect.poll(() => rows(page).count()).toBeGreaterThan(first);
    await page.locator('.page-scroll').evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect(page.getByText('That is the beginning.')).toBeVisible();
  });

  test('a click jumps to the page and is recorded as coming from history', async ({ page, request }) => {
    await openAs(page, PERSON, 'about:history');
    const row = rows(page).filter({ hasText: 'saltroad.zz' }).first();
    await row.click();
    await expectShowing(page, 'saltroad.zz');

    await expect
      .poll(async () => (await recentVisits(request, PERSON, 1))[0])
      .toMatchObject({ address: 'saltroad.zz', via: 'history', found: true });
  });

  test('going back from a jump returns to the history list at the same scroll', async ({ page }) => {
    await openAs(page, PERSON, 'about:history');
    await expect(rows(page).first()).toBeVisible();
    await page.locator('.page-scroll').evaluate((el) => {
      el.scrollTop = 600;
    });
    await expect.poll(() => historyScroll(page)).toBeGreaterThan(300);
    const left = await historyScroll(page);
    const before = await rows(page).count();

    // dispatch rather than click: a real click would scroll the row into view first
    await rows(page).nth(12).dispatchEvent('click');
    await expect(page.locator('iframe.site-frame, h1').first()).toBeVisible();

    await backButton(page).click();
    await expect(rows(page).first()).toBeVisible();
    expect(await rows(page).count()).toBe(before);
    await expect.poll(() => historyScroll(page)).toBeGreaterThanOrEqual(left - 2);
    expect(await historyScroll(page)).toBeLessThanOrEqual(left + 2);
  });

  test('new visits show up under Today', async ({ page, request }) => {
    await openAs(page, 'odile-mercier');
    await typeAddress(page, 'cartographers.zz');
    await expectShowing(page, 'cartographers.zz');
    await expect
      .poll(async () => (await recentVisits(request, 'odile-mercier', 1))[0]?.address)
      .toBe('cartographers.zz');

    await tool(page, 'History').click();
    await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
    await expect(rows(page).first()).toContainText('cartographers.zz');
  });
});
