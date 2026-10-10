import { expect, test } from '@playwright/test';
import { uploadViaApi } from './helpers';
import { VIBES_E2E, openEnclosures, seedCollection, useAppearance } from './vibes';

/** The real stack, per vibe: the key screens keep their words and their controls work (spec §6, §8.2). Chromium only (playwright.config.ts). */
for (const vibe of VIBES_E2E) {
  test(`${vibe}: the key screens keep their words and controls`, async ({ page, context, request }) => {
    await useAppearance(context, vibe, 'light');
    const art = await uploadViaApi(request, [{ path: 'p.md', body: '# Parity' }], { title: `Parity ${vibe} ${Date.now()}` });
    const col = await seedCollection(request, `Parity ${vibe} ${Date.now()}`, art.itemId);

    await page.goto('/');
    await expect(page.getByLabel('Search the library')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeVisible();
    await expect(page.locator('summary', { hasText: 'Filters' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Upload' }).first()).toBeVisible();
    await expect(page.locator('[aria-label="Library"]').getByRole('link', { name: new RegExp(`Parity ${vibe}`) }).first()).toBeVisible();

    await page.goto(`/a/${art.itemId}`);
    await openEnclosures(page);
    await expect(page.locator('.viewer')).toBeVisible();
    for (const h of ['Versions', 'Details · version 1', 'Provenance', 'Related', 'Collections', 'Moderate', 'Revoke']) {
      await expect(page.getByRole('heading', { name: new RegExp(`^${h}`) }).first(), h).toBeVisible();
    }
    await expect(page.getByRole('link', { name: 'Upload a new version' })).toBeVisible();
    for (const b of ['Save caption', 'Mark as superseded', 'Remove from memory', 'Set the delete date', 'Revoke this item', 'Add to collection']) {
      await expect(page.getByRole('button', { name: b, exact: true }), b).toBeVisible();
    }
    const revoke = page.getByRole('button', { name: 'Revoke this item' });
    await revoke.click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(revoke).toBeFocused();

    await page.goto(`/collections/${col}`);
    await expect(page.getByRole('button', { name: 'Rename or describe' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Remove .*from collection/ })).toBeVisible();
    await page.getByRole('button', { name: 'Delete collection' }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.keyboard.press('Escape');
  });
}
