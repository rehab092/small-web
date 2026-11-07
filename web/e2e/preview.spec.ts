import { expect, test, type Page, type Request } from '@playwright/test';
import { expectShowing, openAs, publishSubmit, siteFrame, uniqueAddress } from './helpers';

const PERSON = 'ines-varga';
const addressField = (page: Page) => page.getByPlaceholder('tidepool.zz', { exact: true });
const titleField = (page: Page) => page.getByPlaceholder('What the page is called');
const htmlField = (page: Page) => page.locator('textarea');
const isPreview = (r: Request) => r.method() === 'POST' && /\/sites\/preview$/.test(r.url());

async function openPublish(page: Page): Promise<void> {
  await openAs(page, PERSON, 'about:publish');
  await expect(htmlField(page)).toBeVisible();
}

test.describe('the publish preview is what gets published', () => {
  test('the preview body is identical to the published page, including a defanged overlay', async ({ page }) => {
    const address = uniqueAddress('faithful');
    await openPublish(page);
    await addressField(page).fill(address);
    await titleField(page).fill('Faithful');
    await htmlField(page).fill(
      '<h1>Faithful</h1>' +
        '<p id="cover" style="position:fixed;top:0;left:0;width:100%;background:red">COVER</p>' +
        '<p onclick="alert(1)">clickable?</p><script>alert(2)</script>' +
        '<style>.x{color:#123456}</style><p class="x">tinted</p>',
    );
    await expect(page.locator('iframe.site-frame')).toBeVisible();
    const previewFrame = await siteFrame(page);
    await expect(previewFrame.locator('h1')).toHaveText('Faithful');
    const previewBody = await previewFrame.evaluate(() => document.body.innerHTML);
    const previewPosition = await previewFrame.locator('#cover').evaluate((el) => getComputedStyle(el).position);

    await publishSubmit(page).click();
    await page.getByRole('button', { name: `Visit ${address}` }).click();
    await expectShowing(page, address);
    const publishedFrame = await siteFrame(page);
    const publishedBody = await publishedFrame.evaluate(() => document.body.innerHTML);
    const publishedPosition = await publishedFrame.locator('#cover').evaluate((el) => getComputedStyle(el).position);

    expect(previewBody).toBe(publishedBody); // preview === published, byte for byte
    expect(previewBody).not.toMatch(/<script|onclick/i);
    expect(previewPosition).not.toBe('fixed'); // the server rewrote it, and the preview shows that
    expect(publishedPosition).toBe(previewPosition);
  });

  test('what the server stores after publishing is also what the form shows afterwards', async ({ page }) => {
    const address = uniqueAddress('afterwards');
    await openPublish(page);
    await addressField(page).fill(address);
    await titleField(page).fill('Afterwards');
    await htmlField(page).fill('<h1>Same</h1><p onmouseover="x()">body</p>');
    await expect((await siteFrame(page)).locator('h1')).toHaveText('Same');
    const before = await (await siteFrame(page)).evaluate(() => document.body.innerHTML);
    await publishSubmit(page).click();
    await expect(page.locator('.published')).toBeVisible();
    const after = await (
      await (await page.locator('.published iframe.site-frame').elementHandle())!.contentFrame()
    )!.evaluate(() => document.body.innerHTML);
    expect(after).toBe(before);
  });
});

test.describe('the preview request', () => {
  test('typing is debounced: one request for a burst of keystrokes, with the final text', async ({ page }) => {
    await openPublish(page);
    const bodies: string[] = [];
    page.on('request', (r) => {
      if (isPreview(r)) bodies.push(r.postData() ?? '');
    });
    await htmlField(page).click();
    await page.keyboard.type('<h1>burst typing</h1>', { delay: 30 });
    await expect((await siteFrame(page)).locator('h1')).toHaveText('burst typing');
    await page.waitForTimeout(600);

    expect(bodies.length).toBeGreaterThanOrEqual(1);
    expect(bodies.length).toBeLessThanOrEqual(2);
    expect(JSON.parse(bodies.at(-1)!)).toEqual({ html: '<h1>burst typing</h1>' });
  });

  test('empty input asks the server nothing and shows the prompt', async ({ page }) => {
    await openPublish(page);
    let calls = 0;
    page.on('request', (r) => {
      if (isPreview(r)) calls += 1;
    });
    await expect(page.getByText('Start typing HTML to see it here.')).toBeVisible();
    await htmlField(page).fill('   ');
    await page.waitForTimeout(700);
    expect(calls).toBe(0);
  });

  test('a slow, outdated answer never replaces a newer preview', async ({ page }) => {
    await openPublish(page);
    let first = true;
    await page.route(/\/sites\/preview$/, async (route) => {
      if (first) {
        first = false;
        await new Promise((r) => setTimeout(r, 1800)); // the first answer arrives long after the second
      }
      await route.continue();
    });
    await htmlField(page).fill('<h1>old</h1>');
    await page.waitForTimeout(600); // the slow request is now in flight
    await htmlField(page).fill('<h1>new</h1>');
    await expect((await siteFrame(page)).locator('h1')).toHaveText('new');
    await page.waitForTimeout(2200); // long enough for the old answer to have landed
    await expect((await siteFrame(page)).locator('h1')).toHaveText('new');
  });

  test('an unreachable preview says so and recovers on the next edit', async ({ page }) => {
    await openPublish(page);
    await page.route(/\/sites\/preview$/, (route) => route.abort());
    await htmlField(page).fill('<h1>offline</h1>');
    await expect(page.getByText('The preview could not be loaded')).toBeVisible();

    await page.unroute(/\/sites\/preview$/);
    await htmlField(page).fill('<h1>back online</h1>');
    await expect((await siteFrame(page)).locator('h1')).toHaveText('back online');
    await expect(page.getByText('The preview could not be loaded')).toHaveCount(0);
  });

  test('a half-written page comes back with its preview after Back', async ({ page }) => {
    await openPublish(page);
    await titleField(page).fill('Kept');
    await htmlField(page).fill('<h1>still here</h1>');
    await expect((await siteFrame(page)).locator('h1')).toHaveText('still here');
    await page.getByRole('button', { name: 'Home' }).click();
    await page.getByRole('button', { name: 'Back' }).first().click();
    await expect(htmlField(page)).toHaveValue('<h1>still here</h1>');
    await expect((await siteFrame(page)).locator('h1')).toHaveText('still here');
  });
});
