/**
 * Loading, empty and failed (catch-up audit S1-S5, S7, S9). The API is held back (300/1500/5000 ms),
 * fails (500) or never answers, and every screen must say nothing false while it waits: no "nothing"
 * or 0 before the data, a skeleton in aria-busy, one polite status line, no raw codes, Try again that
 * works, Failed at 20 s instead of loading forever, no layout shift when the data lands (CLS <= 0.1),
 * focus on the new page after a client navigation, and a real 404 page.
 *
 * Reduced motion is on (playwright.config.ts): nothing here waits on an animation.
 */
import { expect, test, type Browser, type Page } from '@playwright/test';
import { seedCatchUp, MANY_VERSIONS_TITLE, SEED_COLLECTION, type Seed } from './seed';
import { VIBES_E2E, useAppearance, type VibeName } from './vibes';

const SIZES = [{ n: 'desk', width: 1440, height: 900 }, { n: 'phone', width: 390, height: 844 }] as const;
/** Words that would be false (or raw) before the data is in. */
const EMPTY = "Nothing|No collections yet|\\b0 items?\\b|Something went wrong|HTTP|\\(\\d{3}\\)|\\binternal\\b|Error:";

let seed: Seed;
test.beforeAll(async ({ request }) => {
  test.setTimeout(600_000);
  seed = await seedCatchUp(request);
});

type Route = { name: string; url: () => string; ready: string; text?: string };
const ROUTES: Route[] = [
  { name: 'library', url: () => '/', ready: 'main a[href^="/a/"]' },
  { name: 'collections', url: () => '/collections', ready: 'main a[href^="/collections/col_"]' },
  { name: 'collection', url: () => `/collections/${seed.collection}`, ready: 'main h1', text: SEED_COLLECTION },
  { name: 'outcomes', url: () => '/outcomes', ready: 'main a[href^="/a/"]' },
  { name: 'item', url: () => `/a/${seed.many}`, ready: 'main h1', text: MANY_VERSIONS_TITLE },
  { name: 'version', url: () => `/a/${seed.many}/v/3`, ready: 'main h1', text: MANY_VERSIONS_TITLE },
];
/** The routes the other vibes walk (where their loading forms differ most), at phone width where CLS bites. */
const OTHER_VIBE_ROUTES = ['library', 'item', 'collection', 'outcomes'];

function sampler([empty, ready, text]: [string, string, string]): void {
  type A = { cls: number; empties: Record<string, number>; real: number | null; skeleton: number | null; busy: number | null; statuses: number };
  const a: A = ((window as unknown as { __a: A }).__a = { cls: 0, empties: {}, real: null, skeleton: null, busy: null, statuses: 0 });
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries() as unknown as { hadRecentInput: boolean; value: number }[]) if (!e.hadRecentInput) a.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
  } catch { /* not Chromium */ }
  const re = new RegExp(empty, 'g');
  const look = () => {
    const main = document.querySelector('main');
    if (!main) return;
    const t = Math.round(performance.now());
    // What a person reads: the skeleton's own words are aria-hidden stand-ins, not claims.
    const copy = main.cloneNode(true) as HTMLElement;
    for (const s of copy.querySelectorAll('[data-skeleton]')) s.remove();
    const txt = copy.textContent || '';
    if (a.real === null) for (const m of txt.match(re) ?? []) if (a.empties[m] === undefined) a.empties[m] = t;
    const r = document.querySelector(ready);
    if (a.real === null && r && (!text || r.textContent?.trim() === text)) a.real = t;
    if (a.skeleton === null && document.querySelector('[data-skeleton]')) a.skeleton = t;
    if (a.real === null && document.querySelector('[aria-busy="true"]')) {
      a.busy ??= t;
      a.statuses = Math.max(a.statuses, [...document.querySelectorAll('[role="status"]')].filter((s) => (s.textContent ?? '').trim() !== '').length);
    }
  };
  new MutationObserver(look).observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['aria-busy'] });
}

const stats = (page: Page) => page.evaluate(() => (window as unknown as { __a: { cls: number; empties: Record<string, number>; real: number | null; skeleton: number | null; busy: number | null; statuses: number } }).__a);

/** Hold the data reads back (not /me: the screen, not the boot, is under test), fail them, or never answer. */
async function hold(page: Page, mode: { delay: number } | 'error' | 'never', what = /\/api\/v1\/(?!me$)/): Promise<void> {
  await page.route((u) => u.port === '5173' && what.test(u.pathname), async (r) => {
    if (mode === 'never') return;
    if (mode === 'error') { await r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"internal"}' }).catch(() => {}); return; }
    await new Promise((f) => setTimeout(f, mode.delay));
    await r.continue().catch(() => {});
  });
}

async function openAt(browser: Browser, vibe: VibeName, size: { width: number; height: number }, route: Route) {
  const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, reducedMotion: 'reduce', ...(size.width < 500 ? { isMobile: true, hasTouch: true } : {}) });
  await useAppearance(ctx, vibe, 'light');
  await ctx.addInitScript(sampler, [EMPTY, route.ready, route.text ?? ''] as [string, string, string]);
  return { ctx, page: await ctx.newPage() };
}

const WALKS = VIBES_E2E.flatMap((vibe) => SIZES.filter((s) => vibe === 'daylight' || s.n === 'phone').map((size) => ({ vibe, size })));
for (const { vibe, size } of WALKS) {
  test(`${vibe} ${size.n}: no screen says "nothing" or 0 before its data, each waits in aria-busy with one status line, and nothing jumps`, async ({ browser }) => {
    test.setTimeout(240_000);
    const problems: string[] = [];
    for (const route of ROUTES.filter((r) => vibe === 'daylight' || OTHER_VIBE_ROUTES.includes(r.name))) {
      const { ctx, page } = await openAt(browser, vibe, size, route);
      await hold(page, { delay: 1500 });
      await page.goto(route.url(), { waitUntil: 'commit' });
      await expect.poll(async () => (await stats(page)).real, { timeout: 30_000, message: `${route.name}: real content` }).not.toBeNull();
      // Let what follows the data (the viewer frame, related items) land before CLS is read.
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 30_000 });
      await page.waitForTimeout(600);
      const a = await stats(page);
      const early = Object.keys(a.empties);
      if (early.length) problems.push(`${route.name}: "${early.join('", "')}" before the data`);
      if (a.skeleton === null || a.busy === null) problems.push(`${route.name}: no skeleton in aria-busy while waiting`);
      if (a.statuses > 1) problems.push(`${route.name}: ${a.statuses} status lines while loading (one per screen)`);
      if (a.cls > 0.1) problems.push(`${route.name}: CLS ${a.cls.toFixed(3)} > 0.1`);
      await ctx.close();
    }
    expect(problems).toEqual([]);
  });
}

test.describe('timing', () => {
  for (const delay of [300, 5000]) {
    test(`daylight: a ${delay} ms answer still never says "nothing" first`, async ({ browser }) => {
      test.setTimeout(120_000);
      for (const route of ROUTES.filter((r) => ['library', 'item'].includes(r.name))) {
        const { ctx, page } = await openAt(browser, 'daylight', SIZES[0], route);
        await hold(page, { delay });
        await page.goto(route.url(), { waitUntil: 'commit' });
        await expect.poll(async () => (await stats(page)).real, { timeout: 30_000 }).not.toBeNull();
        expect(Object.keys((await stats(page)).empties), route.name).toEqual([]);
        await ctx.close();
      }
    });
  }

  test('a read that never answers turns to Failed with Try again at 20 s, and says the server is slow at 8 s', async ({ browser }) => {
    test.setTimeout(90_000);
    const { ctx, page } = await openAt(browser, 'daylight', SIZES[0], ROUTES[0]!);
    await hold(page, 'never', /\/api\/v1\/browse$/);
    await page.goto('/');
    await expect(page.locator('[data-skeleton]')).toBeVisible();
    await expect(page.getByText('Still loading — the server is slow.').first()).toBeVisible({ timeout: 12_000 });
    await expect(page.getByText("Couldn't load — try again.")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('main')).not.toContainText(/Nothing here yet|0 items/);
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.locator('main a[href^="/a/"]').first()).toBeVisible();
    await ctx.close();
  });
});

test.describe('failures', () => {
  for (const vibe of VIBES_E2E) {
    test(`${vibe}: a 500 says it could not load, with Try again that works, never "nothing" or a code`, async ({ browser }) => {
      test.setTimeout(120_000);
      for (const route of ROUTES.filter((r) => ['library', 'collection', 'item', 'outcomes', 'collections'].includes(r.name))) {
        const { ctx, page } = await openAt(browser, vibe, SIZES[0], route);
        await hold(page, 'error', /\/api\/v1\/(browse|search|collections.*|items\/[^/]+)$/);
        await page.goto(route.url());
        await expect(page.getByText("Couldn't load — try again."), route.name).toBeVisible();
        await expect(page.locator('main'), route.name).not.toContainText(/Nothing|No collections yet|internal|\(\d{3}\)|HTTP/);
        await page.unrouteAll({ behavior: 'ignoreErrors' });
        await page.getByRole('button', { name: 'Try again' }).click();
        const ready = page.locator(route.ready).first();
        await expect(ready, route.name).toBeVisible();
        if (route.text) await expect(ready).toHaveText(route.text);
        await ctx.close();
      }
    });
  }

  test('a /me that never answers: Connecting…, the slow line at 8 s, Failed with Try again at 20 s; /login does not wait', async ({ browser }) => {
    test.setTimeout(90_000);
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await hold(page, 'never', /^\/api\/v1\/me$/);
    await page.goto('/');
    await expect(page.getByText('Connecting…')).toBeVisible();
    await expect(page.getByText('Still loading — the server is slow.')).toBeVisible({ timeout: 12_000 });
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('body')).not.toContainText(/HTTP|\(\d{3}\)/);
    // Sign-in is a public page: it renders at once, outside the boot gate.
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible({ timeout: 3_000 });
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible();
    await ctx.close();
  });

  test('an address that is not a page is a 404 in the shell, with an h1 and a way home; a missing item says so in its h1', async ({ page }) => {
    await page.goto('/no-such-page');
    await expect(page.getByRole('heading', { level: 1, name: "This page isn't here." })).toBeVisible();
    await expect(page.getByRole('navigation').first()).toBeVisible();
    await page.getByRole('link', { name: 'Back to the library' }).click();
    await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible();
    await page.goto('/a/itm_00000000000000000000');
    await expect(page.getByRole('heading', { level: 1, name: "This doesn't exist or isn't shared with you." })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0);
    await page.goto(`/collections/col_0000000000000000`);
    await expect(page.getByRole('heading', { level: 1, name: "This doesn't exist or isn't shared with you." })).toBeVisible();
  });
});

test.describe('focus', () => {
  test('a skip link comes first, and after a client navigation focus is on the new page, not the body', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
    await page.getByRole('link', { name: 'Collections', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Collections', level: 1 })).toBeVisible();
    await expect.poll(() => page.evaluate(() => { const a = document.activeElement; return a?.tagName === 'H1' || a?.id === 'main'; })).toBe(true);
    await page.locator(`main a[href="/collections/${seed.collection}"]`).click();
    await expect(page.getByRole('heading', { name: SEED_COLLECTION, level: 1 })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.activeElement?.tagName !== 'BODY')).toBe(true);
  });
});
