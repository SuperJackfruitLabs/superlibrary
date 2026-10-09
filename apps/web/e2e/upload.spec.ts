import { devices, expect, test, type Page } from '@playwright/test';
import { frameOf, uploadViaApi } from './helpers';

test('a person uploads a file and lands on its page', async ({ page }) => {
  await page.goto('/upload');
  await page.locator('input[name=files]').setInputFiles({ name: 'hello.md', mimeType: 'text/markdown', buffer: Buffer.from('# Hello from e2e\n') });
  await page.getByRole('button', { name: 'Upload' }).click();
  await expect(page).toHaveURL(/\/a\/itm_[0-9a-f]{16}$/);
  await expect(frameOf(page).locator('h1')).toHaveText('Hello from e2e');
});

test('a secret is refused with its file and line; an override with a reason uploads it', async ({ page }) => {
  await page.goto('/upload');
  const secret = 'const t = "' + 'gh' + 'p_' + 'aB3xQ9zK7mP2wR5t'.repeat(3) + '";\n';
  await page.locator('input[name=files]').setInputFiles({ name: 'config.ts', mimeType: 'text/plain', buffer: Buffer.from('const a = 1;\n' + secret) });
  await page.getByRole('button', { name: 'Upload' }).click();
  await expect(page.locator('.secrets code', { hasText: 'config.ts' })).toBeVisible();
  await expect(page.getByText('line 2: github-token')).toBeVisible();
  await page.locator('input[name=reason]').fill('fixture, not a live key');
  await page.getByRole('button', { name: 'Upload anyway' }).click();
  await expect(page).toHaveURL(/\/a\/itm_[0-9a-f]{16}$/);
});

test('a denylisted path is refused before anything is sent', async ({ page }) => {
  await page.goto('/upload');
  await page.locator('input[name=files]').setInputFiles({ name: '.env', mimeType: 'text/plain', buffer: Buffer.from('A=1\n') });
  await expect(page.getByRole('alert')).toHaveText('.env is not uploaded: it matches the .env* rule.');
});

test('revoking the whole item says so, and puts focus on it', async ({ page, request }) => {
  const item = await uploadViaApi(request, [{ path: 'gone.md', body: '# soon revoked' }], { title: 'to revoke' });
  await page.goto(`/a/${item.itemId}`);
  await expect(frameOf(page).locator('h1')).toHaveText('soon revoked');
  await page.getByRole('button', { name: 'Revoke this item' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Revoke this item' }).click();
  const said = page.getByText('This was revoked.');
  await expect(said).toBeVisible();
  await expect(said).toBeFocused();
});

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

    await page.goto('/upload');
    await page.locator('input[name=files]').setInputFiles([
      { name: 'a.md', mimeType: 'text/markdown', buffer: Buffer.from('# a') },
      { name: 'b.md', mimeType: 'text/markdown', buffer: Buffer.from('# b') },
    ]);
    await expect(page.getByText('2 files chosen')).toBeVisible();
    expect(await shortControls(page, 8), 'upload').toEqual([]);

    await page.goto(`/a/${item.itemId}/v/1`);
    await expect(frameOf(page).locator('h1')).toBeVisible();
    await expect(page.locator('select.sl-versions')).toBeAttached();
    await page.locator('button.sl-files-toggle').click();
    await expect(page.locator('.sl-files-panel button.sl-file')).toHaveCount(2);
    expect(await shortControls(page, 15), 'item, files open').toEqual([]);
    await page.locator('button.sl-files-toggle').click();
    await page.locator('button.sl-share-toggle').click();
    await expect(page.locator('.sl-share-panel')).toBeVisible();
    expect(await shortControls(page, 15), 'item, share open').toEqual([]);
  });
});
