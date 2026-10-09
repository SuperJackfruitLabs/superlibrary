import type { Env } from './env';

/**
 * Plan Stage 0: the one message that joins sources to indexing. It never throws: the caller's write
 * has already happened, and a lost message is repaired by the index reconcile (plan P10).
 */
export async function itemChanged(env: Env, itemId: string, workspaceId: string, change: 'upserted' | 'deleted'): Promise<void> {
  try {
    await env.INDEX.send({ type: 'item.changed', itemId, workspaceId, change, at: new Date().toISOString() });
  } catch (e) {
    console.error('item.changed not sent', itemId, change, e instanceof Error ? e.message : String(e));
  }
}
