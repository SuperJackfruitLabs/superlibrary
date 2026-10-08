import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';

// The Worker's shape comes from wrangler.jsonc, but not through `wrangler.configPath`: wrangler then
// always loads the .dev.vars beside it, and a test must not depend on a developer's keys.
const w = JSON.parse(
  readFileSync(new URL('./wrangler.jsonc', import.meta.url), 'utf8')
    .replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (_, s: string | undefined) => s ?? '')
    .replace(/,(\s*[}\]])/g, '$1'),
) as { main: string; compatibility_date: string; r2_buckets: { binding: string }[]; assets: { directory: string; binding: string; run_worker_first: boolean } };

export default defineConfig({
  plugins: [
    cloudflareTest({
      main: w.main,
      miniflare: {
        compatibilityDate: w.compatibility_date,
        r2Buckets: w.r2_buckets.map((b) => b.binding),
        assets: { directory: w.assets.directory, binding: w.assets.binding, routerConfig: { invoke_user_worker_ahead_of_assets: w.assets.run_worker_first } },
        bindings: { FRAME_ANCESTORS: 'https://app.test https://host.test', CONTENT_DOMAIN: 'content.test', URL_SIGNING_PUBLIC_KEY: '' },
      },
    }),
  ],
  test: { include: ['test/**/*.test.ts'] },
});
