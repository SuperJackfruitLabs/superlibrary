/**
 * The vibekit 0.0.12 motion suite in the app. Reduced motion means no motion at all; with motion on,
 * skeletons clear and every enter settles: nothing keeps moving, and nothing is left covering the
 * controls or blocking the page (no inert layer, no pointer-events lock). The one spec that turns
 * reduced motion off (playwright.config.ts turns it on for every other).
 */
import { expect, test, type Browser, type Page } from '@playwright/test';
import { seedCatchUp, type Seed } from './seed';
import { VIBES_E2E, useAppearance, waitForScreen, type VibeName } from './vibes';

let seed: Seed;
test.beforeAll(async ({ request }) => { test.setTimeout(600_000); seed = await seedCatchUp(request); });
const screens = () => ['/', '/collections', `/collections/${seed.collection}`, '/outcomes', `/a/${seed.many}`];

/** Running animations that end (an infinite one, such as Studio's live LED or a shimmer, is not motion that settles). */
const finiteRunning = (page: Page) =>
  page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getComputedTiming().endTime !== Infinity).length);

async function usable(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    if (getComputedStyle(document.body).pointerEvents === 'none') out.push('body pointer-events: none');
    if (document.querySelector('[inert]')) out.push('an inert layer');
    const main = document.querySelector('main') ?? document.body;
    const controls = [...main.querySelectorAll<HTMLElement>('a[href], button')].filter((el) => {
      const r = el.getBoundingClientRect();
      const shut = el.closest('details');
      if (shut && !shut.open && !el.closest('summary')) return false;
      return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight && !el.closest('[aria-hidden="true"], .visually-hidden');
    }).slice(0, 8);
    for (const el of controls) {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (hit && !el.contains(hit) && !hit.contains(el)) out.push(`${el.outerHTML.slice(0, 80)} is covered by ${hit.outerHTML.slice(0, 80)}`);
    }
    return out;
  });
}

async function open(browser: Browser, vibe: VibeName, reducedMotion: 'reduce' | 'no-preference') {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 820 }, reducedMotion });
  await useAppearance(ctx, vibe, 'light');
  return { ctx, page: await ctx.newPage() };
}

test.describe('reduced motion: nothing animates', () => {
  for (const vibe of VIBES_E2E) {
    test(`${vibe}: no animation runs on the main screens, nor when a menu or the Appearance dialog opens`, async ({ browser }) => {
      test.setTimeout(120_000);
      const { ctx, page } = await open(browser, vibe, 'reduce');
      for (const route of screens()) {
        await page.goto(route);
        await expect(page.locator('main h1').first()).toBeVisible();
        await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });
        await page.waitForTimeout(300);
        const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && (a.effect?.getComputedTiming().duration as number) > 0).map((a) => (a as CSSAnimation).animationName ?? a.constructor.name));
        expect(running, `${vibe} ${route}`).toEqual([]);
      }
      await page.getByRole('button', { name: 'Account' }).click();
      await page.getByRole('button', { name: 'Appearance' }).click();
      await expect(page.getByRole('dialog', { name: 'Appearance' })).toBeVisible();
      expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && (a.effect?.getComputedTiming().duration as number) > 0).length)).toBe(0);
      await ctx.close();
    });
  }
});

test.describe('motion on: it settles', () => {
  for (const vibe of VIBES_E2E) {
    test(`${vibe}: skeletons clear, enters settle, nothing is left covering the page; menus and the dialog open and close cleanly`, async ({ browser }) => {
      test.setTimeout(150_000);
      const { ctx, page } = await open(browser, vibe, 'no-preference');
      for (const route of screens()) {
        await page.goto(route);
        await waitForScreen(page);
        await expect.poll(() => finiteRunning(page), { timeout: 10_000 }).toBe(0);
        const rects = () => page.evaluate(() => [...document.querySelectorAll('main h1, main h2')].slice(0, 10).map((h) => { const r = h.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; }));
        const before = await rects();
        await page.waitForTimeout(500);
        expect(await rects(), `${vibe} ${route}: headings moved after settling`).toEqual(before);
        expect(await usable(page), `${vibe} ${route}`).toEqual([]);
      }
      // A change of screen fades in and hands the page back.
      await page.getByRole('link', { name: 'Collections', exact: true }).first().click();
      await expect(page.getByRole('heading', { name: 'Collections', level: 1 })).toBeVisible();
      await expect.poll(() => finiteRunning(page), { timeout: 10_000 }).toBe(0);
      expect(await usable(page), `${vibe}: after a route change`).toEqual([]);
      // The account menu pops open and closes on Escape; the Appearance dialog opens and closes; nothing is left behind.
      await page.getByRole('button', { name: 'Account' }).click();
      await expect(page.getByRole('button', { name: 'Appearance' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('button', { name: 'Appearance' })).toBeHidden();
      await page.getByRole('button', { name: 'Account' }).click();
      await page.getByRole('button', { name: 'Appearance' }).click();
      const dialog = page.getByRole('dialog', { name: 'Appearance' });
      await expect(dialog).toBeVisible();
      await expect.poll(() => finiteRunning(page), { timeout: 10_000 }).toBe(0);
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      expect(await usable(page), `${vibe}: after the dialog`).toEqual([]);
      await ctx.close();
    });
  }
});
