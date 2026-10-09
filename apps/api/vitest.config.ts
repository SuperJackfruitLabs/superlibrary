import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';

// The Worker's shape comes from wrangler.jsonc, but not through `wrangler.configPath`: wrangler then
// always loads the .dev.vars beside it, and a test must not depend on a developer's keys.
interface Wrangler {
  main: string;
  compatibility_date: string;
  compatibility_flags: string[];
  vars: Record<string, string>;
  d1_databases: { binding: string; database_id: string }[];
  r2_buckets: { binding: string }[];
  queues: { producers: { binding: string; queue: string }[]; consumers: { queue: string; max_batch_size: number; max_retries: number }[] };
}
const w = JSON.parse(
  readFileSync(new URL('./wrangler.jsonc', import.meta.url), 'utf8')
    .replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (_, s: string | undefined) => s ?? '')
    .replace(/,(\s*[}\]])/g, '$1'),
) as Wrangler;

// Superpipeline's shape (apps/api/vitest.config.ts): the Workers runtime from our wrangler config,
// with dev auth opted in here only and the plane off unless a test turns it on.
export default defineConfig(async () => {
  const migrations = await readD1Migrations('./migrations');
  return {
    plugins: [
      cloudflareTest({
        main: w.main,
        miniflare: {
          compatibilityDate: w.compatibility_date,
          compatibilityFlags: w.compatibility_flags,
          d1Databases: Object.fromEntries(w.d1_databases.map((d) => [d.binding, d.database_id])),
          r2Buckets: w.r2_buckets.map((b) => b.binding),
          queueProducers: Object.fromEntries(w.queues.producers.map((q) => [q.binding, { queueName: q.queue }])),
          queueConsumers: Object.fromEntries(w.queues.consumers.map((q) => [q.queue, { maxBatchSize: q.max_batch_size, maxRetries: q.max_retries }])),
          bindings: {
            ...w.vars,
            TEST_MIGRATIONS: migrations,
            DEV_AUTH: 'true',
            APP_URL: 'https://api.test',
            CONTENT_ORIGIN_TEMPLATE: 'https://{label}.content.test',
            EMBED_HOSTS: 'https://host.test',
            CONSOLE_ORIGINS: 'https://console.test',
            RETENTION_MODE: 'report',
            ORG_PLANE_ISSUER: '',
            ORG_PLANE_JWKS_URL: '',
            ORG_PLANE_AUDIENCE: '',
            ORG_PLANE_URL: '',
            HUB_SERVICE_PRINCIPAL: '',
            SERVICE_CREDENTIALS: '',
            HUB_URL: 'https://hub.test',
            HUB_AUDIENCE: 'https://hub.test',
            SUPERPIPELINE_URL: 'https://pipeline.test',
            SUPERPIPELINE_AUDIENCE: 'https://pipeline.test',
            PUSH_SIGNING_KEY: 'test-push-key',
            OPERATORS: '',
            ROSTER_TTL_SECONDS: '300',
          },
        },
      }),
    ],
    test: { include: ['test/**/*.test.ts'], setupFiles: ['./test/setup.ts'] },
  };
});
