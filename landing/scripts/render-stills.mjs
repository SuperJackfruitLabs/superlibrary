// Renders the catalogue band's stills, one WebP per sun phase, into public/catalogue/. They are
// what reduced motion and no-WebGL visitors see, and what shows while the scene loads.
//
// Usage: node scripts/render-stills.mjs [base-url]   (default: http://127.0.0.1:4337/, `npm run dev`)
// Playwright is not a landing dependency: run it where `playwright` resolves (frontdoor's repo has
// it), and with Chrome installed. It opens the page with ?catalogue-still, which exposes a hook
// (src/scripts/catalogue/band.js) that draws the settled scene at 1.5x and returns a WebP.
import fs from 'node:fs';
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://127.0.0.1:4337/';
const out = new URL('../public/catalogue/', import.meta.url).pathname;
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ channel: 'chrome', args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
await p.goto(new URL('?catalogue-still', base).href, { waitUntil: 'load' });
await p.waitForFunction(() => window.__catalogueStill);
for (const phase of ['dawn', 'morning', 'noon', 'golden', 'dusk', 'night']) {
  const url = await p.evaluate((ph) => window.__catalogueStill(ph), phase);
  const buf = Buffer.from(url.split(',')[1], 'base64');
  fs.writeFileSync(`${out}${phase}.webp`, buf);
  console.log(`${phase}.webp ${(buf.length / 1024).toFixed(1)} KB`);
}
await b.close();
