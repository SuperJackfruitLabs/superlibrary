// apps/api/src/search/related.ts
import { estimateTokens, itemUrl, wrapItem, type Outcome, type RelatedItem, type RelatedQuery, type SearchResult } from '@superlibrary/contract';
import type { Env } from '../env';
import type { Viewer } from '../auth/caller';
import { audit } from '../audit';
import { canSee, isExpired, loadItem, viewerScopes, type ItemRow } from '../items/visibility';
import { extractText, TEXT_VIEWS } from '../indexing/extract';
import type { Stage, Timer } from '../timing';
import { search, sourcesOf, supersededByMap, visibleSupersededBy } from './search';
import { indexFor, readSlots } from '../indexing/vector-index';

const GET_CAP = 100_000;

async function resultOf(env: Env, v: Viewer, scopes: string[], i: ItemRow, snippet: string): Promise<SearchResult> {
  const [src, sup] = await Promise.all([sourcesOf(env, [i.id]), supersededByMap(env, [i.id]).then((m) => visibleSupersededBy(env, v, scopes, m))]);
  return { itemId: i.id, kind: i.kind, title: i.title, outcome: i.outcome as Outcome, scope: i.scope, provenance: src.get(i.id) ?? { sourceKind: 'upload' }, snippet, url: itemUrl(env.APP_URL, i.id), score: 1, supersededBy: sup.get(i.id) ?? null };
}

async function visibleItem(env: Env, v: Viewer, itemId: string, scopes?: string[]): Promise<ItemRow | null> {
  const i = await loadItem(env, itemId);
  if (!i || i.revoked_at || isExpired(i)) return null;
  return canSee(v, i, scopes ?? (await viewerScopes(env, v))) ? i : null;
}

export async function getForViewer(env: Env, v: Viewer, itemId: string, version?: number): Promise<{ result: SearchResult; text: string; wrapped: string } | null> {
  // Work records have no versions: a version param on one is not found.
  const scopes = await viewerScopes(env, v);
  const i = await visibleItem(env, v, itemId, scopes);
  if (!i || (i.kind === 'work-record' && version !== undefined)) return null;
  const content = await extractText(env, i);
  let text = content?.text ?? '';
  if (i.kind === 'artifact') {
    const vrow = await env.DB.prepare(`SELECT version, media_type, total_bytes, file_count FROM versions WHERE item_id = ? AND revoked_at IS NULL ${version !== undefined ? 'AND version = ?' : ''} ORDER BY version DESC LIMIT 1`)
      .bind(...(version !== undefined ? [itemId, version] : [itemId])).first<{ version: number; media_type: string; total_bytes: number; file_count: number }>();
    if (!vrow) return null;
    const files = (await env.DB.prepare(`SELECT path, view FROM version_files WHERE item_id = ? AND version = ? ORDER BY path`).bind(itemId, vrow.version).all<{ path: string; view: string }>()).results;
    // Text only exists for the latest version (extractText); an older version, or one with no text file, is described.
    const hasText = files.some((f) => TEXT_VIEWS.has(f.view as never)) && content?.version === vrow.version;
    if (!hasText) text = `${i.title}\nA ${vrow.media_type} artifact, version ${vrow.version}, ${vrow.file_count} file(s), ${vrow.total_bytes} bytes: ${files.map((f) => f.path).join(', ')}. Open it at ${itemUrl(env.APP_URL, i.id)}.`;
  }
  text = text.slice(0, GET_CAP);
  const result = await resultOf(env, v, scopes, i, text.slice(0, 280));
  await audit(env.DB, { workspaceId: v.workspaceId, actor: v.principalId, act: v.act, action: 'item.read', itemId, detail: { via: 'library' } }).run();
  return { result, text, wrapped: wrapItem(result, text) };
}

/** Audited here, not in the route, so every caller (REST, MCP) leaves a row. Never the query text. */
export async function related(env: Env, v: Viewer, q: RelatedQuery, timer?: Timer): Promise<RelatedItem[]> {
  const { items, basis } = await relatedItems(env, v, q, timer);
  // Gap S3: which basis was used, never a sent text itself.
  const write = () => audit(env.DB, { workspaceId: v.workspaceId, actor: v.principalId, act: v.act, action: 'items.related', detail: { count: items.length, itemIds: items.map((x) => x.itemId), basis } }).run();
  await (timer ? timer.time('audit', write) : write());
  return items;
}

/** The item's first chunk's stored vector in the active slot, or undefined (not indexed yet, or the index unreachable). */
async function storedVector(env: Env, itemId: string): Promise<number[] | undefined> {
  const first = await env.DB.prepare(`SELECT id FROM chunks WHERE item_id = ? ORDER BY position LIMIT 1`).bind(itemId).first<{ id: string }>();
  if (!first) return undefined;
  try {
    const { active } = await readSlots(env);
    return (await indexFor(env, active).get([first.id]))[0]?.values;
  } catch (e) {
    console.error('stored vector unavailable; embedding the basis', e instanceof Error ? e.message : String(e));
    return undefined;
  }
}

/** What related searched by (audited): the card's record, the item, the caller's text for a card with no record yet, or nothing. */
export type RelatedBasis = 'record' | 'item' | 'text' | 'none';

async function relatedItems(env: Env, v: Viewer, q: RelatedQuery, timer?: Timer): Promise<{ items: RelatedItem[]; basis: RelatedBasis }> {
  const timed = <T>(stage: Stage, f: () => Promise<T>): Promise<T> => (timer ? timer.time(stage, f) : f());
  const scopes = await timed('scopes', () => viewerScopes(env, v));
  const found = await timed('basis', async (): Promise<{ selfId: string | undefined; basis: string; kind: RelatedBasis } | null> => {
    if ('cardId' in q) {
      const w = await env.DB.prepare(`SELECT item_id, text FROM work_records WHERE workspace_id = ? AND card_id = ?`).bind(v.workspaceId, q.cardId).first<{ item_id: string; text: string }>();
      if (w) {
        // A record, once it exists, is the basis; one the caller cannot see answers nothing (spec §4).
        if (!(await visibleItem(env, v, w.item_id, scopes))) return null;
        return { selfId: w.item_id, basis: w.text, kind: 'record' };
      }
      // Gap S3: the record has not synced yet. The caller's own words, searched with its own visibility.
      if (q.text) return { selfId: undefined, basis: q.text, kind: 'text' };
      return null;
    }
    const i = await visibleItem(env, v, q.itemId, scopes);
    if (!i) return null;
    return { selfId: i.id, basis: (await extractText(env, i))?.text ?? i.title, kind: 'item' };
  });
  if (!found) return { items: [], basis: 'none' };
  const { selfId, basis } = found;
  // Gap S4: the basis item's own first-chunk vector, already in the active slot; embed only if it is missing.
  const vector = selfId ? await timed('basis', () => storedVector(env, selfId)) : undefined;
  // Gap S2: the item itself is no candidate, so its self-match never sets the floor's bar; the filter stays as a second guard.
  const hits = (await search(env, v, { query: basis.slice(0, 2000), limit: Math.min(25, q.limit * 3) }, scopes, { timer, exclude: selfId, vector })).filter((r) => r.itemId !== selfId);
  const out: RelatedItem[] = [];
  await timed('fit', async () => {
    // Gap S4: every hit's first chunk in one round trip.
    const firsts = new Map((await env.DB.prepare(`SELECT item_id, text FROM chunks WHERE item_id IN (SELECT value FROM json_each(?)) AND position = 0`).bind(JSON.stringify(hits.map((h) => h.itemId))).all<{ item_id: string; text: string }>()).results.map((r) => [r.item_id, r.text]));
    let used = 0;
    for (const r of hits) {
      if (out.length === q.limit) break;
      const chunk = firsts.get(r.itemId) ?? r.snippet;
      const room = q.maxTokens - used;
      if (room < 60) break;
      // Fit the block to the room left: trim the body until the wrapped block's estimate fits.
      let body = chunk;
      let wrapped = wrapItem(r, body);
      while (estimateTokens(wrapped) > room && body.length > 0) {
        body = body.slice(0, Math.max(0, body.length - Math.max(40, (estimateTokens(wrapped) - room) * 4))).trimEnd();
        wrapped = wrapItem(r, body ? `${body}…` : '');
      }
      if (estimateTokens(wrapped) > room) break;
      out.push({ ...r, wrapped, tokens: estimateTokens(wrapped) });
      used += estimateTokens(wrapped);
    }
  });
  return { items: out, basis: found.kind };
}
