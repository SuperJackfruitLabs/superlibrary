import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: { bindings: { FRAME_ANCESTORS: 'https://app.test https://host.test', CONTENT_DOMAIN: 'content.test', URL_SIGNING_PUBLIC_KEY: '' } },
    }),
  ],
  test: { include: ['test/**/*.test.ts'] },
});
