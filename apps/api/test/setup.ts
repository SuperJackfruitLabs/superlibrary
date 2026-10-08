import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeAll } from 'vitest';

// The real migration files, applied by the pool's own splitter (it keeps CREATE TRIGGER … END
// whole). Superpipeline mirrors statements by hand and splits on ';', which would cut a trigger.
beforeAll(() => applyD1Migrations(env.DB, env.TEST_MIGRATIONS));
