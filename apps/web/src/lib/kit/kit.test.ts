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
  it('no colour or font literal anywhere in the app: design/tokens.toml is the one source', () => {
    const generated = new Set(['tokens.css', 'suite.generated.ts']);
    const scanned = files(src).filter((f) => /\.(css|svelte|ts)$/.test(f) && !/\.test\.ts$/.test(f) && !generated.has(f.split('/').at(-1)!));
    expect(scanned.some((f) => f.endsWith('kit.css'))).toBe(true);
    const offenders = scanned.flatMap((f) => {
      const text = readFileSync(f, 'utf8');
      const hits = [...text.matchAll(/#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\b(?![\w-])|rgba?\(|hsla?\(|font-family:\s*(?!\s|var\()|'IBM Plex/g)].map((m) => m[0]);
      return hits.length ? [`${f}: ${hits.join(', ')}`] : [];
    });
    expect(offenders).toEqual([]);
  });
  it('every outcome has a word, a place, and a token', () => {
    expect(Object.keys(OUTCOME_WORDS).sort()).toEqual([...OUTCOMES].sort());
    expect([...OUTCOME_ORDER].sort()).toEqual([...OUTCOMES].sort());
    expect(outcomeVar('rejected')).toBe('var(--outcome-rejected)');
  });
  it('the embed in the app takes the suite colours and face', () => {
    const kit = readFileSync(join(import.meta.dirname, 'kit.css'), 'utf8');
    for (const n of ['bg', 'fg', 'muted', 'line', 'hover', 'accent', 'accent-content', 'danger']) {
      expect(kit, n).toMatch(new RegExp(`--sl-host-${n}: var\\(--`));
      expect(kit, `${n}-dark`).toMatch(new RegExp(`--sl-host-${n}-dark: var\\(--`));
    }
    expect(kit).toContain('--sl-host-font: var(--font-sans);');
  });
});
