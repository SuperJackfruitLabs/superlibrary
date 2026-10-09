// @vitest-environment node
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');

describe('the bundle for hosts outside this repository (decision O3)', () => {
  it('is one self-contained ES module that exports the SDK', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'embed-bundle-'));
    await build({ root, configFile: join(root, 'vite.bundle.config.ts'), logLevel: 'silent', build: { outDir, emptyOutDir: true } });
    const js = readFileSync(join(outDir, 'superlibrary-embed.js'), 'utf8');
    expect(js).not.toMatch(/^\s*import[\s{*]/m); // the contract is inlined: a host resolves nothing
    expect(js).not.toMatch(/^\s*export\s[^\n]*\bfrom\s*['"]/m);
    expect(js).toMatch(/export\s*\{[^}]*\bmountArtifact\b/);
    expect(js).toContain('allow-scripts allow-popups-to-escape-sandbox'); // the contract's sandbox, unchanged
    expect(Buffer.byteLength(js)).toBeLessThan(80_000); // zod is not dragged in
  }, 60_000);
});
