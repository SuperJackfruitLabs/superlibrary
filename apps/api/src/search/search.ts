// apps/api/src/search/search.ts
import { OUTCOME_WEIGHTS, RRF_K, itemUrl, type ItemSource, type Outcome, type SearchQuery, type SearchResult } from '@superlibrary/contract';
import type { Env } from '../env';
import type { Viewer } from '../auth/caller';
import { viewerScopes, visibleBinds, visibleSql, type ItemRow } from '../items/visibility';
import { embedderFor } from '../indexing/embedder';
import { indexFor, readSlots } from '../indexing/vector-index';

/** Words only: FTS5 syntax a person types is never syntax (Review Focus). */
export function ftsQuery(text: string): string | null {
  const words = text.match(/[\p{L}\p{N}\p{M}_]+/gu)?.filter((w) => !/^(AND|OR|NOT|NEAR)$/.test(w)) ?? [];
  return words.length === 0 ? null : words.slice(0, 32).map((w) => `"${w}"`).join(' OR ');
}

export async function sourcesOf(env: Env, ids: string[]): Promise<Map<string, ItemSource>> {
  if (ids.length === 0) return new Map();
  const rows = (await env.DB.prepare(`SELECT * FROM item_sources WHERE item_id IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(ids)).all<Record<string, string | null>>()).results;
  return new Map(rows.map((r) => [r.item_id!, {
    sourceKind: r.source as ItemSource['sourceKind'], agent: r.agent_principal !== null, ...(r.agent_principal ? { agentPrincipal: r.agent_principal } : {}),
    ...(r.station ? { station: r.station } : {}), ...(r.station_removed_at ? { stationRemoved: true } : {}), ...(r.source_path ? { path: r.source_path } : {}),
    ...(r.board_id ? { board: r.board_id } : {}), ...(r.card_id ? { card: r.card_id } : {}), ...(r.stage ? { stage: r.stage } : {}), ...(r.run_id ? { run: r.run_id } : {}),
    ...(r.source_id ? { sourceId: r.source_id } : {}), ...(r.source_url ? { sourceUrl: r.source_url } : {}),
  } satisfies ItemSource]));
}

export async function supersededByMap(env: Env, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = (await env.DB.prepare(
    `SELECT w.item_id AS old, n.item_id AS new FROM work_records w JOIN work_records n ON n.workspace_id = w.workspace_id AND n.card_id = w.superseded_by_card
      WHERE w.item_id IN (SELECT value FROM json_each(?))`,
  ).bind(JSON.stringify(ids)).all<{ old: string; new: string }>()).results;
  return new Map(rows.map((r) => [r.old, r.new]));
}

/** The chunk to show for each item: the one that matched, else its first. From D1, visible items only. */
export async function bestChunks(env: Env, ids: string[], hit: Map<string, string>): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = (await env.DB.prepare(`SELECT id, item_id, text, position FROM chunks WHERE item_id IN (SELECT value FROM json_each(?)) ORDER BY item_id, position`).bind(JSON.stringify(ids)).all<{ id: string; item_id: string; text: string }>()).results;
  const out = new Map<string, string>();
  for (const r of rows) if (hit.get(r.item_id) === r.id || !out.has(r.item_id)) out.set(r.item_id, r.text);
  return out;
}

function snippet(text: string, query: string): string {
  const words = query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const lower = text.toLowerCase();
  const at = Math.max(0, Math.min(...words.map((w) => lower.indexOf(w)).filter((i) => i >= 0), text.length));
  const start = Math.max(0, (at === text.length ? 0 : at) - 80);
  return (start > 0 ? '…' : '') + text.slice(start, start + 280).replace(/\s+/g, ' ').trim() + (start + 280 < text.length ? '…' : '');
}

/** A replacement the viewer cannot see is not named (spec §4): same visibility and liveness as any result. */
export async function visibleSupersededBy(env: Env, v: Viewer, scopes: string[], raw: Map<string, string>): Promise<Map<string, string>> {
  const repIds = [...new Set(raw.values())];
  if (repIds.length === 0) return new Map();
  const ok = new Set((await env.DB.prepare(
    `SELECT i.id FROM items i WHERE i.id IN (SELECT value FROM json_each(?4)) AND ${visibleSql('i')} AND i.revoked_at IS NULL AND (i.expires_at IS NULL OR i.expires_at > ?5)`,
  ).bind(...visibleBinds(v, scopes), JSON.stringify(repIds), new Date().toISOString()).all<{ id: string }>()).results.map((r) => r.id));
  return new Map([...raw].filter(([, n]) => ok.has(n)));
}

const live = `AND i.revoked_at IS NULL AND (i.expires_at IS NULL OR i.expires_at > ?4)`;

export async function search(env: Env, v: Viewer, q: SearchQuery): Promise<SearchResult[]> {
  const scopes = await viewerScopes(env, v);
  const boardScope = q.board ? `board:${q.board}` : null;
  // The vector filter only ever carries scopes the viewer can see; a board filter narrows it to that one board.
  const vectorScopes = boardScope ? scopes.filter((s) => s === boardScope) : scopes;
  // An agent has nothing outside its scopes. A person may own items on a board they cannot list (own-item rule), so FTS still runs.
  if (v.kind === 'agent' && vectorScopes.length === 0) return [];
  const now = new Date().toISOString();
  const kindSql = q.kinds ? `AND i.kind IN (SELECT value FROM json_each(?5))` : `AND ?5 IS NULL`;
  const outcomeSql = q.outcomes ? `AND i.outcome IN (SELECT value FROM json_each(?6))` : `AND ?6 IS NULL`;
  const boardSql = `AND (?7 IS NULL OR i.scope = ?7)`;
  const binds = [...visibleBinds(v, scopes), now, q.kinds ? JSON.stringify(q.kinds) : null, q.outcomes ? JSON.stringify(q.outcomes) : null, boardScope] as const;

  // 1. Exact words, filtered in SQL.
  const fts: Array<{ item_id: string; chunk_id: string }> = [];
  const match = ftsQuery(q.query);
  if (match) {
    try {
      fts.push(...(await env.DB.prepare(
        `SELECT f.item_id, f.chunk_id FROM chunks_fts f JOIN items i ON i.id = f.item_id
          WHERE chunks_fts MATCH ?8 AND ${visibleSql('i')} ${live} ${kindSql} ${outcomeSql} ${boardSql}
          ORDER BY bm25(chunks_fts) LIMIT 60`,
      ).bind(...binds, match).all<{ item_id: string; chunk_id: string }>()).results);
    } catch (e) {
      console.error('full-text search failed; treated as no hits', e instanceof Error ? e.message : String(e));
    }
  }

  // 2. Meaning, filtered in the vector query, then re-checked in SQL before anything is ranked.
  let semantic: Array<{ item_id: string; chunk_id: string }> = [];
  try {
    if (vectorScopes.length === 0) throw new Error('no visible scope for the vector query');
    const { active } = await readSlots(env);
    const [values] = await embedderFor(env, active.embedder_id!).embed([q.query]);
    const matches = await indexFor(env, active).query(values!, {
      namespace: v.workspaceId, topK: 50,
      filter: { scope: { $in: vectorScopes }, ...(q.kinds ? { kind: { $in: q.kinds } } : {}), ...(q.outcomes ? { outcome: { $in: q.outcomes } } : {}) },
    });
    const ids = [...new Set(matches.map((m) => m.itemId))];
    const visible = new Set(ids.length === 0 ? [] : (await env.DB.prepare(
      `SELECT i.id FROM items i WHERE i.id IN (SELECT value FROM json_each(?8)) AND ${visibleSql('i')} ${live} ${kindSql} ${outcomeSql} ${boardSql}`,
    ).bind(...binds, JSON.stringify(ids)).all<{ id: string }>()).results.map((r) => r.id));
    semantic = matches.filter((m) => visible.has(m.itemId)).map((m) => ({ item_id: m.itemId, chunk_id: m.id }));
  } catch (e) {
    console.error('vector search unavailable; full-text only', e instanceof Error ? e.message : String(e));
  }

  // 3. Reciprocal rank fusion per item, then the outcome weight (spec §7).
  const score = new Map<string, number>();
  const hit = new Map<string, string>();
  for (const list of [fts, semantic]) {
    const seen = new Set<string>();
    let rank = 0;
    for (const r of list) {
      if (seen.has(r.item_id)) continue;
      seen.add(r.item_id);
      rank++;
      score.set(r.item_id, (score.get(r.item_id) ?? 0) + 1 / (RRF_K + rank));
      if (!hit.has(r.item_id)) hit.set(r.item_id, r.chunk_id);
    }
  }
  if (score.size === 0) return [];
  const ids = [...score.keys()];
  const rows = (await env.DB.prepare(`SELECT * FROM items WHERE id IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(ids)).all<ItemRow>()).results;
  const [sources, rawSuperseded, chunks] = await Promise.all([sourcesOf(env, ids), supersededByMap(env, ids), bestChunks(env, ids, hit)]);
  const superseded = await visibleSupersededBy(env, v, scopes, rawSuperseded);
  return rows
    .map((i) => ({
      itemId: i.id, kind: i.kind, title: i.title, outcome: i.outcome as Outcome, scope: i.scope,
      provenance: sources.get(i.id) ?? { sourceKind: 'upload' as const }, snippet: snippet(chunks.get(i.id) ?? i.title, q.query),
      url: itemUrl(env.APP_URL, i.id), score: score.get(i.id)! * OUTCOME_WEIGHTS[i.outcome as Outcome], supersededBy: superseded.get(i.id) ?? null,
    }))
    .sort((a, b) => b.score - a.score || a.itemId.localeCompare(b.itemId))
    .slice(0, q.limit);
}
