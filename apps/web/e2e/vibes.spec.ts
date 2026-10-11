import AxeBuilder from '@axe-core/playwright';
import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { DEV, devWorkspace, expectNoSideways, seedWorkRecordLocal, shortControls, uploadViaApi } from './helpers';
import { VIBES_E2E, openEnclosures, seedCollection, useAppearance } from './vibes';

/** Every key screen in every vibe and theme: accessible, no sideways scroll, 44px targets, a screenshot to look at. Chromium only (playwright.config.ts). */
const THEMES = ['light', 'dark'] as const;
const SCREENS = 'vibe-screens';
let paths: Array<[string, string]> = [];

test.beforeAll(async ({ request }) => {
  const ws = await devWorkspace(request);
  // The records go in first, straight into SQLite, before the uploads make the API write to the same file.
  const rec = seedWorkRecordLocal({ ws, title: 'Vibe check record', text: 'vibe check', outcome: 'approved' });
  // The longest outcome words, so the library's table and tiles are measured with them.
  seedWorkRecordLocal({ ws, title: 'Vibe check superseded', text: 'vibe check', outcome: 'superseded' });
  seedWorkRecordLocal({ ws, title: 'Vibe check in progress', text: 'vibe check', outcome: 'in-progress' });
  const art = await uploadViaApi(request, [{ path: 'v.md', body: '# Vibe check\n\nA paragraph.' }], { title: 'Vibe check artifact' });
  // A delete date adds a fourth fact: the title budget is measured with the most facts the header can hold.
  const dated = await request.patch(`http://localhost:8787/api/v1/items/${art.itemId}`, { headers: DEV, data: { expiresAt: '2030-01-15T00:00:00.000Z' } });
  if (!dated.ok()) throw new Error(`delete date: ${dated.status()} ${await dated.text()}`);
  const col = await seedCollection(request, `Vibe check ${Date.now()}`, art.itemId);
  // A collection name longer than a phone is wide: the item page's Collection picker lists it (this file's own data, not another spec's).
  await seedCollection(request, `Pipeline reviews, a collection name longer than a phone is wide ${Date.now()}`, art.itemId);
  paths = [['home', '/'], ['artifact', `/a/${art.itemId}`], ['record', `/a/${rec}`], ['collections', '/collections'], ['upload', '/upload'], ['collection', `/collections/${col}`]];
  mkdirSync(SCREENS, { recursive: true });
});

for (const vibe of VIBES_E2E) {
  for (const theme of THEMES) {
    test(`${vibe} ${theme}`, async ({ browser }) => {
      test.setTimeout(180_000);
      for (const width of [390, 1280]) {
        // A phone is a touch device: the embed's 44px targets answer to `pointer: coarse`, so the 390px leg is touch.
        const context = await browser.newContext({ viewport: { width, height: 900 }, ...(width === 390 ? { hasTouch: true, isMobile: true } : {}) });
        const page = await context.newPage();
        await useAppearance(context, vibe, theme);
        await page.clock.setFixedTime(new Date('2026-10-11T12:00:00'));
        for (const [name, path] of paths) {
          await page.goto(path);
          await expect(page.locator('h1').first()).toBeVisible();
          await expect(page.locator('html')).toHaveAttribute('data-vibe', vibe);
          await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
          // The app polls, so the network never idles: wait until nothing says it is still loading.
          await expect(page.locator('[role="status"]', { hasText: /^(Loading…|Connecting…|Looking for related work…)$/ })).toHaveCount(0);
          // At phone width Paper's enclosures start closed: open what a person can open, so its controls are measured too.
          if (width === 390) await openEnclosures(page);
          // The item page's Collection picker fills in after the page paints; measure once it has.
          if (name === 'artifact' || name === 'record') await expect(page.getByRole('region', { name: 'Collections' }).getByRole('combobox')).toBeVisible();
          const where = `${vibe}/${theme} ${name} ${width}px`;
          await expectNoSideways(page, where);
          if (width === 390) expect(await shortControls(page, 3), where).toEqual([]);
          if (name === 'artifact') {
            const title = (await page.locator('h1').first().boundingBox())!;
            const viewer = (await page.locator('.viewer').boundingBox())!;
            expect(viewer.y - title.y, `${where}: the content starts right under the title`).toBeLessThan(width < 768 ? 170 : 130);
          }
          const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).exclude('iframe.sl-frame').analyze();
          expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`), where).toEqual([]);
          await page.screenshot({ path: `${SCREENS}/${vibe}-${theme}-${name}-${width}.png`, fullPage: true });
          if (process.env.PW_VISUAL) {
            await expect(page).toHaveScreenshot(`${vibe}-${theme}-${name}-${width}.png`, { fullPage: true, mask: [page.locator('iframe.sl-frame'), page.locator('.sl-readout, .sl-dateline, .sl-greeting')] });
          }
        }
        await context.close();
      }
      // The global constraint is no sideways scroll from 390 to 1920: the widths between and beyond, measured only (axe ran above).
      for (const width of [768, 1024, 1920]) {
        const context = await browser.newContext({ viewport: { width, height: 900 } });
        const page = await context.newPage();
        await useAppearance(context, vibe, theme);
        await page.clock.setFixedTime(new Date('2026-10-11T12:00:00'));
        for (const [name, path] of paths) {
          await page.goto(path);
          await expect(page.locator('h1').first()).toBeVisible();
          await expect(page.locator('[role="status"]', { hasText: /^(Loading…|Connecting…|Looking for related work…)$/ })).toHaveCount(0);
          await expectNoSideways(page, `${vibe}/${theme} ${name} ${width}px`);
        }
        await context.close();
      }
    });
  }
}

// Paper's strong time-of-day tints the page by the hour: the same checks at dusk and at night, in the theme that tints most.
for (const [phase, time] of [['dusk', '2026-10-11T18:10:00'], ['night', '2026-10-11T23:30:00']] as const) {
  test(`paper light at ${phase}: accessible`, async ({ browser }) => {
    test.setTimeout(120_000);
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await useAppearance(context, 'paper', 'light');
    await page.clock.setFixedTime(new Date(time));
    for (const [name, path] of paths) {
      await page.goto(path);
      await expect(page.locator('h1').first()).toBeVisible();
      await expect(page.locator('[role="status"]', { hasText: /^(Loading…|Connecting…|Looking for related work…)$/ })).toHaveCount(0);
      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).exclude('iframe.sl-frame').analyze();
      expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`), `paper/light ${phase} ${name}`).toEqual([]);
    }
    await context.close();
  });
}

// Daylight puts the home band and the sign-in panel on the Sky: Light chosen after dark keeps a night sky.
// The same checks at dusk and at night, with the sign-in error showing (dev mode has no sign-in service).
for (const [phase, time] of [['dusk', '2026-10-11T18:10:00'], ['night', '2026-10-11T23:30:00']] as const) {
  test(`daylight light at ${phase}: the sky stays legible`, async ({ browser }) => {
    test.setTimeout(120_000);
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await useAppearance(context, 'daylight', 'light');
    await page.clock.setFixedTime(new Date(time));
    const axe = async (where: string) => {
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`), `daylight/light ${phase} ${where}`).toEqual([]);
    };
    /** The focus ring of what has focus, against what it sits on: the sky's ink straight on the Sky, the page's text on a surface. */
    const ringIs = async (want: 'sky' | 'surface') => page.evaluate((w) => {
      const el = document.activeElement as HTMLElement;
      const ref = w === 'sky' ? el.closest('.vk-sky')! : el.closest('.searchbar, .sl-signin')!;
      return getComputedStyle(el).outlineColor === getComputedStyle(ref).color && getComputedStyle(el).outlineStyle !== 'none';
    }, want);

    /**
     * The text's contrast with the opaque surface it sits on (axe reports text over the Sky's gradient as "incomplete",
     * not a violation, so it cannot catch this): the surface must be opaque, and the pair at least 4.5:1.
     */
    const onSurface = (text: string, surface: string) => page.evaluate(([t, s]) => {
      const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number);
      const lum = (c: string) => { const [r, g, b] = rgb(c).map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!; };
      const fg = getComputedStyle(document.querySelector(t)!).color;
      const bg = getComputedStyle(document.querySelector(s)!).backgroundColor;
      const alpha = rgb(bg)[3] ?? 1;
      const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a);
      return { opaque: alpha === 1, ratio: (hi! + 0.05) / (lo! + 0.05) };
    }, [text, surface] as const);

    await page.goto('/');
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(page.locator('.vk-sky')).toHaveAttribute('data-phase', phase);
    await expect(page.locator('[role="status"]', { hasText: /^(Loading…|Connecting…)$/ })).toHaveCount(0);
    await axe('home');
    await page.locator('.vk-sky').getByRole('link', { name: 'Upload' }).focus();
    await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab');   // keyboard focus, so :focus-visible applies
    expect(await ringIs('sky'), 'Upload: the ring is the sky ink').toBe(true);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('searchbox', { name: 'Search the library' })).toBeFocused();
    expect(await ringIs('surface'), 'search: the ring is the page text').toBe(true);
    await page.keyboard.type('typed words');
    const ink = await page.getByRole('searchbox').evaluate((el) => [getComputedStyle(el).color, getComputedStyle(el.closest('.searchbar')!).color]);
    expect(ink[0], 'typed text is the page text, not the sky ink').toBe(ink[1]);
    const typed = await onSurface('.vk-sky .searchbar input', '.vk-sky .searchbar');
    expect(typed.opaque && typed.ratio >= 4.5, `typed text on the pill: ${typed.ratio.toFixed(2)}:1`).toBe(true);
    await page.screenshot({ path: `${SCREENS}/daylight-light-${phase}-home.png` });

    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Superlibrary', level: 1 })).toBeVisible();
    await expect(page.locator('.vk-sky')).toHaveAttribute('data-phase', phase);
    await axe('login');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toHaveText('This deployment has no sign-in service configured.');
    await axe('login with an error');
    for (const t of ['.sl-signin h1', '.sl-signin p', '.sl-signin .error']) {
      const c = await onSurface(t, '.sl-signin');
      expect(c.opaque && c.ratio >= 4.5, `${t} on the sign-in panel: ${c.ratio.toFixed(2)}:1, opaque ${c.opaque}`).toBe(true);
    }
    await page.screenshot({ path: `${SCREENS}/daylight-light-${phase}-login.png` });
    await context.close();
  });
}
