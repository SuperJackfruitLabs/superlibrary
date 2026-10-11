import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HEAD_SCRIPT } from '@superjackfruit/vibekit';

const html = readFileSync(join(import.meta.dirname, '..', '..', 'app.html'), 'utf8');

describe('app.html paints the vibe before anything else', () => {
  it('holds vibekit’s head script verbatim (run `node apps/web/scripts/sync-head-script.mjs` after a vibekit update)', () => {
    expect(html).toContain(`<script>${HEAD_SCRIPT}</script>`);
  });
  it('the script comes before SvelteKit’s head and any stylesheet', () => {
    const at = html.indexOf(`<script>${HEAD_SCRIPT}</script>`);
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(html.indexOf('%sveltekit.head%'));
    const sheet = html.indexOf('rel="stylesheet"');
    if (sheet > -1) expect(at).toBeLessThan(sheet);
  });
  it('the retired theme script and Google Fonts are gone', () => {
    expect(html).not.toContain("localStorage.getItem('superlibrary:theme')");
    expect(html).not.toContain('fonts.googleapis.com');
  });
});
