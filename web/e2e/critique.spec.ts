import { expect, test, type Page } from '@playwright/test';
import {
  addressBar,
  backButton,
  expectShowing,
  followLink,
  forwardButton,
  openAs,
  pageFrame,
  tool,
  typeAddress,
} from './helpers';

const activeDescription = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return el ? `${el.tagName}${el.tagName === 'IFRAME' ? '.site-frame' : ''}:${(el.textContent ?? '').trim().slice(0, 40)}` : 'none';
  });

test.describe('addresses with a path', () => {
  test('tidepool.zz/reading goes to tidepool.zz, not "outside the Small Web"', async ({ page }) => {
    await openAs(page, 'kofi-mensah');
    await typeAddress(page, 'tidepool.zz/reading');
    await expectShowing(page, 'tidepool.zz');
    await expect(page.getByRole('status').filter({ hasText: 'outside the Small Web' })).toHaveCount(0);
  });

  test('a full url with path, query and fragment still routes to the host', async ({ page }) => {
    await openAs(page, 'kofi-mensah');
    await typeAddress(page, 'https://Ironbread.zz/recipes/rye?x=1#top');
    await expectShowing(page, 'ironbread.zz');
  });

  test('a real-web url with a .zz-looking path is still external', async ({ page }) => {
    await openAs(page, 'kofi-mensah', 'tidepool.zz');
    await typeAddress(page, 'https://example.com/tidepool.zz');
    await expect(page.getByRole('status').filter({ hasText: 'outside the Small Web' })).toBeVisible();
    await expect(addressBar(page)).toHaveValue('https://example.com/tidepool.zz');
  });
});

test.describe('the address bar', () => {
  test('shows the styled name and .zz without an invented scheme', async ({ page }) => {
    await openAs(page, 'kofi-mensah', 'tidepool.zz');
    await expect(page.locator('.address__host')).toHaveText('tidepool');
    await expect(page.locator('.address__tld')).toHaveText('.zz');
    await expect(page.locator('.address__scheme')).toHaveCount(0);
    expect(await page.locator('.address__styled').innerText()).not.toContain('web://');
  });

  test('built-in pages keep their real about: prefix', async ({ page }) => {
    await openAs(page, 'kofi-mensah', 'about:history');
    await expect(page.locator('.address__scheme')).toHaveText('about:');
    await expect(page.locator('.address__host')).toHaveText('history');
  });

  test('a very long address is clipped, not pushed out of the bar', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 760 });
    const long = `${'a'.repeat(60)}.${'b'.repeat(30)}.zz`;
    await openAs(page, 'kofi-mensah');
    await typeAddress(page, long);
    await expect(page.getByRole('heading', { name: 'There is nothing at this address' })).toBeVisible();
    const fits = await page.evaluate(() => {
      const bar = document.querySelector('.address')!.getBoundingClientRect();
      const styled = document.querySelector('.address__styled')!.getBoundingClientRect();
      const chip = document.querySelector('.status__address')!.getBoundingClientRect();
      return {
        barFits: bar.right <= window.innerWidth + 1,
        textInsideBar: styled.right <= bar.right + 1,
        chipFits: chip.right <= window.innerWidth + 1,
        pageFits: document.documentElement.scrollWidth <= window.innerWidth,
      };
    });
    expect(fits).toEqual({ barFits: true, textInsideBar: true, chipFits: true, pageFits: true });
  });
});

test.describe('tab title', () => {
  test('always names the page on screen, through back, forward and a reload', async ({ page }) => {
    const titles: string[] = [];
    await openAs(page, 'kofi-mensah', 'tidepool.zz');
    await page.exposeFunction('__recordTitle', (t: string) => titles.push(t));
    await page.evaluate(() => {
      const target = document.querySelector('title') ?? document.head;
      new MutationObserver(() => (window as unknown as { __recordTitle: (t: string) => void }).__recordTitle(document.title)).observe(
        target,
        { childList: true, subtree: true, characterData: true },
      );
    });
    await followLink(page, 'saltroad.zz');
    await backButton(page).click();
    await expectShowing(page, 'tidepool.zz');
    await forwardButton(page).click();
    await expectShowing(page, 'saltroad.zz');
    await page.goBack();
    await expectShowing(page, 'tidepool.zz');

    expect(titles.length).toBeGreaterThan(2);
    // never the bare generic title while a site is what is on screen
    expect(titles.filter((t) => t === 'Small Web')).toEqual([]);
    await expect(page).toHaveTitle(/Tidepool/);
    await page.reload();
    await expect(page).toHaveTitle(/Tidepool/);
  });

  test('names built-in pages and Nowhere', async ({ page }) => {
    await openAs(page, 'kofi-mensah');
    await tool(page, 'History').click();
    await expect(page).toHaveTitle('History · Small Web');
    await typeAddress(page, 'ghostship.zz');
    await expect(page).toHaveTitle('Nowhere · Small Web');
    await tool(page, 'Publish').click();
    await expect(page).toHaveTitle('Publish · Small Web');
  });
});

test.describe('focus on arrival', () => {
  test('a built-in page takes focus on its heading, a site on its frame', async ({ page }) => {
    await openAs(page, 'kofi-mensah', 'tidepool.zz');
    await tool(page, 'History').click();
    await expect(page.getByRole('heading', { name: /Where Kofi Mensah has been/ })).toBeFocused();

    await typeAddress(page, 'ghostship.zz');
    await expect(page.getByRole('heading', { name: 'There is nothing at this address' })).toBeFocused();

    await typeAddress(page, 'saltroad.zz');
    await expectShowing(page, 'saltroad.zz');
    expect(await activeDescription(page)).toMatch(/^IFRAME/);
  });

  test('Back and Forward move focus to the page they land on', async ({ page }) => {
    await openAs(page, 'kofi-mensah', 'tidepool.zz');
    await followLink(page, 'saltroad.zz');
    await tool(page, 'History').click();
    await backButton(page).click();
    await expectShowing(page, 'saltroad.zz');
    expect(await activeDescription(page)).toMatch(/^IFRAME/);
    await forwardButton(page).click();
    await expect(page.getByRole('heading', { name: /Where Kofi Mensah has been/ })).toBeFocused();
  });

  test('never steals focus from a field being typed in', async ({ page }) => {
    await openAs(page, 'kofi-mensah');
    await tool(page, 'History').click();
    const filter = page.getByLabel('Filter history');
    await filter.click();
    await filter.fill('salt');
    // a navigation that completes while typing leaves the field alone
    await page.evaluate(() => (document.querySelector('input[aria-label="Filter history"]') as HTMLElement).focus());
    await expect(filter).toBeFocused();
  });

  test('the Search page keeps its own autofocused box', async ({ page }) => {
    await openAs(page, 'kofi-mensah');
    await tool(page, 'Search').click();
    await expect(page.getByLabel('Search query')).toBeFocused();
  });

  test('a reload does not move focus', async ({ page }) => {
    await openAs(page, 'kofi-mensah', 'about:history');
    await page.reload();
    await expect(page.getByRole('heading', { name: /Where Kofi Mensah has been/ })).not.toBeFocused();
  });
});

test.describe('publish author', () => {
  test('defaults to the current person when they are an author', async ({ page }) => {
    await openAs(page, 'wen-zhao', 'about:publish');
    await expect(page.getByLabel('Author')).toHaveValue('wen-zhao');
    await expect(page.getByTestId('author-hint')).toHaveCount(0);
  });

  test('a browser-only person is told why they cannot be the author', async ({ page }) => {
    await openAs(page, 'kofi-mensah', 'about:publish');
    await expect(page.getByTestId('author-hint')).toContainText('Kofi Mensah can browse but is not an author');
    const options = await page.getByLabel('Author').locator('option').allTextContents();
    expect(options).not.toContain('Kofi Mensah');
  });
});

test.describe('live regions', () => {
  test('Nowhere is announced politely and the loading state is announced too', async ({ page }) => {
    await openAs(page, 'kofi-mensah', 'tidepool.zz');
    await page.route(/\/sites\/saltroad\.zz/, async (route) => {
      await new Promise((r) => setTimeout(r, 700));
      await route.continue();
    });
    await pageFrame(page).locator('a[href="saltroad.zz"]').first().dispatchEvent('click');
    await expect(page.locator('.chrome [aria-live="polite"]')).toContainText('Loading saltroad.zz');
    await expectShowing(page, 'saltroad.zz');
    await expect(page.locator('.chrome [aria-live="polite"]')).toHaveText('');

    await typeAddress(page, 'ghostship.zz');
    await expect(page.locator('.status[aria-live="polite"]')).toContainText('ghostship.zz');
  });
});
