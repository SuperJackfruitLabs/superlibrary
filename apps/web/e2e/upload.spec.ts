import { expect, test } from '@playwright/test';
import { DEV, frameOf, uploadViaApi } from './helpers';

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

test('a denylisted file alone is left out, and nothing is sent', async ({ page }) => {
  const sent: string[] = [];
  page.on('request', (r) => { if (r.url().includes('/api/v1/uploads')) sent.push(r.url()); });
  await page.goto('/upload');
  await page.locator('input[name=files]').setInputFiles({ name: '.env', mimeType: 'text/plain', buffer: Buffer.from('A=1\n') });
  await expect(page.getByRole('status').filter({ hasText: 'left out' })).toContainText('This file is left out: .env (the .env* rule).');
  await expect(page.getByRole('alert')).toHaveText('Choose at least one file.');
  await expect(page.getByRole('button', { name: 'Upload', exact: true })).toBeDisabled();
  expect(sent).toEqual([]);
});

test('denied files in a pick are left out and listed; the rest uploads', async ({ page, request }) => {
  await page.goto('/upload');
  await page.locator('input[name=files]').setInputFiles([
    { name: 'notes.md', mimeType: 'text/markdown', buffer: Buffer.from('# Notes\n') },
    { name: '.env', mimeType: 'text/plain', buffer: Buffer.from('A=1\n') },
    { name: 'server.pem', mimeType: 'text/plain', buffer: Buffer.from('x') },
  ]);
  await expect(page.getByText('These 2 files are left out: .env (the .env* rule) and server.pem (the *.pem rule).')).toBeVisible();
  await expect(page.getByText('1 file chosen')).toBeVisible();
  await page.getByRole('button', { name: 'Upload', exact: true }).click();
  await expect(page).toHaveURL(/\/a\/itm_[0-9a-f]{16}$/);
  const id = page.url().split('/a/')[1]!;
  const read = await (await request.get(`http://localhost:8787/api/v1/items/${id}`, { headers: DEV })).json();
  expect(read.versions[0].files.map((f: { path: string }) => f.path)).toEqual(['notes.md']);
});

test('a new version keeps its item\'s title, and says whose version it is', async ({ page, request }) => {
  const item = await uploadViaApi(request, [{ path: 'q.md', body: '# q1' }], { title: 'Quarterly notes' });
  await page.goto(`/upload?item=${item.itemId}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Upload a new version of Quarterly notes');
  await expect(page.getByLabel('Title')).toHaveValue('Quarterly notes');
  await expect(page.getByText('Who will see the new version: Everyone in the workspace.')).toBeVisible();
  await page.locator('input[name=files]').setInputFiles({ name: 'some-other-name.md', mimeType: 'text/markdown', buffer: Buffer.from('# q2') });
  await expect(page.getByText('1 file chosen')).toBeVisible();
  await expect(page.getByLabel('Title')).toHaveValue('Quarterly notes');
  await page.getByRole('button', { name: 'Upload', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/a/${item.itemId}$`));
  const read = await (await request.get(`http://localhost:8787/api/v1/items/${item.itemId}`, { headers: DEV })).json();
  expect(read.item).toMatchObject({ title: 'Quarterly notes', latestVersion: 2 });
});

test('the upload page says who will see it, and the library says who can', async ({ page, request }) => {
  await page.goto('/upload');
  await expect(page.getByText('Everyone in the workspace will be able to see it.')).toBeVisible();
  const item = await uploadViaApi(request, [{ path: 'v.md', body: '# v' }], { title: 'who sees this' });
  await page.goto('/');
  const row = page.locator('.items li', { hasText: 'who sees this' }).first();
  await expect(row).toContainText('Everyone in the workspace');
  await expect(row).not.toContainText('· workspace ·');
  expect(item.itemId).toMatch(/^itm_/);
});

test('an item address that is not an item id is not found, and the API is not asked', async ({ page }) => {
  const asked: string[] = [];
  page.on('request', (r) => { if (r.url().includes('/api/v1/items/')) asked.push(r.url()); });
  await page.goto('/a/not-an-item');
  await expect(page.getByText('Nothing here, or you cannot see it.')).toBeVisible();
  expect(asked).toEqual([]);
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

