import { expect, test } from '@playwright/test';

/**
 * The favicons and home-screen install files are served to anyone, signed in or not, with the right
 * types. A phone fetches the manifest and icons before anyone has signed in to the installed app, and
 * an iOS home-screen app does not share Safari's cookies.
 */
// favicon.ico's type comes from static/_headers in production (installable.test.ts checks it); the
// Vite dev server sends none for .ico, so here it is checked for being served at all.
const FILES: [string, RegExp][] = [
  ['/favicon.svg', /^image\/svg\+xml/],
  ['/favicon.ico', /^(image\/(x-icon|vnd\.microsoft\.icon))?$/],
  ['/manifest.webmanifest', /^application\/manifest\+json/],
  ['/icon-192.png', /^image\/png/],
  ['/icon-512.png', /^image\/png/],
  ['/icon-maskable-512.png', /^image\/png/],
  ['/apple-touch-icon.png', /^image\/png/],
];

test('install files are public', async ({ playwright, baseURL }) => {
  const anon = await playwright.request.newContext();
  try {
    for (const [path, type] of FILES) {
      const res = await anon.get(`${baseURL}${path}`, { maxRedirects: 0 });
      expect(res.status(), path).toBe(200);
      expect(res.headers()['content-type'], path).toMatch(type);
    }
    expect((await (await anon.get(`${baseURL}/manifest.webmanifest`)).json()).display).toBe('standalone');
  } finally {
    await anon.dispose();
  }
});

test('the header and the sign-in page show the mark', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('header.suite-shell a[href="/"] [data-testid="superlibrary-mark"]')).toBeVisible();
  await page.goto('/login');
  await expect(page.locator('main [data-testid="superlibrary-mark"]')).toBeVisible();
});
