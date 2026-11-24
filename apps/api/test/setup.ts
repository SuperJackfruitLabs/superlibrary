import { applyD1Migrations, env } from 'cloudflare:test';
import { afterEach, beforeAll } from 'vitest';
import worker from '../src/index';
import { takeMismatches, withTreatyCheck } from './helpers/treaty-http';

// The real migration files, applied by the pool's own splitter (it keeps CREATE TRIGGER … END
// whole). Superpipeline mirrors statements by hand and splits on ';', which would cut a trigger.
beforeAll(() => applyD1Migrations(env.DB, env.TEST_MIGRATIONS));

// Treaty phase 3: every exchange on a route `superlibrary.api` contracts is checked against
// treaty's api.v1 (test/helpers/treaty-http.ts). `SELF.fetch` reaches the Worker's default export,
// so wrapping its `fetch` here covers every test, and those that call `worker.fetch` directly.
worker.fetch = withTreatyCheck(worker.fetch.bind(worker));
afterEach(() => {
  const found = takeMismatches();
  if (found.length > 0) throw new Error(`${found.length} exchange(s) do not match treaty's superlibrary.api:\n\n${found.join('\n\n')}`);
});
