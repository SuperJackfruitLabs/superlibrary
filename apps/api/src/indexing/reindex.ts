// apps/api/src/indexing/reindex.ts
import type { Env } from '../env';
import { embedderFor } from './embedder';
import { indexItem } from './consumer';
import { readSlots } from './vector-index';

/**
 * Items per page. Each item costs several subrequests (load, extract, D1 batches of 50 rows, one embed
 * and one upsert per written slot, deletes) and a Worker invocation allows a bounded number of them,
 * so a page must stay well under that bound even for multi-chunk items: 20 keeps it comfortable.
 */
const PAGE = 20;
const NOW = `strftime('%Y-%m-%dT%H:%M:%fZ','now')`;

/**
 * Spec §7: re-embed every chunk into the idle index; reads stay on the active one until the swap.
 *
 * Dimensions (B-R14): the Vectorize indexes were created at 1024 dimensions, so an idle slot whose row
 * has no recorded dims counts as 1024; an embedder with other dims is refused (`dimension_mismatch`).
 * OPERATOR PROCEDURE for another dimension: delete and re-create the idle slot's index at the new dims,
 * set that slot's row dims to the new value (embedder_id NULL, cursor NULL), then call this. README: Task I4.
 *
 * A building slot that stops advancing (poison item, failing embedder) is recovered with
 * `resumeReindex` (re-enqueue a page from the recorded cursor) or `cancelReindex` (building -> idle;
 * the B-R13 drain then removes what it wrote).
 */
export async function startReindex(env: Env, embedderId: string): Promise<{ slot: 'a' | 'b' }> {
  const s = await readSlots(env);
  if (s.building) throw new Error('reindex_running');
  const e = embedderFor(env, embedderId);
  const slot = s.active.slot === 'a' ? 'b' : 'a';
  // B-R13: the idle slot must hold nothing of ours: no index_state may still record it.
  const left = await env.DB.prepare(`SELECT 1 AS n FROM index_state WHERE json_extract(slots, ?) IS NOT NULL LIMIT 1`).bind(`$.${slot}`).first();
  if (left) throw new Error('slot_not_drained');
  const idle = await env.DB.prepare(`SELECT dims FROM vector_slots WHERE slot = ?`).bind(slot).first<{ dims: number | null }>();
  if ((idle?.dims ?? 1024) !== e.dims) throw new Error('dimension_mismatch');
  // Atomic: only one caller can move a slot to building.
  const r = await env.DB.prepare(`UPDATE vector_slots SET embedder_id = ?, dims = ?, state = 'building', cursor = NULL, updated_at = ${NOW}
      WHERE slot = ? AND state = 'idle' AND NOT EXISTS (SELECT 1 FROM vector_slots WHERE state = 'building')`).bind(e.id, e.dims, slot).run();
  if (r.meta.changes !== 1) throw new Error('reindex_running');
  await env.INDEX.send({ type: 'reindex', slot, after: null });
  return { slot };
}

/** Re-enqueue a page from the recorded cursor. Throws `no_reindex` when nothing is building. */
export async function resumeReindex(env: Env): Promise<{ slot: 'a' | 'b'; after: string | null }> {
  const { building } = await readSlots(env);
  if (!building) throw new Error('no_reindex');
  await env.INDEX.send({ type: 'reindex', slot: building.slot, after: building.cursor });
  return { slot: building.slot, after: building.cursor };
}

/** building -> idle. Throws `no_reindex` when nothing is building. Stale pages then do nothing. */
export async function cancelReindex(env: Env): Promise<{ slot: 'a' | 'b' }> {
  const { building } = await readSlots(env);
  if (!building) throw new Error('no_reindex');
  const r = await env.DB.prepare(`UPDATE vector_slots SET state = 'idle', cursor = NULL, updated_at = ${NOW} WHERE slot = ? AND state = 'building'`).bind(building.slot).run();
  if (r.meta.changes !== 1) throw new Error('no_reindex');
  return { slot: building.slot };
}

export async function reindexPage(env: Env, slot: 'a' | 'b', after: string | null): Promise<void> {
  const s = await readSlots(env);
  if (s.building?.slot !== slot || s.building.cursor !== after) return; // stale, duplicate or cancelled page
  const ids = (await env.DB.prepare(`SELECT id FROM items WHERE (?1 IS NULL OR id > ?1) ORDER BY id LIMIT ?2`).bind(after, PAGE).all<{ id: string }>()).results.map((r) => r.id);
  for (const id of ids) await indexItem(env, id);
  const last = ids.at(-1) ?? after;
  // Advance only if this page still owns the cursor; a duplicate loses and does nothing more.
  const adv = await env.DB.prepare(`UPDATE vector_slots SET cursor = ? WHERE slot = ? AND state = 'building' AND cursor IS ?`).bind(last, slot, after).run();
  if (adv.meta.changes !== 1) return;
  if (ids.length === PAGE) {
    await env.INDEX.send({ type: 'reindex', slot, after: last });
    return;
  }
  // The swap: demote first, then promote (trigger vector_slots_one_active), in one transaction.
  await env.DB.batch([
    env.DB.prepare(`UPDATE vector_slots SET state = 'idle', updated_at = ${NOW} WHERE state = 'active'`),
    env.DB.prepare(`UPDATE vector_slots SET state = 'active', cursor = NULL, updated_at = ${NOW} WHERE slot = ? AND state = 'building'`).bind(slot),
  ]);
}
