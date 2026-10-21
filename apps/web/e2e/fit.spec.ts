/**
 * Fit (catch-up S6, S8, S12): with the committed seed's awkward data (a 199-character title, a
 * 120-character word with no break, `{{y}}`, `<script>`, Arabic, a 140-character nested file name,
 * 41 versions, 205 collections), at 360/390/1100/1280/1440 in every vibe: nothing scrolls sideways,
 * no text runs past its box, the page keeps 16 px gutters (header included), table cells do not
 * collide, and every tap target is at least 44 px (checkboxes included).
 */
import { expect, test, type Page } from '@playwright/test';
import { seedCatchUp, type Seed } from './seed';
import { VIBES_E2E, openEnclosures, useAppearance, waitForScreen } from './vibes';

let seed: Seed;
test.beforeAll(async ({ request }) => { test.setTimeout(600_000); seed = await seedCatchUp(request); });

const WIDTHS = [360, 390, 1100, 1280, 1440] as const;
const routes = () => [
  ['library', '/'], ['collections', '/collections'], ['collection', `/collections/${seed.collection}`], ['outcomes', '/outcomes'],
  ['long title', `/a/${seed.longTitle}`], ['long word', `/a/${seed.longWord}`], ['nested file', `/a/${seed.nested}`], ['arabic', `/a/${seed.arabic}`], ['41 versions', `/a/${seed.many}`],
] as const;

/** Everything a layout can get wrong with long text, measured in the page. */
async function misfits(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const d = document.documentElement;
    if (d.scrollWidth > d.clientWidth) out.push(`page scrolls sideways by ${d.scrollWidth - d.clientWidth}px`);
    const W = d.clientWidth;
    const name = (el: Element) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''} "${(el.textContent ?? '').trim().slice(0, 30)}"`;
    const visible = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('.visually-hidden, [hidden], .sl-skip'); };
    // Gutters: nothing a person reads or taps sits closer than 16 px to either edge (a phone's thumb, a notch).
    const edge = W < 700 ? 16 : 0;
    for (const el of document.querySelectorAll('header a, header button, main h1, main h2, main p, main a, main button, main td, main li, main dd, main label')) {
      if (!visible(el) || el.closest('iframe, .sl-embed, table.sl-table--scroll, .kit-tabs, [data-scroll-x]')) continue;
      const r = el.getBoundingClientRect();
      if (r.right > W + 0.5) out.push(`${name(el)} runs past the screen (${Math.round(r.right)} > ${W})`);
      else if (edge && (r.left < edge - 0.5 || r.right > W - edge + 0.5) && el.children.length === 0) out.push(`${name(el)} is ${Math.round(Math.min(r.left, W - r.right))}px from the edge`);
    }
    // Text past its own container: titles, headings, file names, tags.
    for (const el of document.querySelectorAll('main h1, main h2, main .title, main .result-title, main code, main td, main dd, main .sl-tag, main .tag')) {
      if (!visible(el)) continue;
      let parent = el.parentElement!;
      while (parent.parentElement && getComputedStyle(parent).display === 'contents') parent = parent.parentElement;
      const p = parent.getBoundingClientRect();
      if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === 'visible') out.push(`${name(el)} overflows itself by ${el.scrollWidth - el.clientWidth}px`);
      const r = el.getBoundingClientRect();
      if (r.right > p.right + 1 && getComputedStyle(parent).overflowX === 'visible') out.push(`${name(el)} runs past its container by ${Math.round(r.right - p.right)}px`);
    }
    // Table cells in one row never overlap.
    for (const tr of document.querySelectorAll('main tr')) {
      const cells = [...tr.children].filter(visible).map((c) => c.getBoundingClientRect());
      for (let i = 1; i < cells.length; i++) {
        const a = cells[i - 1]!, b = cells[i]!;
        const sameLine = Math.abs(a.top - b.top) < 2;
        if (sameLine && a.right > b.left + 1) { out.push(`cells collide in ${name(tr)}`); break; }
      }
    }
    return out;
  });
}

/** Tap targets under 44 px; a checkbox or radio is measured by itself and by the label that takes its tap, whichever is larger. */
async function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, summary')) {
      const st = getComputedStyle(el);
      const r0 = el.getBoundingClientRect();
      if (r0.width === 0 || r0.height === 0 || st.visibility === 'hidden' || el.closest('[hidden], .visually-hidden, .sl-skip, iframe, .sl-embed')) continue;
      const p = el.tagName === 'A' ? el.closest('p, dd, small, li') : null;
      if (p && p.textContent!.trim() !== el.textContent!.trim()) continue; // a link inside a sentence (WCAG 2.5.8 inline)
      const box = el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio') ? (el.closest('label') ?? el) : el;
      const r = box.getBoundingClientRect();
      if (r.height < 43.5) out.push(`${el.tagName.toLowerCase()}${el instanceof HTMLInputElement ? `[${el.type}]` : ''} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30)}" ${r.height.toFixed(0)}px`);
    }
    return out;
  });
}

for (const vibe of VIBES_E2E) {
  test(`${vibe}: long titles, words and file names fit at every width; gutters, cells and tap targets hold`, async ({ browser }) => {
    test.setTimeout(420_000);
    const problems: string[] = [];
    for (const width of WIDTHS) {
      const phone = width < 500;
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, ...(phone ? { isMobile: true, hasTouch: true } : {}) });
      await useAppearance(ctx, vibe, 'light');
      const page = await ctx.newPage();
      for (const [label, url] of routes()) {
        await page.goto(url);
        await waitForScreen(page);
        if (label !== 'library' && label !== 'outcomes') await openEnclosures(page);
        for (const m of await misfits(page)) problems.push(`${width} ${label}: ${m}`);
        if (phone) for (const m of await smallTargets(page)) problems.push(`${width} ${label}: target ${m}`);
      }
      await ctx.close();
    }
    expect([...new Set(problems)]).toEqual([]);
  });
}
