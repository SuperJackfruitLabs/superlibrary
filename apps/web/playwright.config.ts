import { defineConfig, devices } from '@playwright/test';

// The real stack: the API Worker, the content Worker and the SvelteKit dev server. Both Workers
// persist to one directory, so the bytes the API writes are the bytes the content Worker reads.
// `pnpm e2e` writes a fresh dev signing pair first (scripts/dev-keys.mjs). Each Worker gets its own
// inspector port: two `wrangler dev` on the default one fail with EADDRINUSE.
// PW_CHANNEL=chrome runs an installed Chrome, and PW_CHROMIUM=<path> another Chromium build, instead
// of the one `playwright install` fetches (CI installs that one); PW_WEBKIT=<path> likewise for WebKit.
// WebKit is the engine of every iOS browser, the primary platform: it runs the containment suite
// and the phone-width checks.
const PERSIST = '--persist-to ../../.wrangler-e2e';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: { baseURL: 'http://localhost:5173', trace: 'on-first-retry' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], channel: process.env.PW_CHANNEL || undefined, launchOptions: { executablePath: process.env.PW_CHROMIUM || undefined } } },
    {
      name: 'webkit',
      testMatch: /(security|phone|responsive)\.spec\.ts$/,
      // WebKit cannot resolve `itm-<hex>.localhost` itself; e2e/loopback-proxy.mjs does it, loopback only.
      use: { ...devices['Desktop Safari'], proxy: { server: 'http://127.0.0.1:8799' }, launchOptions: { executablePath: process.env.PW_WEBKIT || undefined } },
    },
  ],
  webServer: [
    {
      command: `pnpm --filter @superlibrary/api exec wrangler d1 migrations apply superlibrary-catalog --local ${PERSIST} && pnpm --filter @superlibrary/api dev ${PERSIST} --inspector-port 9339`,
      url: 'http://localhost:8787/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      command: `pnpm --filter @superlibrary/content dev ${PERSIST} --inspector-port 9340`,
      port: 8788,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    { command: 'node e2e/loopback-proxy.mjs', port: 8799, reuseExistingServer: !process.env.CI, timeout: 10_000 },
    { command: 'pnpm --filter @superlibrary/web dev', url: 'http://localhost:5173', reuseExistingServer: !process.env.CI, timeout: 120_000 },
  ],
});
