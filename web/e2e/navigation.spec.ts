import { expect, test } from '@playwright/test';
import {
  addressBar,
  backButton,
  expectShowing,
  followLink,
  forwardButton,
  historyLength,
  openAs,
  pageFrame,
  recentVisits,
  typeAddress,
} from './helpers';

const PERSON = 'kofi-mensah';

/** A link on the current page to some small-web address other than `except`. */
async function otherLink(page: import('@playwright/test').Page, ...except: string[]): Promise<string> {
  const hrefs = await pageFrame(page)
    .locator('a[href$=".zz"]')
    .evaluateAll((links) => links.map((a) => a.getAttribute('href') ?? ''));
  const found = hrefs.find((h) => h.endsWith('.zz') && !except.includes(h));
  if (!found) throw new Error(`no link other than ${except.join(', ')} on this page`);
  return found;
}

test.describe('address bar and links', () => {
  test('typed input is normalized and the page shows', async ({ page }) => {
    await openAs(page, PERSON);
    await typeAddress(page, '  TidePool.ZZ/ ');
    await expectShowing(page, 'tidepool.zz');
    await expect(page).toHaveURL(/addr=tidepool\.zz/);
  });

  test('a bare name gets .zz and http:// is stripped', async ({ page }) => {
    await openAs(page, PERSON);
    await typeAddress(page, 'http://IronBread/');
    await expectShowing(page, 'ironbread.zz');
  });

  test('a real-web address is reported, never requested or followed', async ({ page }) => {
    const external: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('example.com')) external.push(r.url());
    });
    await openAs(page, PERSON, 'tidepool.zz');
    await typeAddress(page, 'https://example.com/page');
    await expect(page.getByRole('status').filter({ hasText: 'outside the Small Web' })).toBeVisible();
    await expect(page).toHaveURL(/addr=tidepool\.zz/);
    expect(external).toEqual([]);
  });

  test('every arrival is recorded once with how it was reached', async ({ page, request }) => {
    const who = 'odile-mercier'; // own person: the newest-first order below stays unambiguous
    await openAs(page, who);
    await typeAddress(page, 'tidepool.zz');
    await expectShowing(page, 'tidepool.zz');
    await followLink(page, 'saltroad.zz');
    await backButton(page).click();
    await expectShowing(page, 'tidepool.zz');
    await forwardButton(page).click();
    await expectShowing(page, 'saltroad.zz');

    await expect
      .poll(async () => (await recentVisits(request, who, 4)).map((v) => `${v.address}:${v.via}`))
      .toEqual(['saltroad.zz:forward', 'tidepool.zz:back', 'saltroad.zz:link', 'tidepool.zz:typed']);
  });
});

test.describe('back, forward and a lost forward', () => {
  test('trail four deep, back x3, forward x2, then a new link loses forward', async ({ page }) => {
    await openAs(page, PERSON, 'tidepool.zz');
    await expectShowing(page, 'tidepool.zz');
    const base = await historyLength(page);

    await followLink(page, 'saltroad.zz');
    await followLink(page, 'nightfreight.zz');
    await followLink(page, 'ironbread.zz');
    // exactly one real browser entry per page: never a double
    expect(await historyLength(page)).toBe(base + 3);
    await expect(forwardButton(page)).toBeDisabled();

    for (const expected of ['nightfreight.zz', 'saltroad.zz', 'tidepool.zz']) {
      await backButton(page).click();
      await expectShowing(page, expected);
    }
    await expect(backButton(page)).toBeDisabled();
    await expect(forwardButton(page)).toBeEnabled();
    expect(await historyLength(page)).toBe(base + 3); // moving never adds entries

    await forwardButton(page).click();
    await expectShowing(page, 'saltroad.zz');
    await forwardButton(page).click();
    await expectShowing(page, 'nightfreight.zz');
    await expect(forwardButton(page)).toBeEnabled(); // ironbread.zz is still ahead

    // a new link from the middle of the trail throws the forward pages away
    const fresh = await otherLink(page, 'ironbread.zz', 'saltroad.zz', 'nightfreight.zz');
    await followLink(page, fresh);
    await expect(forwardButton(page)).toBeDisabled();
    await expect(backButton(page)).toBeEnabled();
    expect(await historyLength(page)).toBe(base + 3); // 3 entries + the new one replaced ironbread

    await backButton(page).click();
    await expectShowing(page, 'nightfreight.zz');
    await forwardButton(page).click();
    await expectShowing(page, fresh); // forward goes to the new page, not the lost one
    await expect(forwardButton(page)).toBeDisabled();
  });

  test("the real browser's Back and Forward buttons do the same thing", async ({ page }) => {
    await openAs(page, PERSON, 'tidepool.zz');
    await followLink(page, 'saltroad.zz');
    await followLink(page, 'nightfreight.zz');
    const length = await historyLength(page);

    await page.goBack();
    await expectShowing(page, 'saltroad.zz');
    await expect(forwardButton(page)).toBeEnabled();
    await expect(backButton(page)).toBeEnabled();

    await page.goBack();
    await expectShowing(page, 'tidepool.zz');
    await expect(backButton(page)).toBeDisabled();

    await page.goForward();
    await page.goForward();
    await expectShowing(page, 'nightfreight.zz');
    await expect(forwardButton(page)).toBeDisabled();
    expect(await historyLength(page)).toBe(length);

    // and the toolbar still agrees after using the real buttons
    await backButton(page).click();
    await expectShowing(page, 'saltroad.zz');
  });

  test('rapid back clicks stop at the first page instead of leaving the app', async ({ page }) => {
    await openAs(page, PERSON, 'tidepool.zz');
    await followLink(page, 'saltroad.zz');
    await followLink(page, 'nightfreight.zz');

    // ten clicks in the same tick, before the browser has answered the first
    await page.evaluate(() => {
      const back = document.querySelector<HTMLButtonElement>('button[aria-label="Back"]');
      for (let i = 0; i < 10; i++) back?.click();
    });
    await expectShowing(page, 'tidepool.zz');
    await expect(backButton(page)).toBeDisabled();
    await expect(page).toHaveURL(/p=kofi-mensah/);
  });

  test('reloading keeps the current position, its history and the way forward', async ({ page }) => {
    await openAs(page, PERSON, 'tidepool.zz');
    await followLink(page, 'saltroad.zz');
    await followLink(page, 'nightfreight.zz');
    await backButton(page).click();
    await expectShowing(page, 'saltroad.zz');

    await page.reload();
    await expectShowing(page, 'saltroad.zz');
    await expect(backButton(page)).toBeEnabled();
    await expect(forwardButton(page)).toBeEnabled();
    await forwardButton(page).click();
    await expectShowing(page, 'nightfreight.zz');
  });

  test('each person browses in a session of their own', async ({ page }) => {
    await openAs(page, 'ines-varga', 'tidepool.zz');
    await followLink(page, 'saltroad.zz');

    await page.getByLabel('Browsing as').selectOption('tomas-reyes');
    await expect(page).toHaveURL(/p=tomas-reyes/);
    await expect(backButton(page)).toBeDisabled(); // a fresh stack, not Ines's
    await expect(forwardButton(page)).toBeDisabled();
    await typeAddress(page, 'ironbread.zz');
    await expectShowing(page, 'ironbread.zz');
    await backButton(page).click();
    await expect(addressBar(page)).toHaveValue(''); // Tomas's own Home, never Ines's pages
    await expect(backButton(page)).toBeDisabled();
  });

  test('switching person starts them fresh and never reaches the previous trail', async ({ page }) => {
    await openAs(page, 'ines-varga', 'tidepool.zz');
    await followLink(page, 'saltroad.zz');
    await page.getByLabel('Browsing as').selectOption('tomas-reyes');
    await page.getByLabel('Browsing as').selectOption('ines-varga');
    await expect(page).toHaveURL(/p=ines-varga/);
    await expect(addressBar(page)).toHaveValue(''); // a fresh session at Home
    await expect(backButton(page)).toBeDisabled();
    await expect(forwardButton(page)).toBeDisabled();
  });

  test('a person switch does not grow the real browser history', async ({ page }) => {
    await openAs(page, 'ines-varga', 'tidepool.zz');
    await followLink(page, 'saltroad.zz');
    await followLink(page, 'nightfreight.zz');
    const length = await historyLength(page);

    for (const who of ['tomas-reyes', 'wen-zhao', 'ines-varga', 'kofi-mensah']) {
      await page.getByLabel('Browsing as').selectOption(who);
      await expect(page).toHaveURL(new RegExp(`p=${who}`));
    }
    expect(await historyLength(page)).toBe(length); // replaced in place, never pushed
  });

  test("the real Back button never crosses into another person's pages", async ({ page }) => {
    await openAs(page, 'ines-varga', 'tidepool.zz');
    await followLink(page, 'saltroad.zz');
    await page.getByLabel('Browsing as').selectOption('wen-zhao');
    await expect(page).toHaveURL(/p=wen-zhao/);
    await typeAddress(page, 'ironbread.zz');
    await expectShowing(page, 'ironbread.zz');
    const length = await historyLength(page);

    // press the real Back button well past Wen's first page
    for (let i = 0; i < 4; i++) {
      await page.goBack();
      await page.waitForTimeout(150);
    }

    await expect(page).toHaveURL(/p=wen-zhao/);
    await expect(page.getByLabel('Browsing as')).toHaveValue('wen-zhao'); // the selector never flips
    await expect(addressBar(page)).not.toHaveValue('saltroad.zz');
    await expect(addressBar(page)).not.toHaveValue('tidepool.zz');
    expect(await historyLength(page)).toBe(length);
    // and the toolbar agrees with where the real button left us
    await expect(backButton(page)).toBeDisabled();
    await forwardButton(page).click();
    await expectShowing(page, 'ironbread.zz');
  });
});
