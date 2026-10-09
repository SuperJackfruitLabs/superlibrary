// apps/web/src/lib/kit/tokens.test.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OUTCOMES } from '@superlibrary/contract';
import { contrast, renderSuite, renderTokens } from '../../../../../scripts/tokens.mjs';

const REPO = join(import.meta.dirname, '..', '..', '..', '..', '..');
const source = readFileSync(join(REPO, 'design', 'tokens.toml'), 'utf8');
const css = readFileSync(join(import.meta.dirname, 'tokens.css'), 'utf8');

describe('the token layer (operator direction A)', () => {
  it('tokens.css and suite.generated.ts are exactly what design/tokens.toml generates (run pnpm tokens)', () => {
    expect(css).toBe(renderTokens(source));
    expect(readFileSync(join(import.meta.dirname, 'suite.generated.ts'), 'utf8')).toBe(renderSuite(source));
  });
  it('keeps the layers: the suite reads the product; the parent is Ink, neutral, with no accent', () => {
    expect(css).toContain('--color-accent: var(--accent);');
    for (const n of ['--accent:', '--accent-content:', '--accent-soft:', '--accent-mark:']) expect(css, n).toContain(n);
    for (const [k, v] of [['ink', '#121722'], ['slate', '#3a4252'], ['mist', '#8a93a3'], ['paper', '#f5f6f8'], ['tile', '#121722'], ['tile-dark', '#1c2430'], ['mark', '#f5f6f8'], ['mark-dark', '#e6e9ee']]) {
      expect(css, k).toContain(`--parent-${k}: ${v};`);
    }
    expect(css).not.toMatch(/--parent-accent/);
    expect(() => renderTokens(source.replace('[parent.color]', '[parent.color]\naccent = { value = "#ff0000" }'))).toThrow(/no accent/);
  });
  it('colour belongs to products: each accent, for the switcher, at 3:1 on the ink tile', () => {
    for (const [k, v] of [['agentpod', '#5fb3d4'], ['superpipeline', '#f4a526'], ['superwitness', '#3fd0a2'], ['supermessage', '#9d8ff0'], ['superlibrary', '#ff7a59']]) {
      expect(css, k).toContain(`--product-${k}-accent: ${v};`);
    }
    expect(() => renderTokens(source.replace('accent = "#5fb3d4"', 'accent = "#1c2430"'))).toThrow(/agentpod .*tile/);
  });
  it('Plex only: IBM Plex Sans for words, IBM Plex Mono for code and data', () => {
    expect(css).toMatch(/--font-sans: 'IBM Plex Sans', /);
    expect(css).toMatch(/--font-mono: 'IBM Plex Mono', /);
    expect(css.match(/--font-[a-z]+:/g)).toEqual(['--font-sans:', '--font-mono:']);
  });
  it('every outcome has a colour in both themes, and the accent is coral', () => {
    for (const o of OUTCOMES) expect(css.match(new RegExp(`--outcome-${o}:`, 'g'))?.length, o).toBe(3);   // :root, dark media, [data-theme=dark]
    expect(css).toContain('--accent: #ff7a59;');
  });
  it('a colour that misses its contrast fails the build, naming it', () => {
    const bad = source.replace('content-faint = { value = "#6b6b70"', 'content-faint = { value = "#c0c0c4"');
    expect(() => renderTokens(bad)).toThrow(/content-faint .*surface.* needs 4\.5/);
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 1);
  });
});
