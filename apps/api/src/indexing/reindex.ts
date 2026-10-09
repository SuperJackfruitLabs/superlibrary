// apps/api/src/indexing/reindex.ts
import type { Env } from '../env';
import { embedderFor } from './embedder';
import { indexItem } from './consumer';
import { readSlots } from './vector-index';

const PAGE = 50;

/**
 * Spec §7: re-embed every chunk into the idle index; reads stay on the active one until the swap.
 *
 * Dimensions: a Vectorize index has fixed dimensions (the deployed ones are 1024). The idle slot's
 * row records the dims of whatever it last held; an embedder with other dims is refused
 * (`dimension_mismatch`) while that is recorded. OPERATOR PROCEDURE for a new dimension: delete
 * and re-create the idle slot's index at the new dims, clear its row (embedder_id, dims, cursor
 * set NULL), then call this. The README text for it is Task I4.
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
  if (idle?.dims != null && idle.dims !== e.dims) throw new Error('dimension_mismatch');
  await env.DB.prepare(`UPDATE vector_slots SET embedder_id = ?, dims = ?, state = 'building', cursor = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE slot = ?`).bind(e.id, e.dims, slot).run();
  await env.INDEX.send({ type: 'reindex', slot, after: null });
  return { slot };
}

export async function reindexPage(env: Env, slot: 'a' | 'b', after: string | null): Promise<void> {
  const s = await readSlots(env);
  if (s.building?.slot !== slot) return; // a stale page after a swap: nothing to do
  const ids = (await env.DB.prepare(`SELECT id FROM items WHERE (?1 IS NULL OR id > ?1) ORDER BY id LIMIT ?2`).bind(after, PAGE).all<{ id: string }>()).results.map((r) => r.id);
  for (const id of ids) await indexItem(env, id);
  const last = ids.at(-1) ?? after;
  await env.DB.prepare(`UPDATE vector_slots SET cursor = ? WHERE slot = ?`).bind(last, slot).run();
  if (ids.length === PAGE) {
    await env.INDEX.send({ type: 'reindex', slot, after: last });
    return;
  }
  // The swap: demote first, then promote (trigger vector_slots_one_active), in one transaction.
  await env.DB.batch([
    env.DB.prepare(`UPDATE vector_slots SET state = 'idle', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE state = 'active'`),
    env.DB.prepare(`UPDATE vector_slots SET state = 'active', cursor = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE slot = ?`).bind(slot),
  ]);
}
