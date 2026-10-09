// apps/web/e2e/responsive.spec.ts
import { expect, test } from '@playwright/test';
import { devWorkspace, expectNoSideways, seedWorkRecordLocal, shortControls, uploadViaApi } from './helpers';

/** The operator reads on a phone first; the app must hold at every width it is used at. */
const WIDTHS = [390, 768, 1024, 1280, 1920];

for (const width of WIDTHS) {
  test.describe(`${width}px`, () => {
  // A phone is a touch device: the embed's 44px targets answer to `pointer: coarse`.
  if (width === 390) test.use({ hasTouch: true, isMobile: true });
  test(`at ${width}px nothing scrolls sideways${width === 390 ? ' and every control is at least 44px tall' : ''}`, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 900 });
    const ws = await devWorkspace(request);
    const record = seedWorkRecordLocal({ ws, title: `A long title that has to wrap at phone width ${'word '.repeat(12)}`, text: 'responsive check', outcome: 'failed' });
    const art = await uploadViaApi(request, [{ path: 'r.md', body: '# r' }], { title: 'Responsive artifact' });
    for (const path of ['/', '/?q=responsive', '/outcomes', '/collections', `/a/${record}`, `/a/${art.itemId}`]) {
      await page.goto(path);
      await expect(page.locator('h1').first()).toBeVisible();
      await expectNoSideways(page, `${path} at ${width}px`);
      if (width === 390) expect(await shortControls(page, 3), `${path} at 390px`).toEqual([]);
    }
    // The operator's phone review of phase 1, held at every width:
    await page.goto(`/a/${art.itemId}`);
    const title = (await page.locator('h1').first().boundingBox())!;
    const viewer = (await page.locator('.viewer').boundingBox())!;
    expect(viewer.y - title.y, 'the content starts right under the title').toBeLessThan(width < 768 ? 170 : 130);
    const bar = page.locator('.sl-toolbar');
    await expect(bar).toBeVisible();
    for (const control of await bar.locator('button:visible, a:visible, .sl-select:visible').all()) {
      const words = await control.evaluate((el) => [...el.querySelectorAll('.sl-label, .sl-version')].some((l) => (l as HTMLElement).offsetWidth > 1 && l.textContent!.trim() !== ''));
      expect(words, 'no toolbar control is an icon alone').toBe(true);
    }
    if (width === 390) {
      // The embed's own toolbar at phone width: secondaries fold into a labelled More, whose items are tap-sized.
      const more = bar.locator('.sl-more-toggle');
      await expect(more).toBeVisible();
      await expect(more).toContainText('More');
      await expect(bar.locator('.sl-secondary:visible')).toHaveCount(0);
      await more.click();
      const panel = page.locator('.sl-more-panel:not([hidden])');
      await expect(panel).toBeVisible();
      const heights = await panel.locator('.sl-more-item:visible, .sl-more-field select:visible').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
      expect(heights.length, 'More has items').toBeGreaterThan(0);
      expect(heights.filter((h) => h < 43.5), 'every More item is at least 44px tall').toEqual([]);
      await expectNoSideways(page, 'the open More panel at 390px');
    }
    const header = page.locator('header.suite-shell');
    await expect(header.locator('.suite-shell-brand')).toContainText('Superlibrary');
    await expect(header.locator('.suite-shell-account')).toBeVisible();
    await expect(header.getByRole('button', { name: 'Sign out' })).toBeHidden();   // inside the account menu
    // The suite shell rule on a phone: the nav is a full-width row under the brand row; wider, one row.
    const brand = (await header.locator('.suite-shell-brand').boundingBox())!;
    const nav = (await header.locator('.suite-shell-nav').boundingBox())!;
    if (width < 768) {
      expect(nav.y, 'the nav sits under the brand row on a phone').toBeGreaterThanOrEqual(brand.y + brand.height - 1);
      expect(nav.width, 'and spans the width').toBeGreaterThan(width - 40);
    } else {
      expect(nav.y, 'the nav shares the brand row when wide').toBeLessThan(brand.y + brand.height);
    }
  });
  });
}
