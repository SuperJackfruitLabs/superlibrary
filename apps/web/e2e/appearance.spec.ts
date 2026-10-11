import { expect, test } from '@playwright/test';
import { useAppearance } from './vibes';

test.describe('the person’s appearance', () => {
  test('the head script alone paints the vibe: the first frame is already right', async ({ page, context }) => {
    await useAppearance(context, 'paper', 'dark');
    // No app JavaScript at all: only the inline head script can set these. (With scripts blocked the
    // dev server serves no CSS either, so the colours are checked in the next test.)
    await page.route('**/*', (r) => (r.request().resourceType() === 'script' ? r.abort() : r.continue()));
    await page.goto('/');
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-vibe', 'paper');
    await expect(html).toHaveAttribute('data-theme', 'dark');
    await expect(html).toHaveAttribute('data-time', 'strong');
    await expect(html).toHaveAttribute('data-phase', /^(dawn|morning|noon|golden|dusk|night)$/);
  });

  test('with the app running, Paper dark paints its own background', async ({ page, context }) => {
    // Time of day off: Paper's strong time tints the page by the hour, so only `off` is the plain `bg`.
    await useAppearance(context, 'paper', 'dark', 'off');
    await page.goto('/');
    await expect(page.locator('h1').first()).toBeVisible();
    // Paper dark's `--vk-color-bg` is #1a1916.
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(26, 25, 22)');
  });

  test('with the app running, the page is in that vibe on the first animation frame', async ({ page, context }) => {
    await useAppearance(context, 'studio', 'light');
    await page.addInitScript(() => {
      requestAnimationFrame(() => { (window as unknown as { __first: string | undefined }).__first = document.documentElement.dataset.vibe; });
    });
    await page.goto('/');
    await expect(page.locator('h1').first()).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __first: string | undefined }).__first)).toBe('studio');
  });

  test('the picker changes vibe and theme at once, saves them, and keyboard works', async ({ page, context }) => {
    await page.clock.setFixedTime(new Date('2026-10-11T12:00:00'));
    await page.goto('/');
    await page.getByRole('button', { name: 'Account' }).click();
    await page.getByRole('button', { name: 'Appearance' }).click();
    const dialog = page.getByRole('dialog', { name: 'Appearance' });
    await expect(dialog.getByRole('radio', { name: /Daylight/ })).toBeFocused();
    await page.keyboard.press('ArrowDown');   // native radios: arrows move and choose
    await expect(page.locator('html')).toHaveAttribute('data-vibe', 'paper');
    await dialog.getByRole('radio', { name: /Studio/ }).check();
    await expect(page.locator('html')).toHaveAttribute('data-vibe', 'studio');
    await dialog.getByRole('radio', { name: 'Dark', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect((await context.cookies()).find((c) => c.name === 'vk_appearance')?.value).toBe('studio.dark.strong.0');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Account' })).toBeFocused();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-vibe', 'studio');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('Quiet starts with the time of day off', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Account' }).click();
    await page.getByRole('button', { name: 'Appearance' }).click();
    await page.getByRole('dialog', { name: 'Appearance' }).getByRole('radio', { name: /Quiet/ }).check();
    await expect(page.locator('html')).toHaveAttribute('data-time', 'off');
  });

  test('reduced motion skips the view transition; otherwise a change uses one', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __vt: number };
      w.__vt = 0;
      const start = document.startViewTransition?.bind(document);
      if (start) document.startViewTransition = ((cb: () => void) => { w.__vt++; return start(cb); }) as typeof document.startViewTransition;
    });
    const pick = async (name: RegExp) => {
      await page.getByRole('button', { name: 'Account' }).click();
      await page.getByRole('button', { name: 'Appearance' }).click();
      await page.getByRole('dialog', { name: 'Appearance' }).getByRole('radio', { name }).check();
      await page.getByRole('button', { name: 'Done' }).click();
    };
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await pick(/Paper/);
    expect(await page.evaluate(() => (window as unknown as { __vt: number }).__vt)).toBe(0);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await pick(/Quiet/);
    const hasVT = await page.evaluate(() => 'startViewTransition' in document);
    expect(await page.evaluate(() => (window as unknown as { __vt: number }).__vt)).toBe(hasVT ? 1 : 0);
  });

  test('an old Light or Dark choice carries over', async ({ page, context }) => {
    // Noon, so following the sun alone would be light: dark can only come from the old choice.
    await page.clock.setFixedTime(new Date('2026-06-21T12:00:00'));
    await context.addInitScript(() => { if (!document.cookie.includes('vk_appearance')) localStorage.setItem('superlibrary:theme', 'dark'); });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    // The app writes the cookie after mount; wait for it rather than reading once.
    await expect.poll(async () => (await context.cookies()).find((c) => c.name === 'vk_appearance')?.value).toBe('daylight.dark.strong.0');
  });
});
