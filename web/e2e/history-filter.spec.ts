import { expect, test, type APIRequestContext, type Page, type Request } from '@playwright/test';
import { API_URL } from '../playwright.config';
import { backButton, openAs } from './helpers';

const PERSON = 'tomas-reyes'; // nearly every site, and more than one page of history
const rows = (page: Page) => page.locator('.visit');
const filterBox = (page: Page) => page.getByLabel('Filter history');
const note = (page: Page) => page.locator('.history__filter-note');
const filteredVisitsUrl = (url: URL) => /\/people\/[^/]+\/visits$/.test(url.pathname) && url.searchParams.has('q');
const isFilteredVisits = (r: Request) => filteredVisitsUrl(new URL(r.url()));

interface Visit {
  address: string;
}

/** Every visit of `person`, newest first, straight from the API. */
async function allVisits(request: APIRequestContext, person: string): Promise<Visit[]> {
  const out: Visit[] = [];
  let cursor: string | null = null;
  do {
    const url = `${API_URL}/people/${person}/visits?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const res = await request.get(url);
    const body = (await res.json()) as { items: Visit[]; nextCursor: string | null };
    out.push(...body.items);
    cursor = body.nextCursor;
  } while (cursor);
  return out;
}

test.describe('the history filter searches the whole history', () => {
  test('finds a visit that is on a page that was never loaded', async ({ page, request }) => {
    const all = await allVisits(request, PERSON);
    expect(all.length).toBeGreaterThan(50); // otherwise there is no second page to be missing
    const firstPage = new Set(all.slice(0, 50).map((v) => v.address));
    const deepOnly = [...new Set(all.slice(50).map((v) => v.address))].find((a) => !firstPage.has(a));
    test.skip(!deepOnly, 'every visited address also appears on the first page');
    const term = deepOnly!.replace(/\.zz$/, '');

    await openAs(page, PERSON, 'about:history');
    await expect(rows(page)).toHaveCount(50); // one page loaded, no scrolling done
    expect(await rows(page).filter({ hasText: term }).count()).toBe(0); // so it is not on screen

    await filterBox(page).fill(term);
    await expect(note(page)).toContainText('across the whole history');
    await expect(rows(page).first()).toContainText(term);
    for (const text of await rows(page).allTextContents()) expect(text.toLowerCase()).toContain(term);
  });

  test('shows loaded matches at once, before the server answers', async ({ page }) => {
    await openAs(page, PERSON, 'about:history');
    await expect(rows(page)).toHaveCount(50);
    await page.route(filteredVisitsUrl, async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });

    await filterBox(page).fill('iron');
    // within the debounce window: the instant overlay over the rows already down
    await expect(note(page)).toHaveText('Searching the whole history…', { timeout: 3000 });
    const overlay = await rows(page).count();
    expect(overlay).toBeGreaterThan(0);
    expect(overlay).toBeLessThan(50);
    for (const text of await rows(page).allTextContents()) expect(text.toLowerCase()).toContain('iron');

    await expect(note(page)).toContainText('across the whole history', { timeout: 6000 });
    expect(await rows(page).count()).toBeGreaterThanOrEqual(overlay); // the server found at least those
  });

  test('pages through every match, and the count matches the API', async ({ page, request }) => {
    const all = await allVisits(request, PERSON);
    await openAs(page, PERSON, 'about:history');
    await filterBox(page).fill('zz'); // every address ends in .zz, so everything matches
    await expect(note(page)).toContainText('across the whole history');
    await expect(rows(page)).toHaveCount(50);
    await expect(note(page)).toContainText('50+');

    await page.locator('.page-scroll').evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect(page.getByText('That is every match.')).toBeVisible();
    await expect(rows(page)).toHaveCount(all.length);
  });

  test('a burst of typing sends one request, for the final text', async ({ page }) => {
    await openAs(page, PERSON, 'about:history');
    await expect(rows(page)).toHaveCount(50);
    const queries: string[] = [];
    page.on('request', (r) => {
      if (isFilteredVisits(r)) queries.push(new URL(r.url()).searchParams.get('q') ?? '');
    });
    await filterBox(page).click();
    await page.keyboard.type('saltroad', { delay: 40 });
    await expect(note(page)).toContainText('across the whole history');
    await page.waitForTimeout(500);
    expect(queries.length).toBeLessThanOrEqual(2);
    expect(queries.at(-1)).toBe('saltroad');
  });

  test('matches pages that were not found, by the word "nowhere"', async ({ page }) => {
    await openAs(page, 'wen-zhao');
    await page.locator('.address__input').fill('ghostship.zz');
    await page.locator('.address__input').press('Enter');
    await expect(page.getByRole('heading', { name: 'There is nothing at this address' })).toBeVisible();
    await page.getByRole('button', { name: 'History', exact: true }).click();
    await filterBox(page).fill('nowhere');
    await expect(note(page)).toContainText('across the whole history');
    await expect(rows(page).first()).toContainText('ghostship.zz');
    for (const text of await rows(page).allTextContents()) expect(text).toContain('not found');
  });

  test('clearing the filter brings the whole list back', async ({ page }) => {
    await openAs(page, PERSON, 'about:history');
    await expect(rows(page)).toHaveCount(50);
    await filterBox(page).fill('qqzzxxnothing');
    await expect(page.getByRole('heading', { name: 'No visits match' })).toBeVisible();
    await page.getByRole('button', { name: 'Clear the filter' }).click();
    await expect(rows(page)).toHaveCount(50);
    await expect(note(page)).toHaveText('');
  });

  test('if the server cannot be reached the loaded rows still filter, and it says so', async ({ page }) => {
    await openAs(page, PERSON, 'about:history');
    await expect(rows(page)).toHaveCount(50);
    await page.route(filteredVisitsUrl, (route) => route.abort());
    await filterBox(page).fill('iron');
    await expect(note(page)).toContainText('could not be searched');
    expect(await rows(page).count()).toBeGreaterThan(0);
    for (const text of await rows(page).allTextContents()) expect(text.toLowerCase()).toContain('iron');
  });

  test('the filtered list is still there after jumping to a page and coming Back', async ({ page }) => {
    await openAs(page, PERSON, 'about:history');
    await filterBox(page).fill('salt');
    await expect(note(page)).toContainText('across the whole history');
    const before = await rows(page).count();

    await rows(page).first().click();
    await expect(page.locator('iframe.site-frame')).toBeVisible();
    let askedAgain = 0;
    page.on('request', (r) => {
      if (isFilteredVisits(r)) askedAgain += 1;
    });
    await backButton(page).click();
    await expect(filterBox(page)).toHaveValue('salt');
    await expect(rows(page)).toHaveCount(before);
    await page.waitForTimeout(600);
    expect(askedAgain).toBe(0); // restored from what was already found, not asked for again
  });
});
