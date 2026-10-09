import { devices, expect, test } from '@playwright/test';
import { expectNoSideways, frameOf, shortControls, uploadViaApi } from './helpers';

test.describe('at phone width', () => {
  const { defaultBrowserType: _b, ...phone } = devices['Pixel 5'];
  test.use({ ...phone, viewport: { width: 390, height: 844 } });

  test('every control on the library, upload and item pages is at least 44px tall', async ({ page, request }) => {
    const item = await uploadViaApi(request, [{ path: 'r.md', body: '# r' }, { path: 'notes/s.md', body: '# s' }], { title: 'tap targets' });
    await uploadViaApi(request, [{ path: 'r.md', body: '# r2' }], { item: item.itemId });

    await page.goto('/');
    await expect(page.locator('.results .result-link').first()).toBeVisible();
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
    // At phone width Files lives in the labelled More panel (the toolbar control is hidden).
    await page.locator('button.sl-more-toggle').click();
    await expect(page.locator('.sl-more-panel')).toBeVisible();
    expect(await shortControls(page, 15), 'item, more open').toEqual([]);
    await page.locator('.sl-more-panel button.sl-more-item', { hasText: 'Files' }).click();
    await expect(page.locator('.sl-files-panel button.sl-file')).toHaveCount(2);
    expect(await shortControls(page, 15), 'item, files open').toEqual([]);
    await expectNoSideways(page, 'item');
    await page.locator('button.sl-share-toggle').click(); // closes the files panel, opens Share
    await expect(page.locator('.sl-share-panel')).toBeVisible();
    expect(await shortControls(page, 15), 'item, share open').toEqual([]);
  });
});
