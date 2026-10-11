import AxeBuilder from '@axe-core/playwright';
import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { devWorkspace, expectNoSideways, seedWorkRecordLocal, shortControls, uploadViaApi } from './helpers';
import { VIBES_E2E, seedCollection, useAppearance } from './vibes';

/** Every key screen in every vibe and theme: accessible, no sideways scroll, 44px targets, a screenshot to look at. Chromium only (playwright.config.ts). */
const THEMES = ['light', 'dark'] as const;
const SCREENS = 'vibe-screens';
let paths: Array<[string, string]> = [];

test.beforeAll(async ({ request }) => {
  const ws = await devWorkspace(request);
  const art = await uploadViaApi(request, [{ path: 'v.md', body: '# Vibe check\n\nA paragraph.' }], { title: 'Vibe check artifact' });
  const rec = seedWorkRecordLocal({ ws, title: 'Vibe check record', text: 'vibe check', outcome: 'approved' });
  // The longest outcome words, so the library's table and tiles are measured with them.
  seedWorkRecordLocal({ ws, title: 'Vibe check superseded', text: 'vibe check', outcome: 'superseded' });
  seedWorkRecordLocal({ ws, title: 'Vibe check in progress', text: 'vibe check', outcome: 'in-progress' });
  const col = await seedCollection(request, `Vibe check ${Date.now()}`, art.itemId);
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
