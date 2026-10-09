import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Every file of the app's source, tests left out (they may name what they forbid). */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sources(p);
    return /\.(ts|svelte)$/.test(name) && !/\.test\.ts$/.test(name) ? [p] : [];
  });
}

describe('the app asks in the page, never through the browser', () => {
  it('no confirm(), prompt() or alert() anywhere in src', () => {
    const files = sources(join(import.meta.dirname, '..'));
    expect(files.some((f) => f.endsWith('ItemView.svelte'))).toBe(true);
    const offenders = files.filter((f) => /(^|[^.\w])(window\.)?(confirm|prompt|alert)\s*\(/m.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
