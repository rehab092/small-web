import { expect, test } from '@playwright/test';
import {
  backButton,
  expectScrollNear,
  expectShowing,
  followLinkInPlace,
  forwardButton,
  frameScroll,
  openAs,
  scrollPageTo,
} from './helpers';

const PERSON = 'kofi-mensah';

// Links are followed in place (see followLinkInPlace): a real click would scroll the
// link into view first and so change the very position these tests are about.
test.describe('restore on return: the page that was left, at the place it was left', () => {
  test('toolbar Back and Forward restore each page and its scroll position', async ({ page }) => {
    await openAs(page, PERSON, 'tidepool.zz');
    await expectShowing(page, 'tidepool.zz');
    const tidepoolY = await scrollPageTo(page, PERSON, 'tidepool.zz', 400);
    expect(tidepoolY).toBeGreaterThan(50);

    await followLinkInPlace(page, 'saltroad.zz');
    expect(await frameScroll(page)).toBe(0); // a page reached by a link starts at the top
    const saltroadY = await scrollPageTo(page, PERSON, 'saltroad.zz', 120);
    expect(saltroadY).toBeGreaterThan(20);

    await followLinkInPlace(page, 'nightfreight.zz');
    expect(await frameScroll(page)).toBe(0);

    await backButton(page).click();
    await expectShowing(page, 'saltroad.zz');
    await expectScrollNear(page, saltroadY);

    await backButton(page).click();
    await expectShowing(page, 'tidepool.zz');
    await expectScrollNear(page, tidepoolY);

    await forwardButton(page).click();
    await expectShowing(page, 'saltroad.zz');
    await expectScrollNear(page, saltroadY);
  });

  test("the real browser's Back and Forward restore scroll too", async ({ page }) => {
    await openAs(page, PERSON, 'tidepool.zz');
    const tidepoolY = await scrollPageTo(page, PERSON, 'tidepool.zz', 400);
    await followLinkInPlace(page, 'saltroad.zz');
    const saltroadY = await scrollPageTo(page, PERSON, 'saltroad.zz', 120);
    await followLinkInPlace(page, 'nightfreight.zz');

    await page.goBack();
    await page.goBack();
    await expectShowing(page, 'tidepool.zz');
    await expectScrollNear(page, tidepoolY);

    await page.goForward();
    await expectShowing(page, 'saltroad.zz');
    await expectScrollNear(page, saltroadY);
  });

  test('a reload keeps the scroll position', async ({ page }) => {
    await openAs(page, PERSON, 'tidepool.zz');
    const y = await scrollPageTo(page, PERSON, 'tidepool.zz', 400);

    await page.reload();
    await expectShowing(page, 'tidepool.zz');
    await expectScrollNear(page, y);
  });

  test('scrolling after coming back replaces the remembered position', async ({ page }) => {
    await openAs(page, PERSON, 'tidepool.zz');
    const first = await scrollPageTo(page, PERSON, 'tidepool.zz', 400);
    await followLinkInPlace(page, 'saltroad.zz');
    await backButton(page).click();
    await expectShowing(page, 'tidepool.zz');
    await expectScrollNear(page, first); // let the restore finish before scrolling again

    const newer = await scrollPageTo(page, PERSON, 'tidepool.zz', 150);
    expect(newer).toBeLessThan(first);
    await followLinkInPlace(page, 'saltroad.zz');
    await backButton(page).click();
    await expectShowing(page, 'tidepool.zz');
    await expectScrollNear(page, newer);
  });
});
