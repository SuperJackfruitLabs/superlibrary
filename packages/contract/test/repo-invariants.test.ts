import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const varOf = (file: string, name: string) => new RegExp(`"${name}":\\s*"([^"]*)"`).exec(read(file))?.[1] ?? null;

/** JSONC: comments outside strings and trailing commas removed, then JSON. */
function jsonc(file: string): Record<string, unknown> {
  const src = read(file)
    .replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (_, s: string | undefined) => s ?? '')
    .replace(/,(\s*[}\]])/g, '$1');
  return JSON.parse(src) as Record<string, unknown>;
}

function sources(dir: string): [string, string][] {
  return readdirSync(join(ROOT, dir)).flatMap((f): [string, string][] => {
    const p = join(dir, f);
    if (statSync(join(ROOT, p)).isDirectory()) return sources(p);
    return /\.(ts|js|css|html)$/.test(f) ? [[p, read(p)]] : [];
  });
}

describe('repository invariants', () => {
  it('the content Worker never writes R2 (plan D8: the binding cannot be made read-only)', () => {
    // Every file, at any depth: a helper in a subfolder writes R2 as surely as one at the top.
    const files = sources('apps/content/src');
    expect(files.map(([p]) => p)).toContain(join('apps/content/src', 'index.ts'));
    for (const [p, src] of files) {
      expect(src, p).not.toMatch(/\.\s*(put|delete|createMultipartUpload|resumeMultipartUpload)\s*\(/);
    }
    expect(read('apps/content/src/index.ts')).toContain(`export type ReadOnlyBucket = Pick<R2Bucket, 'get' | 'head'>;`);
  });

  it('the hosts allowed to frame the content origin are the app plus exactly the hosts allowed to mint embeds', () => {
    const frame = varOf('apps/content/wrangler.jsonc', 'FRAME_ANCESTORS')!.split(/\s+/).sort();
    const minted = [varOf('apps/api/wrangler.jsonc', 'APP_URL')!, ...varOf('apps/api/wrangler.jsonc', 'EMBED_HOSTS')!.split(/\s+/)].sort();
    expect(frame).toEqual(minted);
    expect(frame).toEqual(['https://app.superlibrary.dev', 'https://app.superpipeline.dev', 'https://console.agentpod.dev']);
  });

  it('no Worker test suite reads a developer\'s .dev.vars (wrangler loads it beside any configPath it is given)', () => {
    for (const app of ['api', 'content']) {
      const cfg = read(`apps/${app}/vitest.config.ts`);
      expect(cfg, app).not.toMatch(/configPath\s*:/);
      expect(cfg, app).toContain("readFileSync(new URL('./wrangler.jsonc', import.meta.url)");
    }
  });

  it('the dev configuration is the deployed one without its routes (ruling T11)', () => {
    const { routes, ...deployed } = jsonc('apps/content/wrangler.jsonc');
    expect(routes).toBeDefined();
    expect(jsonc('apps/content/wrangler.dev.jsonc')).toEqual(deployed);
  });

  // Operator addition: the content origin "never serves anything with a login" (spec header).
  it('the content Worker has no sign-in machinery in its source', () => {
    const files = [...sources('apps/content/src'), ...sources('apps/content/viewer')];
    expect(files.map(([p]) => p)).toContain(join('apps/content/src', 'index.ts'));
    for (const [p, src] of files) {
      expect(src, p).not.toMatch(/cookie/i);
      expect(src, p).not.toMatch(/authorization|bearer/i);
      expect(src, p).not.toMatch(/oauth|\bsign-?(in|on)\b|\blog-?(in|on)\b|\/auth\b|well-known|\bsession/i);
    }
  });

  it('the host SDK takes the frame sandbox from the contract, never its own copy', () => {
    const files = sources('packages/embed/src');
    expect(files.map(([p]) => p)).toContain(join('packages/embed/src', 'index.ts'));
    for (const [p, src] of files) expect(src, p).not.toMatch(/allow-(scripts|popups|same-origin)/);
    expect(read('packages/embed/src/index.ts')).toContain('export const SANDBOX = FRAME_SANDBOX;');
  });

  it('the content Worker is bound to the R2 bucket and its viewer files only', () => {
    for (const file of ['apps/content/wrangler.jsonc', 'apps/content/wrangler.dev.jsonc']) {
      const c = jsonc(file);
      const allowed = ['$schema', 'name', 'main', 'compatibility_date', 'observability', 'vars', 'r2_buckets', 'assets', 'routes'];
      expect(Object.keys(c).filter((k) => !allowed.includes(k)), file).toEqual([]);
      expect(c.r2_buckets, file).toEqual([{ binding: 'BLOBS', bucket_name: 'superlibrary-blobs' }]);
      expect(Object.keys(c.vars as object).sort(), file).toEqual(['CONTENT_DOMAIN', 'FRAME_ANCESTORS']);
      expect(c.assets, file).toEqual({ directory: './viewer-dist', binding: 'VIEWER', run_worker_first: true });
    }
    // The one secret is the verification half of the URL signing key.
    const env = /export interface Env \{([^}]*)\}/.exec(read('apps/content/src/index.ts'))![1]!;
    const names = [...env.matchAll(/^\s*(\w+):/gm)].map((m) => m[1]).sort();
    expect(names).toEqual(['BLOBS', 'CONTENT_DOMAIN', 'FRAME_ANCESTORS', 'URL_SIGNING_PUBLIC_KEY', 'VIEWER']);
  });
});
