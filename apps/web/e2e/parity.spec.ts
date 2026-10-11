import { expect, test } from '@playwright/test';
import { ARTIFACT_BUTTONS, ARTIFACT_HEADINGS, LIBRARY_COMBOBOXES, OUTCOME_WORDS } from '../src/lib/screens/parity.controls';
import { uploadViaApi } from './helpers';
import { VIBES_E2E, openEnclosures, seedCollection, useAppearance } from './vibes';

/**
 * The real stack, per vibe: the key screens keep their words and their controls are present and work
 * (spec §6, §8.2). Chromium only (playwright.config.ts). The unit parity test holds the full inventory;
 * this drives the controls. The control names are the unit test's own (src/lib/screens/parity.controls.ts).
 */
for (const vibe of VIBES_E2E) {
  test(`${vibe}: the key screens keep their words and controls work`, async ({ page, context, request }) => {
    test.setTimeout(120_000);
    await useAppearance(context, vibe, 'light');
    const stamp = Date.now();
    const title = `Parity ${vibe} ${stamp}`;
    const art = await uploadViaApi(request, [{ path: 'p.md', body: '# Parity' }], { title });
    const other = await uploadViaApi(request, [{ path: 'o.md', body: '# Other' }], { title: `Other ${vibe} ${stamp}` });
    const colA = await seedCollection(request, `Parity A ${vibe} ${stamp}`, art.itemId);
    const nameB = `Parity B ${vibe} ${stamp}`;
    await seedCollection(request, nameB, other.itemId);

    // The library: search runs and the results update; Filters opens and shows its controls.
    await page.goto('/');
    await expect(page.getByRole('searchbox', { name: 'Search the library' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Upload' }).first()).toBeVisible();
    await page.getByRole('searchbox', { name: 'Search the library' }).fill(`Parity ${vibe} ${stamp}`);
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`[?&]q=`));
    await expect(page.locator('[aria-label="Library"], [aria-label="Search results"]').getByRole('link', { name: new RegExp(title) }).first()).toBeVisible();
    const filters = page.locator('details', { has: page.locator('summary', { hasText: 'Filters' }) });
    await filters.locator('summary').click();   // a search may leave Filters open: the click is a toggle
    if (!(await filters.evaluate((d: HTMLDetailsElement) => d.open))) await filters.locator('summary').click();
    await expect(filters).toHaveJSProperty('open', true);
    for (const c of LIBRARY_COMBOBOXES) await expect(page.getByRole('combobox', { name: c, exact: true }), c).toBeVisible();
    await expect(page.getByRole('group', { name: 'Outcome' })).toBeVisible();
    for (const o of OUTCOME_WORDS) await expect(page.getByRole('checkbox', { name: o, exact: true }), o).toBeVisible();

    // The item page: every section and control is there; adding to a collection, superseding and revoking respond.
    await page.goto(`/a/${art.itemId}`);
    await openEnclosures(page);
    await expect(page.locator('.viewer')).toBeVisible();
    for (const h of ARTIFACT_HEADINGS) await expect(page.getByRole('heading', { name: h, exact: true }), h).toBeVisible();
    await expect(page.getByRole('link', { name: 'Upload a new version' })).toBeVisible();
    for (const b of ARTIFACT_BUTTONS) await expect(page.getByRole('button', { name: b, exact: true }), b).toBeVisible();

    await page.getByRole('region', { name: 'Collections' }).getByRole('combobox').selectOption({ label: nameB });
    await page.getByRole('button', { name: 'Add to collection' }).click();
    await expect(page.getByRole('status').filter({ hasText: `Added to “${nameB}”.` })).toBeVisible();

    const mark = page.getByRole('button', { name: 'Mark as superseded', exact: true });
    await expect(mark).toBeDisabled();
    await page.getByLabel('Replaced by').fill(`http://localhost:5173/a/${other.itemId}`);
    await expect(mark).toBeEnabled();
    await page.getByLabel('Replaced by').fill('');
    await expect(mark).toBeDisabled();
    // A valid replacement asks first (ModerationPanel's askReplace → ConfirmDialog); Escape returns focus to the button.
    await page.getByLabel('Replaced by').fill(`http://localhost:5173/a/${other.itemId}`);
    await mark.click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(mark).toBeFocused();

    const revoke = page.getByRole('button', { name: 'Revoke this item' });
    await revoke.click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(revoke).toBeFocused();

    // Collections: the form is there; a collection renames (Cancel returns focus), deletes (Escape returns focus) and lets go of an item.
    await page.goto('/collections');
    await openEnclosures(page);
    await expect(page.getByRole('button', { name: 'Create collection' })).toBeVisible();
    await expect(page.getByLabel('Name', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Description (optional)')).toBeVisible();

    await page.goto(`/collections/${colA}`);
    await openEnclosures(page);
    const rename = page.getByRole('button', { name: 'Rename or describe' });
    await rename.click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(rename).toBeFocused();

    const del = page.getByRole('button', { name: 'Delete collection' });
    await del.click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(del).toBeFocused();

    const entry = page.getByRole('link', { name: new RegExp(title) });
    await expect(entry.first()).toBeVisible();
    await page.getByRole('button', { name: `Remove “${title}” from collection` }).click();
    await expect(entry).toHaveCount(0);
  });
}
