import { devices, expect, test, type Page } from '@playwright/test';
import { frameOf, uploadViaApi } from './helpers';

/** Nothing scrolls sideways: the page is no wider than the screen. */
async function expectNoSideways(page: Page, label: string) {
  const w = await page.evaluate(() => ({ scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), innerWidth: window.innerWidth }));
  expect(w.scrollWidth, `${label}: nothing scrolls sideways (innerWidth ${w.innerWidth})`).toBeLessThanOrEqual(w.innerWidth);
}

/**
 * Every control a person can tap on a phone is at least 44px tall (Apple's minimum; iOS is the
 * primary platform). A checkbox is measured by its label, which is what takes the tap; a link inside
 * a sentence is exempt (WCAG 2.5.8's inline exception).
 */
async function shortControls(page: Page, atLeast: number): Promise<string[]> {
  const { checked, short } = await page.evaluate(() => {
    const short: string[] = [];
    let checked = 0;
    const controls = document.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, summary, [role=button]');
    for (const el of controls) {
      const target = el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio') ? (el.closest('label') ?? el) : el;
      const r = target.getBoundingClientRect();
      const style = getComputedStyle(target);
      if (r.width === 0 || r.height === 0 || style.visibility === 'hidden') continue;
      if (el.closest('[hidden], .visually-hidden')) continue;
      const p = el.tagName === 'A' ? el.closest('p') : null;
      if (p && p.textContent!.trim() !== el.textContent!.trim()) continue;
      checked++;
      if (r.height < 44 - 0.5) short.push(`${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ').join('.') : ''} "${(el.textContent || el.getAttribute('aria-label') || el.getAttribute('name') || '').trim().slice(0, 40)}" ${r.height.toFixed(1)}px`);
    }
    return { checked, short };
  });
  expect(checked, 'controls measured').toBeGreaterThanOrEqual(atLeast);
  return short;
}

test.describe('at phone width', () => {
  const { defaultBrowserType: _b, ...phone } = devices['Pixel 5'];
  test.use({ ...phone, viewport: { width: 390, height: 844 } });

  test('every control on the library, upload and item pages is at least 44px tall', async ({ page, request }) => {
    const item = await uploadViaApi(request, [{ path: 'r.md', body: '# r' }, { path: 'notes/s.md', body: '# s' }], { title: 'tap targets' });
    await uploadViaApi(request, [{ path: 'r.md', body: '# r2' }], { item: item.itemId });

    await page.goto('/');
    await expect(page.locator('.items a').first()).toBeVisible();
    expect(await shortControls(page, 5), 'library').toEqual([]);
    await expectNoSideways(page, 'library');

    await page.goto('/upload');
    await page.locator('input[name=files]').setInputFiles([
      { name: 'a.md', mimeType: 'text/markdown', buffer: Buffer.from('# a') },
      { name: 'b.md', mimeType: 'text/markdown', buffer: Buffer.from('# b') },
    ]);
    await expect(page.getByText('2 files chosen')).toBeVisible();
    expect(await shortControls(page, 8), 'upload').toEqual([]);
    await expectNoSideways(page, 'upload');

    await page.goto(`/a/${item.itemId}/v/1`);
    await expect(frameOf(page).locator('h1')).toBeVisible();
    await expect(page.locator('select.sl-versions')).toBeAttached();
    await page.locator('button.sl-files-toggle').click();
    await expect(page.locator('.sl-files-panel button.sl-file')).toHaveCount(2);
    expect(await shortControls(page, 15), 'item, files open').toEqual([]);
    await expectNoSideways(page, 'item');
    await page.locator('button.sl-files-toggle').click();
    await page.locator('button.sl-share-toggle').click();
    await expect(page.locator('.sl-share-panel')).toBeVisible();
    expect(await shortControls(page, 15), 'item, share open').toEqual([]);
  });
});
