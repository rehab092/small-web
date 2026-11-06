import { expect, test, type Page } from '@playwright/test';
import {
  addressBar,
  backButton,
  expectShowing,
  forwardButton,
  openAs,
  pageFrame,
  recentVisits,
  uniqueAddress,
  tool, publishSubmit,
} from './helpers';

const PERSON = 'ines-varga'; // an author

const addressField = (page: Page) => page.getByPlaceholder('tidepool.zz', { exact: true });
const titleField = (page: Page) => page.getByPlaceholder('What the page is called');
const htmlField = (page: Page) => page.locator('textarea');

async function openPublish(page: Page): Promise<void> {
  await openAs(page, PERSON);
  await tool(page, 'Publish').click();
  await expect(page.getByRole('heading', { name: 'Put a page on the Small Web' })).toBeVisible();
}

async function fill(page: Page, address: string, title: string, html: string): Promise<void> {
  await addressField(page).fill(address);
  await titleField(page).fill(title);
  await htmlField(page).fill(html);
}

test.describe('publish', () => {
  test('publish, visit the new page, then find it in search', async ({ page, request }) => {
    const address = uniqueAddress('brinepool');
    // a word no other page contains, so earlier runs' leftovers cannot tie with this page in search
    const term = 'starfish' + Math.random().toString(36).slice(2, 10);
    await openPublish(page);
    await fill(
      page,
      address.toUpperCase(), // normalized on the way in
      'Brine pool notes',
      `<h1>Brine</h1><p>Hypersaline pockets where wandering ${term} gather. See <a href="ironbread.zz">bread</a>.</p>`,
    );
    await expect(page.getByText(`Will be published at ${address}`)).toBeVisible();
    // the preview renders what was typed, inside the sandbox
    await expect(page.frameLocator('iframe.site-frame').locator('h1')).toHaveText('Brine');

    await publishSubmit(page).click();
    await expect(page.locator('.published')).toContainText(`Published at ${address}`);

    await page.getByRole('button', { name: `Visit ${address}` }).click();
    await expectShowing(page, address);
    await expect(page).toHaveTitle(/Brine pool notes/);
    await expect
      .poll(async () => (await recentVisits(request, PERSON, 1))[0])
      .toMatchObject({ address, found: true });

    await tool(page, 'Search').click();
    const input = page.getByLabel('Search query');
    await input.fill(term);
    await input.press('Enter');
    await expect(page.locator('.result__address')).toHaveText([address]);

    // a link on the published page works like any other
    await page.locator('.result__link').first().click();
    await pageFrame(page).locator('a[href="ironbread.zz"]').click();
    await expectShowing(page, 'ironbread.zz');
  });

  test('a taken address says so, and the author can replace the page', async ({ page }) => {
    const address = uniqueAddress('tidal');
    await openPublish(page);
    await fill(page, address, 'First draft', '<h1>First</h1><p>one</p>');
    await publishSubmit(page).click();
    await expect(page.locator('.published')).toContainText(`Published at ${address}`);

    await publishSubmit(page).click();
    await expect(page.getByText('That address is already published.')).toBeVisible();

    // editing the page afterwards must not hide the way out
    await titleField(page).fill('Second draft');
    await htmlField(page).fill('<h1>Second</h1><p>two</p>');
    await page.getByRole('button', { name: 'Replace the existing page' }).click();
    await expect(page.locator('.published')).toContainText(`Replaced at ${address}`);

    await page.getByRole('button', { name: `Visit ${address}` }).click();
    await expectShowing(page, address);
    await expect(pageFrame(page).locator('h1')).toHaveText('Second');
    await expect(page).toHaveTitle(/Second draft/);
  });

  test('bad input is explained next to the field and cannot be submitted', async ({ page }) => {
    await openPublish(page);
    await expect(publishSubmit(page)).toBeDisabled();

    await addressField(page).fill('not an address');
    await expect(page.getByText('Use a name ending in .zz')).toBeVisible();
    await titleField(page).fill('Something');
    await htmlField(page).fill('<p>hi</p>');
    await expect(publishSubmit(page)).toBeDisabled();

    await addressField(page).fill('example.com');
    await expect(page.getByText('Use a name ending in .zz')).toBeVisible();
    await expect(publishSubmit(page)).toBeDisabled();

    await addressField(page).fill(uniqueAddress('ok'));
    await expect(page.getByText('Use a name ending in .zz')).toHaveCount(0);
    await expect(publishSubmit(page)).toBeEnabled();
  });

  test('a half-written page survives leaving the form and coming Back', async ({ page }) => {
    await openPublish(page);
    await fill(page, 'draftpage.zz', 'Draft title', '<p>work in progress</p>');

    await tool(page, 'Home').click();
    await expect(addressBar(page)).toHaveValue('');
    await expect(forwardButton(page)).toBeDisabled();

    await backButton(page).click();
    await expect(addressField(page)).toHaveValue('draftpage.zz');
    await expect(titleField(page)).toHaveValue('Draft title');
    await expect(htmlField(page)).toHaveValue('<p>work in progress</p>');
  });
});
