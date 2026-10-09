// apps/web/e2e/library.spec.ts
import { expect, test } from '@playwright/test';
import { DEV, devWorkspace, seedWorkRecordLocal, uploadViaApi } from './helpers';

const API = 'http://localhost:8787';

test.describe('the library app (phase 4)', () => {
  test('search with filters finds a work record, and the address keeps the view', async ({ page, request }) => {
    const ws = await devWorkspace(request);
    seedWorkRecordLocal({ ws, title: 'Spring campaign retrospective', text: 'budget overrun on the spring campaign', outcome: 'rejected' });
    await page.goto('/');
    await page.getByLabel('Search the library').fill('retrospective');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page).toHaveURL(/[?&]q=retrospective/);
    const hit = page.getByRole('list', { name: 'Search results' }).getByRole('listitem').filter({ hasText: 'Spring campaign retrospective' });
    await expect(hit).toContainText('Rejected');
    await expect(hit).toContainText('Marketing & Community');
    await page.getByRole('checkbox', { name: 'Approved' }).check();
    await expect(page).toHaveURL(/outcome=approved/);
    await expect(page.getByText('Nothing matches.')).toBeVisible();
    await page.reload();   // the view is the address
    await expect(page.getByRole('checkbox', { name: 'Approved' })).toBeChecked();
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(hit).toBeVisible();
  });

  test('an outcome view: everything rejected on one board this month', async ({ page, request }) => {
    const ws = await devWorkspace(request);
    const board = 'brd_00000000000000e2';
    seedWorkRecordLocal({ ws, title: 'Rejected press note', text: 'press note', outcome: 'rejected', board, boardName: 'Press' });
    seedWorkRecordLocal({ ws, title: 'Approved press note', text: 'press note', outcome: 'approved', board, boardName: 'Press' });
    await page.goto(`/outcomes?outcome=rejected&board=${board}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Everything rejected on Press this month');
    await expect(page.getByRole('link', { name: /Rejected press note/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Approved press note/ })).toHaveCount(0);
    const tabs = page.getByRole('navigation', { name: 'Outcome' });
    await expect(tabs.getByRole('link', { name: /Rejected/ })).toHaveAttribute('aria-current', 'page');
    await expect(tabs.getByRole('link', { name: /Approved/ })).toContainText('1');
  });

  test('a work record shows its timeline, and agent-written text as text', async ({ page, request }) => {
    const ws = await devWorkspace(request);
    const id = seedWorkRecordLocal({ ws, title: 'Timeline card', text: 'timeline', outcome: 'approved', comment: 'Looks good <img src=x onerror=alert(1)>' });
    await page.goto(`/a/${id}`);
    await expect(page.getByRole('heading', { name: 'Timeline card', level: 1 })).toBeVisible();
    const timeline = page.locator('ol.timeline');
    await expect(timeline).toContainText('draft · attempt 1 · completed');
    await expect(timeline).toContainText('Looks good <img src=x onerror=alert(1)>');
    await expect(timeline.locator('img')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Open the card in Superpipeline' })).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(page.getByRole('heading', { name: 'Related' })).toBeVisible();
  });

  test('collections: create, add from the item page, remove', async ({ page, request }) => {
    const a = await uploadViaApi(request, [{ path: 'note.md', body: '# Collected note' }], { title: 'Collected note' });
    const name = `Week ${Date.now()}`;
    await page.goto('/collections');
    await page.getByLabel('Name').fill(name);
    await page.getByRole('button', { name: 'Create collection' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
    await page.goto(`/a/${a.itemId}`);
    await page.getByLabel('Collection', { exact: true }).selectOption({ label: name });
    await page.getByRole('button', { name: 'Add to collection' }).click();
    await expect(page.getByRole('status').filter({ hasText: `Added to “${name}”.` })).toBeVisible();
    await page.goto('/collections');
    await page.getByRole('link', { name: new RegExp(name) }).click();
    await expect(page.getByRole('link', { name: /Collected note/ })).toBeVisible();
    await page.getByRole('button', { name: /Remove .*Collected note.*from collection/ }).click();
    await expect(page.getByRole('link', { name: /Collected note/ })).toHaveCount(0);
  });

  test('moderation: supersede with an in-page confirmation, undo, then remove with a recorded reason', async ({ page, request }) => {
    const dialogs: string[] = [];
    page.on('dialog', (d) => { dialogs.push(d.message()); void d.dismiss(); });
    const oldOne = await uploadViaApi(request, [{ path: 'old.md', body: '# Old plan' }], { title: 'Old plan' });
    const newOne = await uploadViaApi(request, [{ path: 'new.md', body: '# New plan' }], { title: 'New plan' });
    await page.goto(`/a/${oldOne.itemId}`);
    await page.getByLabel('Replaced by').fill(`http://localhost:5173/a/${newOne.itemId}`);
    const mark = page.getByRole('button', { name: 'Mark as superseded' });
    await mark.click();
    const dialog = page.getByRole('alertdialog', { name: 'Mark “Old plan” as superseded?' });
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(mark).toBeFocused();
    await mark.click();
    await dialog.getByRole('button', { name: 'Mark as superseded' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Marked as superseded by “New plan”.' })).toBeVisible();
    await page.getByRole('button', { name: 'Undo superseded' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'No longer marked as superseded.' })).toBeVisible();
    await page.getByRole('button', { name: 'Remove from memory' }).click();
    const remove = page.getByRole('alertdialog', { name: 'Remove “Old plan” from memory?' });
    const act = remove.getByRole('button', { name: 'Remove from memory' });
    await expect(act).toBeDisabled();
    await remove.getByLabel(/Why\?/).fill('posted twice');
    await act.click();
    await expect(page.getByRole('heading', { name: 'Removed from memory' })).toBeVisible();
    expect((await request.get(`${API}/api/v1/items/${oldOne.itemId}`, { headers: DEV })).status()).toBe(404);
    expect(dialogs).toEqual([]);
  });

  test('an owner shows a work record to everyone in the workspace', async ({ page, request }) => {
    const ws = await devWorkspace(request);
    const id = seedWorkRecordLocal({ ws, title: 'Widen me', text: 'widen', outcome: 'completed' });
    await page.goto(`/a/${id}`);
    await page.getByRole('button', { name: 'Show to everyone in the workspace' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Show to everyone' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Everyone in the workspace can now see it.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Show to everyone in the workspace' })).toHaveCount(0);
  });
});
