// apps/web/src/lib/kit/kit.test.ts
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OUTCOMES } from '@superlibrary/contract';
import { OUTCOME_ORDER, OUTCOME_WORDS, outcomeVar } from './outcome';

const src = join(import.meta.dirname, '..', '..');
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? files(p) : [p]; });
}
describe('the kit reads tokens only (a working direction: a change must be a token edit)', () => {
  it('no colour or font literal anywhere in the app: lib/vibe/superlibrary.css is the one product source', () => {
    // Task 5 deletes tokens.css, suite.generated.ts, ParentMark.svelte; Task 5 rewrites SuiteSwitcher.svelte.
    const exempt = new Set(['superlibrary.css', 'tokens.css', 'suite.generated.ts', 'ParentMark.svelte', 'SuiteSwitcher.svelte']);
    const scanned = files(src).filter((f) => /\.(css|svelte|ts)$/.test(f) && !/\.test\.ts$/.test(f) && !exempt.has(f.split('/').at(-1)!));
    expect(scanned.some((f) => f.endsWith('kit.css'))).toBe(true);
    const offenders = scanned.flatMap((f) => {
      const text = readFileSync(f, 'utf8');
      const hits = [...text.matchAll(/#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\b(?![\w-])|rgba?\(|hsla?\(|font-family:\s*(?!\s|var\()|font:[^;}]*['"]|font:[^;}]*\b(?:Inter|Arial|Helvetica|Georgia|Roboto|serif|sans-serif|monospace|system-ui)\b|'IBM Plex|--(?:color|accent|parent|product|outcome|type|space|radius|motion|focus|elevation)-[a-z]|var\(--tap\)|var\(--font-(?:sans|mono)\)/g)].map((m) => m[0]);
      return hits.length ? [`${f}: ${hits.join(', ')}`] : [];
    });
    expect(offenders).toEqual([]);
  });
  it('a primary or danger button keeps its own background on hover (a hover must never leave 1:1 text)', () => {
    const kit = readFileSync(join(import.meta.dirname, 'kit.css'), 'utf8');
    const rule = (v: string) => kit.split('\n').find((l) => l.startsWith(`.kit-button--${v},`) && l.includes(`.kit-button--${v}:hover`));
    expect(rule('primary')).toMatch(/background: var\(--vk-color-primary\)/);
    expect(rule('danger')).toMatch(/background: var\(--vk-color-surface\)/);
    expect(rule('danger')).toMatch(/color: var\(--sl-danger\)/);
  });
  it('the bare button rule leaves vibekit-classed buttons alone (an unlayered rule would beat the layered Segmented)', () => {
    const app = readFileSync(join(src, 'app.css'), 'utf8');
    const rules = app.split('\n').filter((l) => /^button[^{]*\{/.test(l) && (l.includes('background') || l.includes('font:')));
    expect(rules.length).toBeGreaterThan(0);
    for (const l of rules) {
      for (const sel of l.slice(0, l.indexOf('{')).split(',').map((s) => s.trim()).filter((s) => s.startsWith('button'))) {
        expect(sel, l).toContain(':not([class*="vk-"])');
      }
    }
  });
  it('every outcome has a word, a place, and a token', () => {
    expect(Object.keys(OUTCOME_WORDS).sort()).toEqual([...OUTCOMES].sort());
    expect([...OUTCOME_ORDER].sort()).toEqual([...OUTCOMES].sort());
    expect(outcomeVar('rejected')).toBe('var(--sl-outcome-rejected)');
  });
  it('the embed in the app takes the vibe’s colours and type', () => {
    const kit = readFileSync(join(import.meta.dirname, 'kit.css'), 'utf8');
    for (const n of ['bg', 'fg', 'muted', 'line', 'hover', 'accent', 'accent-content', 'danger']) {
      expect(kit, n).toMatch(new RegExp(`--sl-host-${n}: var\\(--(?:vk|sl)-`));
      expect(kit, `${n}-dark`).toMatch(new RegExp(`--sl-host-${n}-dark: var\\(--(?:vk|sl)-`));
    }
    expect(kit).toContain('--sl-host-font: var(--vk-font-body);');
  });
});
