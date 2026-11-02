// apps/api/src/indexing/index-item.ts
// Indexing one item: its chunks, FTS rows and vectors in every written slot, and removing them.
// The queue consumer (consumer.ts) and the re-index pages (reindex.ts) both call it.
import type { Env } from '../env';
import { loadItem } from '../items/visibility';
import { sha256Hex } from '../storage/blobs';
import { chunkFor } from './chunk';
import { extractText } from './extract';
import { embedderFor } from './embedder';
import { indexFor, readSlots, type SlotRow } from './vector-index';
import { estimateTokens } from '@superlibrary/contract';

interface State { digest: string; chunk_ids: string; slots: string }

async function slotsToWrite(env: Env): Promise<SlotRow[]> {
  const s = await readSlots(env);
  return s.building ? [s.active, s.building] : [s.active];
}

/**
 * Remove every chunk, FTS row and vector an item has. Order (B-R10): the D1 rows first, so search
 * stops serving the item at once; then the vectors, by the ids index_state recorded; index_state
 * last, because it holds those ids. A failed vector delete throws and the retry still knows them.
 */
export async function unindexItem(env: Env, itemId: string): Promise<void> {
  const st = await env.DB.prepare(`SELECT chunk_ids, slots FROM index_state WHERE item_id = ?`).bind(itemId).first<State>();
  const ids: string[] = st ? JSON.parse(st.chunk_ids) : (await env.DB.prepare(`SELECT id FROM chunks WHERE item_id = ?`).bind(itemId).all<{ id: string }>()).results.map((r) => r.id);
  const where: Record<string, string> = st ? JSON.parse(st.slots) : {};
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM chunks_fts WHERE item_id = ?`).bind(itemId),
    env.DB.prepare(`DELETE FROM chunks WHERE item_id = ?`).bind(itemId),
  ]);
  const all = (await env.DB.prepare(`SELECT slot, embedder_id, dims, state, cursor FROM vector_slots WHERE embedder_id IS NOT NULL`).all<SlotRow>()).results;
  for (const s of all) if (ids.length > 0 && (s.slot in where || !st)) await indexFor(env, s).delete(ids).catch((e) => { if (st) throw e; });
  await env.DB.prepare(`DELETE FROM index_state WHERE item_id = ?`).bind(itemId).run();
}

export async function indexItem(env: Env, itemId: string): Promise<'indexed' | 'unchanged' | 'removed'> {
  const item = await loadItem(env, itemId);
  const content = item ? await extractText(env, item) : null;
  if (!item || !content) { await unindexItem(env, itemId); return 'removed'; }
  const slots = await slotsToWrite(env);
  const digest = await sha256Hex(JSON.stringify([content.text, item.scope, item.outcome, item.kind, item.title, content.version, slots.map((s) => s.embedder_id)]));
  const st = await env.DB.prepare(`SELECT digest, chunk_ids, slots FROM index_state WHERE item_id = ?`).bind(itemId).first<State>();
  if (st?.digest === digest) return 'unchanged';

  const texts = chunkFor(content.view, content.text);
  const ids = texts.map((_, i) => `${itemId}:${content.version}:${i}`);
  const oldIds: string[] = st ? JSON.parse(st.chunk_ids) : (await env.DB.prepare(`SELECT id FROM chunks WHERE item_id = ?`).bind(itemId).all<{ id: string }>()).results.map((r) => r.id);
  const oldWhere: Record<string, string> = st ? JSON.parse(st.slots) : {};
  const where: Record<string, string> = {};
  for (const s of slots) where[s.slot] = s.embedder_id!;
  const stale = oldIds.filter((id) => !ids.includes(id));

  // (b) FTS first (B-R10): D1 search keeps working whatever happens to the vector index. The pending
  // state records the new ids plus the stale old vector ids, so no vector is ever unrecorded.
  const rows: D1PreparedStatement[] = [
    env.DB.prepare(`DELETE FROM chunks_fts WHERE item_id = ?`).bind(itemId),
    env.DB.prepare(`DELETE FROM chunks WHERE item_id = ?`).bind(itemId),
    env.DB.prepare(`INSERT OR REPLACE INTO index_state (item_id, digest, chunk_ids, slots, indexed_at) VALUES (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))`)
      .bind(itemId, `pending:${digest}`, JSON.stringify([...ids, ...stale]), JSON.stringify({ ...oldWhere, ...where })),
  ];
  texts.forEach((t, i) => rows.push(
    env.DB.prepare(`INSERT OR REPLACE INTO chunks (id, item_id, version, position, text, tokens) VALUES (?, ?, ?, ?, ?, ?)`).bind(ids[i], itemId, content.version, i, t, estimateTokens(t)),
    env.DB.prepare(`INSERT INTO chunks_fts (text, chunk_id, item_id) VALUES (?, ?, ?)`).bind(t, ids[i], itemId),
  ));
  // D1 batches have a statement cap: groups of 50. The first group clears the item's rows, so a retry is safe.
  for (let i = 0; i < rows.length; i += 50) await env.DB.batch(rows.slice(i, i + 50));

  // (c) vectors, (d) stale vector ids, (e) the real digest.
  for (const s of slots) {
    const vectors = await embedderFor(env, s.embedder_id!).embed(texts);
    await indexFor(env, s).upsert(vectors.map((values, i) => ({
      id: ids[i], values, namespace: item.workspace_id,
      metadata: { itemId, scope: item.scope, kind: item.kind, outcome: item.outcome, embedder: s.embedder_id!, dims: s.dims!, version: content.version, position: i },
    })));
  }
  // Stale ids go from every slot still written. A slot recorded before but no longer written (for
  // example the old active slot after a swap) loses all of the item's ids, so the final state
  // never forgets vectors that still exist.
  const dropped = Object.keys(oldWhere).filter((k) => !(k in where));
  if (stale.length > 0 || dropped.length > 0) {
    const everyId = [...new Set([...oldIds, ...ids])];
    const all = (await env.DB.prepare(`SELECT slot, embedder_id, dims, state, cursor FROM vector_slots WHERE embedder_id IS NOT NULL`).all<SlotRow>()).results;
    for (const s of all) {
      if (s.slot in where && stale.length > 0) await indexFor(env, s).delete(stale);
      else if (dropped.includes(s.slot)) await indexFor(env, s).delete(everyId);
    }
  }
  await env.DB.prepare(`UPDATE index_state SET digest = ?, chunk_ids = ?, slots = ? WHERE item_id = ?`).bind(digest, JSON.stringify(ids), JSON.stringify(where), itemId).run();
  return 'indexed';
}
