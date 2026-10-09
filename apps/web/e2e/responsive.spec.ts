// apps/web/e2e/responsive.spec.ts
import { expect, test } from '@playwright/test';
import { devWorkspace, expectNoSideways, seedWorkRecordLocal, shortControls, uploadViaApi } from './helpers';

/** The operator reads on a phone first; the app must hold at every width it is used at. */
const WIDTHS = [390, 768, 1024, 1280, 1920];

for (const width of WIDTHS) {
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
    const header = page.locator('header.suite-shell');
    await expect(header.locator('.suite-shell-brand')).toContainText('Superlibrary');
    await expect(header.locator('.suite-shell-account')).toBeVisible();
    await expect(header.getByRole('button', { name: 'Sign out' })).toBeHidden();   // inside the account menu
  });
}
