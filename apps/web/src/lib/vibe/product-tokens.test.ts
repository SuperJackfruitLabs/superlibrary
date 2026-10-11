import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OUTCOMES } from '@superlibrary/contract';
import { THEMES, VIBES, contrastRatio } from '@superjackfruit/vibekit';

const require = createRequire(import.meta.url);
const vk = readFileSync(require.resolve('@superjackfruit/vibekit/tokens.css'), 'utf8');
const sl = readFileSync(join(import.meta.dirname, 'superlibrary.css'), 'utf8');

/** The body of the first rule whose selector is exactly `selector`. */
function block(css: string, selector: string): string {
  const i = css.indexOf(`${selector} {`);
  if (i < 0) throw new Error(`no block for ${selector}`);
  return css.slice(i, css.indexOf('}', i));
}
/** A `#rrggbb` or `#rgb` colour, returned as lower-case `#rrggbb`. */
function hex(body: string, name: string): string {
  const m = new RegExp(`--${name}:\\s*#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\\b`).exec(body);
  if (!m) throw new Error(`--${name} is not a three- or six-digit hex colour here`);
  const h = m[1]!.toLowerCase();
  return `#${h.length === 3 ? [...h].map((c) => c + c).join('') : h}`;
}
const PRODUCT = { light: block(sl, ':root, [data-theme="light"]'), dark: block(sl, '[data-theme="dark"]') } as const;
const TEXT = [...OUTCOMES.map((o) => `sl-outcome-${o}`), 'sl-danger'];

describe('Superlibrary tokens, built on vibekit', () => {
  for (const vibe of VIBES) {
    for (const theme of THEMES) {
      const look = () => block(vk, `[data-vibe="${vibe}"][data-theme="${theme}"]`);
      it(`${vibe} ${theme}: every outcome and danger reads at 4.5:1 on bg, surface and raised`, () => {
        const grounds = ['bg', 'surface', 'raised'].map((g) => [g, hex(look(), `vk-color-${g}`)] as const);
        const short = TEXT.flatMap((n) =>
          grounds.map(([g, ground]) => ({ n, g, r: contrastRatio(hex(PRODUCT[theme], n), ground) })),
        ).filter((x) => x.r < 4.5).map((x) => `${x.n} on ${x.g}: ${x.r.toFixed(2)}`);
        expect(short).toEqual([]);
      });
      it(`${vibe} ${theme}: the mark is 3:1 on the page and on the product chip`, () => {
        const mark = hex(look(), 'vk-product-superlibrary-fg');
        expect(contrastRatio(mark, hex(look(), 'vk-color-bg'))).toBeGreaterThanOrEqual(3);
        expect(contrastRatio(mark, hex(look(), 'vk-product-superlibrary-bg'))).toBeGreaterThanOrEqual(3);
      });
    }
  }

  it('defines each token in both themes, and the mark from vibekit', () => {
    for (const n of [...TEXT, 'sl-scrim', 'sl-shadow-overlay']) {
      expect(PRODUCT.light, n).toContain(`--${n}:`);
      expect(PRODUCT.dark, n).toContain(`--${n}:`);
    }
    expect(sl).toContain('--sl-mark: var(--vk-product-superlibrary-fg);');
  });
});
