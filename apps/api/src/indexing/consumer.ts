// apps/api/src/indexing/consumer.ts
import type { IndexMessage } from '@superlibrary/contract';
import type { Env } from '../env';
import { indexItem, unindexItem } from './index-item';
import { reindexPage } from './reindex';

export { indexItem, unindexItem } from './index-item';

/** The daily repair (plan P10). A constant here, not in the Worker entry, which may export only default. */
export const RECONCILE_CRON = '30 3 * * *';

export async function indexBatch(batch: MessageBatch<IndexMessage>, env: Env): Promise<void> {
  for (const msg of batch.messages) {
    try {
      const m = msg.body;
      if (m.type === 'item.changed') {
        if (m.change === 'deleted') await unindexItem(env, m.itemId);
        else await indexItem(env, m.itemId);
      } else if (m.type === 'reindex') {
        await reindexPage(env, m.slot, m.after);
      }
      msg.ack();
    } catch (e) {
      console.error('index failed', e instanceof Error ? e.message : String(e));
      msg.retry({ delaySeconds: Math.min(600, 15 * 2 ** msg.attempts) });
    }
  }
}

/** Plan P10: the daily repair. Live items never indexed, and index state with no item left. */
export async function reconcile(env: Env): Promise<{ queued: number; orphans: number }> {
  const missing = (await env.DB.prepare(
    `SELECT i.id, i.workspace_id FROM items i LEFT JOIN index_state s ON s.item_id = i.id
      WHERE (s.item_id IS NULL OR s.digest LIKE 'pending:%') AND i.revoked_at IS NULL AND (i.expires_at IS NULL OR i.expires_at > ?1) LIMIT 5000`,
  ).bind(new Date().toISOString()).all<{ id: string; workspace_id: string }>()).results;
  // B-R4: revoked or expired items that still hold index state; indexItem removes them.
  const stale = (await env.DB.prepare(
    `SELECT i.id, i.workspace_id FROM items i JOIN index_state s ON s.item_id = i.id
      WHERE i.revoked_at IS NOT NULL OR (i.expires_at IS NOT NULL AND i.expires_at <= ?1) LIMIT 5000`,
  ).bind(new Date().toISOString()).all<{ id: string; workspace_id: string }>()).results;
  // B-R13: live items whose index_state still records a slot that is neither active nor building
  // (the old slot after a swap); indexItem deletes their ids from it, so two embedders never mix.
  const idle = (await env.DB.prepare(`SELECT slot FROM vector_slots WHERE state = 'idle'`).all<{ slot: 'a' | 'b' }>()).results.filter((r) => r.slot === 'a' || r.slot === 'b');
  const undrained = idle.length === 0 ? [] : (await env.DB.prepare(
    `SELECT i.id, i.workspace_id FROM items i JOIN index_state s ON s.item_id = i.id
      WHERE i.revoked_at IS NULL AND (i.expires_at IS NULL OR i.expires_at > ?1)
        AND (${idle.map((r) => `json_extract(s.slots, '$.${r.slot}') IS NOT NULL`).join(' OR ')}) LIMIT 5000`,
  ).bind(new Date().toISOString()).all<{ id: string; workspace_id: string }>()).results;
  const orphans = (await env.DB.prepare(`SELECT s.item_id FROM index_state s LEFT JOIN items i ON i.id = s.item_id WHERE i.id IS NULL LIMIT 5000`).all<{ item_id: string }>()).results;
  const at = new Date().toISOString();
  const msgs = [
    ...[...new Map([...missing, ...stale, ...undrained].map((r) => [r.id, r])).values()].map((r) => ({ body: { type: 'item.changed' as const, itemId: r.id, workspaceId: r.workspace_id, change: 'upserted' as const, at } })),
    ...orphans.map((r) => ({ body: { type: 'item.changed' as const, itemId: r.item_id, workspaceId: '', change: 'deleted' as const, at } })),
  ];
  for (let i = 0; i < msgs.length; i += 100) await env.INDEX.sendBatch(msgs.slice(i, i + 100));
  return { queued: new Set([...missing, ...stale, ...undrained].map((r) => r.id)).size, orphans: orphans.length };
}
