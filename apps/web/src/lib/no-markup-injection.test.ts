// apps/web/src/lib/no-markup-injection.test.ts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sources(p);
    return /\.(ts|svelte)$/.test(name) && !/\.test\.ts$/.test(name) ? [p] : [];
  });
}

describe('text is rendered as text (agent-written titles, snippets, comments, handoffs)', () => {
  it('no {@html} and no innerHTML in the app', () => {
    const files = sources(join(import.meta.dirname, '..'));
    expect(files.some((f) => f.endsWith('ItemView.svelte'))).toBe(true);
    const offenders = files.filter((f) => /\{@html\b|\.innerHTML\s*=|outerHTML\s*=|insertAdjacentHTML/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
