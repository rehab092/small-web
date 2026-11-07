import { expect, test, type Page } from '@playwright/test';
import { API_URL } from '../playwright.config';
import {
  addressBar,
  backButton,
  expectShowing,
  followLink,
  forwardButton,
  openAs,
  pageFrame,
  publishSubmit,
  tool,
  typeAddress,
  uniqueAddress,
} from './helpers';

const nowhere = (page: Page) => page.getByRole('heading', { name: 'There is nothing at this address' });
const rows = (page: Page) => page.locator('.visit');

test.describe('keyboard', () => {
  test('Alt+Left and Alt+Right go back and forward', async ({ page }) => {
    await openAs(page, 'kofi-mensah', 'tidepool.zz');
    await followLink(page, 'saltroad.zz');
    await page.locator('body').click({ position: { x: 5, y: 5 } }); // focus outside the page frame
    await page.keyboard.press('Alt+ArrowLeft');
    await expectShowing(page, 'tidepool.zz');
    await page.keyboard.press('Alt+ArrowRight');
    await expectShowing(page, 'saltroad.zz');
    await expect(forwardButton(page)).toBeDisabled();
  });

  test('Ctrl+L focuses and selects the address bar, then Enter goes there', async ({ page }) => {
    await openAs(page, 'kofi-mensah', 'tidepool.zz');
    await page.keyboard.press('Control+L');
    await expect(addressBar(page)).toBeFocused();
    expect(await addressBar(page).evaluate((el: HTMLInputElement) => el.selectionEnd! - el.selectionStart!)).toBe(
      'tidepool.zz'.length,
    );
    await page.keyboard.type('ironbread');
    await page.keyboard.press('Enter');
    await expectShowing(page, 'ironbread.zz');
  });

  test('Escape in the address bar puts the real address back', async ({ page }) => {
    await openAs(page, 'kofi-mensah', 'tidepool.zz');
    await page.keyboard.press('Control+L');
    await page.keyboard.type('half typed');
    await page.keyboard.press('Escape');
    await expect(addressBar(page)).toHaveValue('tidepool.zz');
    await expect(addressBar(page)).not.toBeFocused();
  });

  test('the shortcuts also work while focus is inside the page', async ({ page }) => {
    await openAs(page, 'kofi-mensah', 'tidepool.zz');
    await followLink(page, 'saltroad.zz');
    await pageFrame(page).locator('h1').first().click(); // focus moves into the sandboxed frame

    await page.keyboard.press('Alt+ArrowLeft');
    await expectShowing(page, 'tidepool.zz');

    await pageFrame(page).locator('h1').first().click();
    await page.keyboard.press('Control+L');
    await expect(addressBar(page)).toBeFocused();
  });

  test('Alt+Left does not fire while typing in another field', async ({ page }) => {
    await openAs(page, 'kofi-mensah');
    await tool(page, 'Search').click();
    await tool(page, 'History').click();
    const filter = page.getByLabel('Filter history');
    await filter.click();
    await page.keyboard.press('Alt+ArrowLeft');
    await expect(page.getByRole('heading', { name: /Where Kofi Mensah has been/ })).toBeVisible();
    await expect(filter).toBeFocused();
  });

  test('/ starts a search from the Search page, but is just a character inside a field', async ({ page }) => {
    await openAs(page, 'kofi-mensah');
    await tool(page, 'Search').click();
    const input = page.getByLabel('Search query');
    await page.locator('h2', { hasText: 'Search the whole web' }).click();
    await page.keyboard.press('/');
    await expect(input).toBeFocused();
    await expect(input).toHaveValue(''); // the slash itself was not typed

    await page.keyboard.type('salt/pepper');
    await expect(input).toHaveValue('salt/pepper'); // inside the field it is an ordinary character
  });

  test('/ does nothing on other pages', async ({ page }) => {
    await openAs(page, 'kofi-mensah', 'tidepool.zz');
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('/');
    await expect(addressBar(page)).not.toBeFocused();
  });

  test('every control is reachable by Tab, in order, with a visible focus ring', async ({ page }) => {
    await openAs(page, 'kofi-mensah', 'tidepool.zz');
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

    const readStop = () =>
      page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        const style = getComputedStyle(el);
        const wrapper = el.closest('.address, .person'); // the ring can sit on the control's wrapper
        const wrapperStyle = wrapper ? getComputedStyle(wrapper) : null;
        const ring =
          style.outlineStyle !== 'none' ||
          (wrapperStyle !== null &&
            (wrapperStyle.boxShadow !== 'none' || wrapperStyle.outlineStyle !== 'none'));
        const name = el.getAttribute('aria-label') ?? el.getAttribute('title') ?? (el.textContent?.trim() || el.tagName);
        return { name, ring };
      });

    const stops: Array<{ name: string; ring: boolean }> = [];
    for (let i = 0; i < 9; i++) {
      await page.keyboard.press('Tab');
      let stop = await readStop();
      if (!stop.ring) {
        // The page frame's ring is a class the app sets from its focus handler, a moment after focus
        // arrives. Sampling the instant Tab returns raced that on a slower runner (passed locally, failed
        // on CI). Give it up to 2 s; a control that never gets a ring still fails below, by name.
        await expect.poll(async () => (await readStop()).ring, { timeout: 2000 }).toBe(true).catch(() => undefined);
        stop = await readStop();
      }
      stops.push(stop);
    }
    const names = stops.map((s) => s.name);
    // the chrome in reading order; Forward is skipped because it is disabled
    const wanted = ['Reload', 'Home', 'Address bar', 'Search', 'History', 'Publish', 'Browsing as'];
    let at = 0;
    for (const name of names) if (name === wanted[at]) at += 1;
    expect(at, `tab order was ${names.join(' > ')}`).toBeGreaterThanOrEqual(wanted.length);
    for (const stop of stops) expect(stop.ring, `no focus ring on ${stop.name}`).toBe(true);
  });

  test('the shortcuts are announced on the controls', async ({ page }) => {
    await openAs(page, 'kofi-mensah', 'tidepool.zz');
    await expect(backButton(page)).toHaveAttribute('aria-keyshortcuts', 'Alt+ArrowLeft');
    await expect(addressBar(page)).toHaveAttribute('aria-keyshortcuts', /Control\+L/);
    await expect(backButton(page)).toHaveAttribute('title', /Alt\+Left/);
  });
});

test.describe('the Nowhere page', () => {
  test('shows the address and explains it, announced politely', async ({ page }) => {
    await openAs(page, 'wen-zhao');
    await typeAddress(page, 'ghostship.zz');
    await expect(nowhere(page)).toBeVisible();
    await expect(page.locator('.status__address')).toHaveText('ghostship.zz');
    await expect(page.locator('.status[aria-live="polite"]')).toBeVisible();
  });

  test('"Search for it" runs a search for the name', async ({ page }) => {
    await openAs(page, 'wen-zhao');
    await typeAddress(page, 'ghostship.zz');
    await page.getByRole('button', { name: 'Search for “ghostship”' }).click();
    await expect(page.getByLabel('Search query')).toHaveValue('ghostship'); // the name, not the .zz every address shares
    await expect(page.getByText('No pages match “ghostship”.')).toBeVisible();
    await backButton(page).click();
    await expect(nowhere(page)).toBeVisible(); // Back returns to the Nowhere stop
  });

  test('"Publish a site here" prefills the address, "Go home" goes home', async ({ page }) => {
    await openAs(page, 'wen-zhao');
    await typeAddress(page, 'ghostship.zz');
    await page.getByRole('button', { name: 'Publish a site here' }).click();
    await expect(page.getByPlaceholder('tidepool.zz', { exact: true })).toHaveValue('ghostship.zz');

    await backButton(page).click();
    await expect(nowhere(page)).toBeVisible();
    await page.getByRole('button', { name: 'Go home' }).click();
    await expect(page.getByRole('heading', { name: /A small web of one-page sites/ })).toBeVisible();
  });
});

test.describe('history list', () => {
  const PERSON = 'tomas-reyes';

  test('filters the loaded visits and says how many match', async ({ page }) => {
    await openAs(page, PERSON, 'about:history');
    await expect(rows(page).first()).toBeVisible();
    const all = await rows(page).count();

    await page.getByLabel('Filter history').fill('iron');
    await expect(page.locator('.history__filter-note')).toContainText('across the whole history');
    const matching = await rows(page).count();
    expect(matching).toBeGreaterThan(0);
    expect(matching).toBeLessThan(all + 1);
    for (const text of await rows(page).allTextContents()) expect(text.toLowerCase()).toContain('iron');
    await expect(page.locator('.visit mark').first()).toBeVisible(); // the match is highlighted
  });

  test('matches how a page was reached and pages that were not found', async ({ page }) => {
    await openAs(page, 'wen-zhao');
    await typeAddress(page, 'ghostship.zz');
    await expect(nowhere(page)).toBeVisible();
    await tool(page, 'History').click();

    await page.getByLabel('Filter history').fill('nowhere');
    await expect(rows(page).first()).toContainText('ghostship.zz');
    for (const text of await rows(page).allTextContents()) expect(text).toContain('not found');
  });

  test('says so when nothing matches, and Clear brings everything back', async ({ page }) => {
    await openAs(page, PERSON, 'about:history');
    await expect(rows(page).first()).toBeVisible();
    await page.getByLabel('Filter history').fill('qqzzxxnothing');
    // loading continues to the end of the history before it can say "no match"
    await expect(page.getByRole('heading', { name: 'No visits match' })).toBeVisible();
    await page.getByRole('button', { name: 'Clear the filter' }).click();
    await expect(rows(page).first()).toBeVisible();
    await expect(page.getByLabel('Filter history')).toHaveValue('');
  });

  test('Escape clears the filter', async ({ page }) => {
    await openAs(page, PERSON, 'about:history');
    await expect(rows(page).first()).toBeVisible();
    const filter = page.getByLabel('Filter history');
    await filter.fill('salt');
    await filter.press('Escape');
    await expect(filter).toHaveValue('');
  });

  test('the filter is still there after jumping to a page and coming Back', async ({ page }) => {
    await openAs(page, PERSON, 'about:history');
    await expect(rows(page).first()).toBeVisible();
    await page.getByLabel('Filter history').fill('salt');
    await expect(rows(page).first()).toContainText('salt');
    await rows(page).first().click();
    await expect(page.locator('iframe.site-frame')).toBeVisible();
    await backButton(page).click();
    await expect(page.getByLabel('Filter history')).toHaveValue('salt');
    for (const text of await rows(page).allTextContents()) expect(text.toLowerCase()).toContain('salt');
  });

  test('day headers stick, each row has a typed badge and a relative or clock time', async ({ page }) => {
    await openAs(page, PERSON, 'about:history');
    await expect(rows(page).first()).toBeVisible();
    expect(await page.locator('.day__title').first().evaluate((el) => getComputedStyle(el).position)).toBe('sticky');
    await expect(rows(page).first().locator('.badge').last()).toHaveText(/typed|link|back|forward|history|search/);
    await expect(rows(page).first().locator('.visit__time')).toContainText(/\d\d:\d\d/);
  });

  test('a fresh visit reads "just now"', async ({ page }) => {
    await openAs(page, 'odile-mercier');
    await typeAddress(page, 'cartographers.zz');
    await expectShowing(page, 'cartographers.zz');
    await expect.poll(async () => {
      const res = await page.request.get(`${API_URL}/people/odile-mercier/visits?limit=1`);
      return ((await res.json()) as { items: Array<{ address: string }> }).items[0]?.address;
    }).toBe('cartographers.zz');
    await tool(page, 'History').click();
    await expect(rows(page).first().locator('.visit__rel')).toHaveText('just now');
  });
});

test.describe('search states', () => {
  test('highlights the matched words in titles and addresses as well as snippets', async ({ page }) => {
    await openAs(page, 'kofi-mensah');
    await tool(page, 'Search').click();
    const input = page.getByLabel('Search query');
    await input.fill('tide');
    await input.press('Enter');
    await expect(page.locator('.result').first()).toBeVisible();
    await expect(page.locator('.result__title mark').first()).toHaveText(/tide/i);
    await expect(page.locator('.result__address mark').first()).toHaveText(/tide/i);
    await expect(page.locator('.result__snippet mark').first()).toBeVisible();
  });

  test('an empty result has a suggestion, shortcuts to try, and a way out', async ({ page }) => {
    await openAs(page, 'kofi-mensah');
    await tool(page, 'Search').click();
    const input = page.getByLabel('Search query');
    await input.fill('zzqxjwv');
    await input.press('Enter');
    await expect(page.getByRole('heading', { name: 'Nothing found' })).toBeVisible();
    await page.getByRole('button', { name: 'tide', exact: true }).click(); // a suggested word
    await expect(page.locator('.result').first()).toBeVisible();
    await backButton(page).click();
    await page.getByRole('button', { name: 'Browse the directory' }).click();
    await expect(page.getByRole('heading', { name: /A small web of one-page sites/ })).toBeVisible();
  });

  test('several words that find nothing suggest each word on its own', async ({ page }) => {
    await openAs(page, 'kofi-mensah');
    await tool(page, 'Search').click();
    const input = page.getByLabel('Search query');
    await input.fill('zzqx jwvvx');
    await input.press('Enter');
    await expect(page.getByText('Try fewer words')).toBeVisible();
    await expect(page.getByRole('button', { name: 'zzqx', exact: true })).toBeVisible();
  });
});

test.describe('publish messages', () => {
  test('a page that is empty once sanitized is explained, by the server, before publishing', async ({ page }) => {
    await openAs(page, 'ines-varga', 'about:publish');
    await page.getByPlaceholder('tidepool.zz', { exact: true }).fill(uniqueAddress('empty'));
    await page.getByPlaceholder('What the page is called').fill('Nothing to see');
    await page.locator('textarea').fill('<script>alert(1)</script><form><input name=a></form>');
    // the verdict comes from the server's preview: the one definition of "nothing left"
    await expect(page.getByText(/Nothing readable is left once scripts, forms, images/).first()).toBeVisible();
    await expect(publishSubmit(page)).toBeDisabled();

    // adding something readable lifts it
    await page.locator('textarea').fill('<script>alert(1)</script><p>Now there is text.</p>');
    await expect(page.getByText(/Nothing readable is left/)).toHaveCount(0);
    await expect(publishSubmit(page)).toBeEnabled();
  });
});

test.describe('small screens', () => {
  test.use({ viewport: { width: 375, height: 760 } });

  const noSideways = async (page: Page, label: string) => {
    // The body never scrolls (overflow: hidden); a page scrolls inside .page-scroll. So a
    // sideways scroll is any scroll container whose content is wider than its box.
    const overflow = await page.evaluate(() => {
      const containers = [document.documentElement, ...document.querySelectorAll<HTMLElement>('.page-scroll, .viewport')];
      return Math.max(...containers.map((el) => el.scrollWidth - el.clientWidth));
    });
    expect(overflow, `${label} scrolls sideways`).toBeLessThanOrEqual(0);
    const wide = await page.evaluate(() => {
      const out: string[] = [];
      document.querySelectorAll<HTMLElement>('.chrome *, .page *').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.right <= window.innerWidth + 1) return;
        // text clipped by an ancestor that itself fits (ellipsis rows) is not visible overflow;
        // the page's own scroll container is not such an ancestor: it is what would scroll
        for (let up = el.parentElement; up; up = up.parentElement) {
          if (up.classList.contains('page-scroll') || up.classList.contains('viewport')) break;
          const clips = getComputedStyle(up).overflowX !== 'visible';
          if (clips && up.getBoundingClientRect().right <= window.innerWidth + 1) return;
        }
        out.push(`${el.className || el.tagName}:${Math.round(r.right)}`);
      });
      return out.slice(0, 5);
    });
    expect(wide, `${label} has elements past the right edge`).toEqual([]);
  };

  test('every page fits 375px wide with the whole chrome usable', async ({ page }) => {
    await openAs(page, 'tomas-reyes');
    await expect(page.locator('.card').first()).toBeVisible();
    await noSideways(page, 'home');

    await tool(page, 'Search').click();
    await page.getByLabel('Search query').fill('tide');
    await page.getByLabel('Search query').press('Enter');
    await expect(page.locator('.result').first()).toBeVisible();
    await noSideways(page, 'search');

    await tool(page, 'History').click();
    await expect(rows(page).first()).toBeVisible();
    await noSideways(page, 'history');

    await tool(page, 'Publish').click();
    await expect(page.getByRole('heading', { name: 'Put a page on the Small Web' })).toBeVisible();
    await page.locator('textarea').fill('<h1>x</h1>');
    await noSideways(page, 'publish');

    await typeAddress(page, 'ghostship.zz');
    await expect(nowhere(page)).toBeVisible();
    await noSideways(page, 'nowhere');
  });

  test('the person picker still works when it shows only an avatar', async ({ page }) => {
    await openAs(page, 'ines-varga', 'tidepool.zz');
    await expect(page.locator('.person__avatar')).toBeVisible();
    await page.getByLabel('Browsing as').selectOption('wen-zhao');
    await expect(page).toHaveURL(/p=wen-zhao/);
    await expect(page.locator('.person__avatar')).toHaveText('W');
  });

  /**
   * An address as long as the rules allow (100 characters, 63 per label) and one of the
   * 57-character length QA found. Made unique so reruns never collide.
   */
  const longAddress = (length: number) => {
    const unique = `u${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
    const tail = '.zz';
    const first = 'a'.repeat(Math.min(60, length - tail.length - 1 - unique.length - 1));
    const rest = length - tail.length - first.length - 1;
    return `${first}.${unique.padEnd(rest, 'b')}${tail}`;
  };

  for (const length of [57, 100]) {
    test(`a ${length}-character address and a very long title never push the screen sideways`, async ({ page, request }) => {
      const address = longAddress(length);
      expect(address).toHaveLength(length);
      const res = await request.post(`${API_URL}/sites`, {
        data: {
          address,
          title: 'W'.repeat(110),
          html: '<h1>long</h1><p>some words</p>',
          authorId: 'ines-varga',
        },
      });
      expect(res.status()).toBe(201);

      // the directory (where QA found it: a bare 1fr grid track stretched around the address)
      await openAs(page, 'ines-varga');
      await expect(page.locator('.card').filter({ hasText: address.slice(0, 20) }).first()).toBeVisible();
      await noSideways(page, `home with a ${length}-character address`);

      // typing the long address (the bar clips it), then the page it leads to
      await typeAddress(page, address);
      await expectShowing(page, address);
      await noSideways(page, `the page at a ${length}-character address`);

      // history lists it, search finds it: both must clip too
      await tool(page, 'History').click();
      await expect(rows(page).first()).toContainText(address.slice(0, 20));
      await noSideways(page, `history with a ${length}-character address`);
      await tool(page, 'Search').click();
      const input = page.getByLabel('Search query');
      await input.fill(address.slice(0, 24));
      await input.press('Enter');
      await page.waitForTimeout(500);
      await noSideways(page, `search for a ${length}-character address`);
    });
  }
});

test.describe('loading feels calm', () => {
  /** Count how many times a loading spinner appears in the document. */
  async function watchSpinner(page: Page): Promise<void> {
    await page.evaluate(() => {
      const w = window as unknown as { __spinners: number };
      w.__spinners = 0;
      new MutationObserver((records) => {
        for (const r of records) {
          r.addedNodes.forEach((n) => {
            if (n instanceof HTMLElement && (n.matches('[aria-label="Loading"]') || n.querySelector('[aria-label="Loading"]'))) {
              w.__spinners += 1;
            }
          });
        }
      }).observe(document.body, { childList: true, subtree: true });
    });
  }
  const spinners = (page: Page) => page.evaluate(() => (window as unknown as { __spinners: number }).__spinners);

  test('a fast load never flashes a spinner', async ({ page }) => {
    await openAs(page, 'kofi-mensah', 'tidepool.zz');
    await watchSpinner(page);
    await followLink(page, 'saltroad.zz');
    await followLink(page, 'nightfreight.zz');
    await page.waitForTimeout(600);
    expect(await spinners(page)).toBe(0);
  });

  test('a slow load shows the spinner and the progress bar, then clears them', async ({ page }) => {
    await openAs(page, 'kofi-mensah', 'tidepool.zz');
    await page.route(/\/sites\/saltroad\.zz/, async (route) => {
      await new Promise((r) => setTimeout(r, 900));
      await route.continue();
    });
    await pageFrame(page).locator('a[href="saltroad.zz"]').first().dispatchEvent('click');
    await expect(page.getByRole('status', { name: 'Loading' })).toBeVisible();
    await expect(page.locator('.progress--on')).toBeVisible();
    await expect(page.locator('.chrome [aria-live="polite"]')).toContainText('Loading saltroad.zz');
    await expectShowing(page, 'saltroad.zz');
    await expect(page.locator('.progress--on')).toHaveCount(0);
  });

  test('pages do not jump around while they load', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __cls: number };
      w.__cls = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as unknown as Array<{ value: number; hadRecentInput: boolean }>) {
          if (!entry.hadRecentInput) w.__cls += entry.value;
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    for (const addr of ['', 'about:history', 'about:publish']) {
      await openAs(page, 'tomas-reyes', addr || undefined);
      await page.waitForTimeout(900);
      const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
      expect(cls, `layout shift on ${addr || 'home'}`).toBeLessThan(0.1);
    }
  });
});

test.describe('when the API is down', () => {
  test('the browser says so and Try again recovers', async ({ page }) => {
    await page.route(/\/people(\?|$)/, (route) => route.abort());
    await page.goto('/?p=kofi-mensah');
    await expect(page.getByRole('heading', { name: 'The Small Web is out of reach' })).toBeVisible();
    await page.unroute(/\/people(\?|$)/);
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(addressBar(page)).toBeVisible();
  });

  test('a page that fails to load shows the error with Try again, and it is a real stop on the trail', async ({ page }) => {
    await openAs(page, 'kofi-mensah', 'tidepool.zz');
    await page.route(/\/sites\/saltroad\.zz/, (route) => route.abort());
    await pageFrame(page).locator('a[href="saltroad.zz"]').first().dispatchEvent('click');
    await expect(page.getByRole('heading', { name: 'saltroad.zz did not load' })).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'did not load' })).toBeVisible();

    await page.unroute(/\/sites\/saltroad\.zz/);
    await page.getByRole('button', { name: 'Try again' }).click();
    await expectShowing(page, 'saltroad.zz');
    await backButton(page).click();
    await expectShowing(page, 'tidepool.zz');
  });
});
