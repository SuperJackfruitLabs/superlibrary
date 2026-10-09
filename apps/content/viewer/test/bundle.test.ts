import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The built bundle (`pnpm test` builds it first). Vitest runs from apps/content.
const dist = resolve('viewer-dist/_viewer');
const main = readFileSync(resolve(dist, 'viewer.js'), 'utf8');
const expiredJs = readFileSync(resolve(dist, 'expired.js'), 'utf8');
const chunks = readdirSync(resolve(dist, 'chunks')).map((f) => [f, readFileSync(resolve(dist, 'chunks', f), 'utf8')] as const);

describe('the built viewer bundle', () => {
  it('runs nothing the CSP refuses on every view: no eval or Function probe, no WebAssembly (plan D3)', () => {
    // Even a caught probe (zod's JIT check, `try { Function('') }`) is a CSP violation report on every load.
    expect(main).not.toMatch(/(?<![\w.$])eval\(|(?<![\w.$])(new\s+)?Function\(/);
    expect(main).not.toMatch(/WebAssembly\.(Module|Instance|instantiate|compile)/);
  });

  it('Mermaid, viz.js and pdf.js are lazy chunks, not in the entry (ruling T13)', () => {
    for (const marker of ['flowchart-v2', 'renderSVGElement', 'Emscripten', 'PDFWorker', 'GlobalWorkerOptions']) expect(main).not.toContain(marker);
    const has = (re: RegExp) => chunks.some(([f]) => re.test(f));
    expect(has(/^mermaid\.core-/)).toBe(true);
    expect(has(/^full\.render-/)).toBe(true);
    expect(has(/^pdf\.worker-/)).toBe(true);
  });

  it('no chunk instantiates WebAssembly except pdf.js’s JPX decoder, which the CSP refuses (D4: viz.js is asm.js)', () => {
    const wasm = chunks.filter(([, s]) => /new WebAssembly\.Module\(/.test(s)).map(([f]) => f.replace(/-[\w-]+\.js$/, ''));
    expect(wasm).toEqual(['pdf.worker']);
  });

  it('the expired page has its own small entry that imports nothing and runs nothing the CSP refuses (PR 3 review)', () => {
    expect(expiredJs.length).toBeLessThan(2000);
    expect(expiredJs).not.toMatch(/\bimport\b/);
    expect(expiredJs).toContain('superlibrary:expired');
    expect(expiredJs).not.toMatch(/(?<![\w.$])eval\(|(?<![\w.$])(new\s+)?Function\(/);
  });

  it('only the entries have fixed names; every chunk name carries a content hash (PR 3 review)', () => {
    expect(readdirSync(dist).sort()).toEqual(['chunks', 'expired.js', 'viewer.css', 'viewer.js']);
    for (const [f] of chunks) expect(f, f).toMatch(/-[\w-]{8,}\.js$/);
  });
});

