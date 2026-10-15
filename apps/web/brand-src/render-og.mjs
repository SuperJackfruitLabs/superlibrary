// Renders static/brand/og.png (1200x630) from og.html with the Chromium Playwright already installs.
// Run from the repository root: node apps/web/brand-src/render-og.mjs
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const here = fileURLToPath(new URL('.', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(`file://${join(here, 'og.html')}`);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: join(here, '..', 'static', 'brand', 'og.png') });
await browser.close();
