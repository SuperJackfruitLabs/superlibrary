import { expect, test } from '@playwright/test';
import { VIBES_E2E, useAppearance } from './vibes';

/**
 * The favicons and home-screen install files are served to anyone, signed in or not, with the right
 * types. A phone fetches the manifest and icons before anyone has signed in to the installed app, and
 * an iOS home-screen app does not share Safari's cookies.
 */
// favicon.ico's type comes from static/_headers in production (installable.test.ts checks it); the
// Vite dev server sends none for .ico, so here it is checked for being served at all.
const FILES: [string, RegExp][] = [
  ['/brand/favicon.svg', /^image\/svg\+xml/],
  ['/favicon.ico', /^(image\/(x-icon|vnd\.microsoft\.icon))?$/],
  ['/brand/favicon-16.png', /^image\/png/],
  ['/brand/favicon-32.png', /^image\/png/],
  ['/brand/favicon-48.png', /^image\/png/],
  ['/manifest.webmanifest', /^application\/manifest\+json/],
  ['/brand/icon-192.png', /^image\/png/],
  ['/brand/icon-512.png', /^image\/png/],
  ['/brand/icon-maskable-192.png', /^image\/png/],
  ['/brand/icon-maskable-512.png', /^image\/png/],
  ['/apple-touch-icon.png', /^image\/png/],
  ['/brand/og.png', /^image\/png/],
  ['/brand/logo-motion.js', /javascript/],
];
/** The old mark's files: gone, not left to be found (catch-up S13). */
const GONE = ['/favicon.svg', '/icon-192.png', '/icon-512.png', '/icon-maskable-512.png'];

test('install files are public', async ({ playwright, baseURL }) => {
  const anon = await playwright.request.newContext();
  try {
    for (const [path, type] of FILES) {
      const res = await anon.get(`${baseURL}${path}`, { maxRedirects: 0 });
      expect(res.status(), path).toBe(200);
      expect(res.headers()['content-type'], path).toMatch(type);
    }
    const manifest = await (await anon.get(`${baseURL}/manifest.webmanifest`)).json();
    expect(manifest.display).toBe('standalone');
    for (const icon of manifest.icons as { src: string }[]) expect((await anon.get(`${baseURL}${icon.src}`)).status(), icon.src).toBe(200);
    // The SPA answers any path with its shell, so "gone" is: not an image any more.
    for (const path of GONE) expect((await anon.get(`${baseURL}${path}`)).headers()['content-type'] ?? '', path).not.toMatch(/^image\//);
  } finally {
    await anon.dispose();
  }
});

for (const vibe of VIBES_E2E) {
  test(`${vibe}: the header shows the translucent-v2 mark inside a link named Superlibrary, decorative beside the name`, async ({ page, context }) => {
    await useAppearance(context, vibe, 'light');
    await page.goto('/');
    const home = page.getByRole('link', { name: 'Superlibrary', exact: true });
    await expect(home.locator('[data-testid="superlibrary-mark"]')).toBeVisible();
    await expect(home.locator('[data-testid="superlibrary-mark"]')).toHaveAttribute('aria-hidden', 'true');
    expect(await home.locator('[data-testid="superlibrary-mark"] path').count()).toBe(5);   // the pack's four pages and the seams
    await expect(page.locator('header [data-testid="logo-motion"]')).toHaveCount(0);       // the nav mark never animates
  });
}

test('the boot screen shows the animated mark, and the sign-in page the mark', async ({ page }) => {
  await page.route('**/api/v1/me', async (r) => { await new Promise((f) => setTimeout(f, 1500)); await r.continue().catch(() => {}); });
  await page.goto('/');
  await expect(page.locator('main [data-testid="logo-motion"] svg')).toBeVisible();
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.goto('/login');
  await expect(page.locator('main [data-testid="superlibrary-mark"]')).toBeVisible();
});
