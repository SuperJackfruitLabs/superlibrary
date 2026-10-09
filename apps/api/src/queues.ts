import type { Env, RetentionMessage } from './env';
import { indexBatch } from './indexing/consumer';
import { ingestBatch } from './ingest/consumer';
import { sweep } from './lifecycle/retention';

// `any`: each queue carries its own message type.
export type QueueHandler = (batch: MessageBatch<any>, env: Env) => Promise<void>;

async function retentionBatch(batch: MessageBatch<RetentionMessage>, env: Env): Promise<void> {
  for (const m of batch.messages) {
    // Idempotent: a duplicate delivery finds nothing left to do (spec §6). A sweep that throws
    // is not acked, so the queue retries it.
    if (m.body?.type === 'sweep') await sweep(env, Date.now());
    m.ack();
  }
}

/**
 * Queue name → handler (plan P21). Lane A adds `superlibrary-ingest`, lane B `superlibrary-index`,
 * each one line. A queue missing here is a deploy mistake: its messages are retried, never acked.
 */
export const queueHandlers: Record<string, QueueHandler> = {
  'superlibrary-retention': retentionBatch,
  'superlibrary-index': indexBatch,
  'superlibrary-ingest': ingestBatch,
};
