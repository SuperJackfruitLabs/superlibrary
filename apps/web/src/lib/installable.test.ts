/**
 * The app can be installed to a phone's home screen, and its tab shows the mark.
 *
 * These are declarations no screen shows when they break: a manifest missing `display` or a 512px
 * icon is just not offered for install, and an apple-touch-icon with a transparent background turns
 * black on iOS. So they are checked here, from the files that ship. That they are served to anyone,
 * signed in or not, with the manifest's media type, is e2e/installable.spec.ts.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const WEB = join(__dirname, '..', '..');
const STATIC = join(WEB, 'static');
const html = readFileSync(join(WEB, 'src', 'app.html'), 'utf8');

/** Width, height, and colour type from a PNG's IHDR chunk. Colour types 4 and 6 carry alpha. */
function png(b: Buffer): { width: number; height: number; alpha: boolean } {
  expect(b.subarray(1, 4).toString('latin1')).toBe('PNG');
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), alpha: b[25] === 4 || b[25] === 6 };
}

interface Manifest {
  name?: string; short_name?: string; start_url?: string; scope?: string; display?: string;
  background_color?: string; theme_color?: string;
  icons?: { src: string; sizes: string; type: string; purpose?: string }[];
}
const manifest = () => JSON.parse(readFileSync(join(STATIC, 'manifest.webmanifest'), 'utf8')) as Manifest;

describe('installable', () => {
  it('app.html links the favicons, the manifest and the iOS home-screen tags', () => {
    expect(html).toContain('<link rel="icon" href="/favicon.ico" sizes="any" />');
    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/brand/favicon.svg" />');
    for (const n of [16, 32, 48]) expect(html).toContain(`<link rel="icon" type="image/png" sizes="${n}x${n}" href="/brand/favicon-${n}.png" />`);
    expect(html).toContain('<meta property="og:image" content="https://app.superlibrary.dev/brand/og.png" />');
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
    expect(html).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />');
    expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes" />');
    expect(html).toContain('<meta name="apple-mobile-web-app-title" content="Superlibrary" />');
    expect(html).toMatch(/<meta name="theme-color" content="#[0-9a-f]{6}" media="\(prefers-color-scheme: dark\)" \/>/);
    expect(html).toMatch(/<meta name="theme-color" content="#[0-9a-f]{6}" media="\(prefers-color-scheme: light\)" \/>/);
  });

  it('registers no service worker: nothing is cached offline', () => {
    expect(html).not.toMatch(/serviceWorker/);
    for (const f of ['service-worker.ts', 'service-worker.js']) expect(existsSync(join(WEB, 'src', f))).toBe(false);
  });

  it('the manifest parses and names what an install needs', () => {
    const m = manifest();
    expect(m).toMatchObject({ name: 'Superlibrary', start_url: '/', scope: '/', display: 'standalone' });
    expect(m.short_name).toBeTruthy();
    expect(m.background_color).toMatch(/^#[0-9a-f]{6}$/);
    expect(m.theme_color).toMatch(/^#[0-9a-f]{6}$/);
    for (const [sizes, purpose] of [['192x192', 'any'], ['512x512', 'any'], ['192x192', 'maskable'], ['512x512', 'maskable']]) {
      expect(m.icons?.some((i) => i.sizes === sizes && (i.purpose ?? 'any') === purpose && i.type === 'image/png'), `${sizes} ${purpose}`).toBe(true);
    }
  });

  it('every icon file exists at the size it declares, with an opaque background', () => {
    const icons = [...(manifest().icons ?? []), { src: '/apple-touch-icon.png', sizes: '180x180' }];
    for (const { src, sizes } of icons) {
      const [width, height] = sizes.split('x').map(Number);
      const file = join(STATIC, src.replace(/^\//, ''));
      expect(existsSync(file), src).toBe(true);
      expect(png(readFileSync(file)), src).toEqual({ width, height, alpha: false });
    }
  });

  it('favicon.ico holds 16, 32 and 48px images; the icons are the translucent-v2 coral mark, copied unchanged from the pack', () => {
    const ico = readFileSync(join(STATIC, 'favicon.ico'));
    expect(ico.readUInt16LE(2)).toBe(1); // type 1: icon
    const count = ico.readUInt16LE(4);
    const sizes = Array.from({ length: count }, (_, i) => ico[6 + i * 16] || 256).sort((a, b) => a - b);
    expect(sizes).toEqual([16, 32, 48]);
    const svg = readFileSync(join(STATIC, 'brand', 'favicon.svg'), 'utf8');
    expect(svg).toContain('aria-label="Superlibrary favicon"');
    expect(svg).toContain('#FC744B');   // the pack's coral gradient
    for (const n of [16, 32, 48]) expect(png(readFileSync(join(STATIC, 'brand', `favicon-${n}.png`))).width).toBe(n);
    expect(readFileSync(join(STATIC, 'brand', 'README.md'), 'utf8')).toContain('translucent-v2, 2026-10-14');
  });

  it('leaves no file of the old mark behind', () => {
    for (const f of ['favicon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png']) expect(existsSync(join(STATIC, f)), f).toBe(false);
    expect(existsSync(join(WEB, 'scripts', 'render-icons.sh'))).toBe(false);
    expect(readFileSync(join(WEB, 'src', 'lib', 'Mark.svelte'), 'utf8')).not.toContain('rotate(-20');   // the old three spines
  });

  it('the link preview image is 1200x630', () => {
    expect(png(readFileSync(join(STATIC, 'brand', 'og.png')))).toMatchObject({ width: 1200, height: 630 });
  });

  it('Cloudflare is told the manifest and favicon.ico media types', () => {
    const headers = readFileSync(join(STATIC, '_headers'), 'utf8');
    expect(headers).toMatch(/\/manifest\.webmanifest\n\s+Content-Type: application\/manifest\+json/);
    expect(headers).toMatch(/\/favicon\.ico\n\s+Content-Type: image\/x-icon/);
  });
});
