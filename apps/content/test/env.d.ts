/// <reference types="@cloudflare/vitest-pool-workers/types" />
import type { Env as WorkerEnv } from '../src/index';

declare global {
  namespace Cloudflare {
    // The tests seed R2 themselves; the Worker's own type has no write methods (plan D8).
    interface Env extends Omit<WorkerEnv, 'BLOBS'> {
      BLOBS: R2Bucket;
    }
  }
}
export {};
