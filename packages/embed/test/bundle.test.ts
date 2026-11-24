// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
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

/** Treaty's record of the embed (ruling 7: the embed stays SuperLibrary's artifact; treaty notes its version and hash). */
interface ArtifactRecord { artifact: string; version: string; files: Record<string, string> }
const recorded: ArtifactRecord = createRequire(import.meta.url)('@superjackfruitlabs/treaty-contracts/data/contracts/artifacts/superlibrary-embed.json');
const pkg: { version: string } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const { version } = pkg;
const parts = (v: string) => v.split('.').map(Number);
const newer = (a: string, b: string) => {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
};
const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');

describe("the bundle against treaty's record of it (superlibrary.api, ruling 7)", () => {
  it('at the version treaty records, builds byte for byte to the recorded hashes; a change ships under a newer version', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'embed-record-'));
    await build({ root, configFile: join(root, 'vite.bundle.config.ts'), logLevel: 'silent', build: { outDir, emptyOutDir: true } });
    // What `pnpm bundle` writes: the module, and the pinned public types copied beside it.
    const built: Record<string, string> = {
      'superlibrary-embed.js': sha256(readFileSync(join(outDir, 'superlibrary-embed.js'))),
      'superlibrary-embed.d.ts': sha256(readFileSync(join(root, 'bundle', 'superlibrary-embed.d.ts'))),
    };
    expect(recorded.artifact).toBe('superlibrary-embed');
    // At the recorded version the bytes must be the recorded ones: changing the embed without a new
    // version would hand vendoring hosts different bytes under the same name. Bump the version in
    // package.json instead; treaty records the new hash when a host vendors it.
    const atRecorded = version === recorded.version;
    expect(atRecorded ? built : recorded.files).toEqual(recorded.files);
    expect(atRecorded || newer(version, recorded.version), `package.json's ${version} is older than treaty's recorded ${recorded.version}`).toBe(true);
  }, 60_000);
});
