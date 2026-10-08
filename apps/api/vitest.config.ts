import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';

// Superpipeline's shape (apps/api/vitest.config.ts): the Workers runtime from our wrangler config,
// with dev auth opted in here only and the plane off unless a test turns it on.
export default defineConfig(async () => {
  const migrations = await readD1Migrations('./migrations');
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            DEV_AUTH: 'true',
            APP_URL: 'https://api.test',
            CONTENT_ORIGIN_TEMPLATE: 'https://{label}.content.test',
            EMBED_HOSTS: 'https://host.test',
            RETENTION_MODE: 'report',
            ORG_PLANE_ISSUER: '',
            ORG_PLANE_JWKS_URL: '',
            ORG_PLANE_AUDIENCE: '',
          },
        },
      }),
    ],
    test: { include: ['test/**/*.test.ts'], setupFiles: ['./test/setup.ts'] },
  };
});
