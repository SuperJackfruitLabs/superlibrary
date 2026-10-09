import { CollectionAdd, CollectionCreate, CollectionPatch, type CollectionDetail, type CollectionSummary } from '@superlibrary/contract';
import type { Env } from '../env';
import type { Person } from '../auth/caller';
import { newId } from '../ids';
import { audit } from '../audit';
import { error, json } from '../http';
import { canSee, isExpired, loadItem, viewerScopes, visibleBinds, visibleSql, type ItemRow } from '../items/visibility';
import { extrasFor, summary } from '../items/routes';
import { issues } from './issues';

interface ColRow { id: string; workspace_id: string; name: string; description: string; created_by: string; created_at: string; updated_at: string }

/** Rename and delete (decision O2). Adding and removing items is any member's. */
const canEdit = (p: Person, c: ColRow) => c.created_by === p.principalId || p.role === 'owner';
const LIVE = `i.revoked_at IS NULL AND (i.expires_at IS NULL OR i.expires_at > ?4)`;

const summaryOf = (p: Person, c: ColRow, itemCount: number): CollectionSummary => ({
  id: c.id, name: c.name, description: c.description, createdBy: c.created_by, createdAt: c.created_at, updatedAt: c.updated_at, itemCount, canEdit: canEdit(p, c),
});

/** Visible, live items per collection: a hidden item is never counted (spec §4). */
async function visibleCounts(env: Env, p: Person, scopes: string[], ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const rows = (await env.DB.prepare(
    `SELECT ci.collection_id AS id, COUNT(*) AS n FROM collection_items ci JOIN items i ON i.id = ci.item_id
      WHERE ${visibleSql('i')} AND ${LIVE} AND ci.collection_id IN (SELECT value FROM json_each(?5)) GROUP BY ci.collection_id`,
  ).bind(...visibleBinds(p, scopes), new Date().toISOString(), JSON.stringify(ids)).all<{ id: string; n: number }>()).results;
  return new Map(rows.map((r) => [r.id, r.n]));
}

export const loadCollection = (env: Env, p: Person, id: string) =>
  env.DB.prepare(`SELECT * FROM collections WHERE id = ? AND workspace_id = ?`).bind(id, p.workspaceId).first<ColRow>();

export async function listCollections(env: Env, p: Person): Promise<Response> {
  const rows = (await env.DB.prepare(`SELECT * FROM collections WHERE workspace_id = ? ORDER BY updated_at DESC, id DESC LIMIT 500`).bind(p.workspaceId).all<ColRow>()).results;
  const counts = await visibleCounts(env, p, await viewerScopes(env, p), rows.map((r) => r.id));
  return json({ collections: rows.map((r) => summaryOf(p, r, counts.get(r.id) ?? 0)) });
}

export async function createCollection(request: Request, env: Env, p: Person): Promise<Response> {
  const b = CollectionCreate.safeParse(await request.json().catch(() => null));
  if (!b.success) return error(400, 'invalid', { issues: issues(b.error) });
  const id = newId('col');
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO collections (id, workspace_id, name, description, created_by) VALUES (?, ?, ?, ?, ?)`).bind(id, p.workspaceId, b.data.name, b.data.description, p.principalId),
      audit(env.DB, { workspaceId: p.workspaceId, actor: p.principalId, act: p.act, action: 'collection.created', detail: { collection: id, name: b.data.name } }),
    ]);
  } catch (e) {
    if (e instanceof Error && /UNIQUE/.test(e.message)) return error(409, 'name_taken', { detail: 'a collection with that name already exists' });
    throw e;
  }
  return json(summaryOf(p, (await loadCollection(env, p, id))!, 0), 201);
}

export async function collectionDetail(env: Env, p: Person, c: ColRow): Promise<Response> {
  const scopes = await viewerScopes(env, p);
  const rows = (await env.DB.prepare(
    `SELECT i.*, ci.added_by AS ci_added_by, ci.added_at AS ci_added_at, ci.note AS ci_note FROM collection_items ci JOIN items i ON i.id = ci.item_id
      WHERE ci.collection_id = ?5 AND ${visibleSql('i')} AND ${LIVE} ORDER BY ci.added_at DESC, i.id DESC LIMIT 1000`,
  ).bind(...visibleBinds(p, scopes), new Date().toISOString(), c.id).all<ItemRow & { ci_added_by: string; ci_added_at: string; ci_note: string | null }>()).results;
  const extras = await extrasFor(env, p, rows, scopes);
  const out: CollectionDetail = {
    ...summaryOf(p, c, rows.length),
    entries: rows.map((r) => ({ item: summary(r, extras.get(r.id)), addedBy: r.ci_added_by, addedAt: r.ci_added_at, note: r.ci_note })),
  };
  return json(out);
}

export async function patchCollection(request: Request, env: Env, p: Person, c: ColRow): Promise<Response> {
  if (!canEdit(p, c)) return error(403, 'not_permitted');
  const b = CollectionPatch.safeParse(await request.json().catch(() => null));
  if (!b.success) return error(400, 'invalid', { issues: issues(b.error) });
  try {
    await env.DB.batch([
      env.DB.prepare(`UPDATE collections SET name = COALESCE(?, name), description = COALESCE(?, description), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`)
        .bind(b.data.name ?? null, b.data.description ?? null, c.id),
      audit(env.DB, { workspaceId: p.workspaceId, actor: p.principalId, act: p.act, action: 'collection.renamed', detail: { collection: c.id, from: c.name, to: b.data.name ?? c.name } }),
    ]);
  } catch (e) {
    if (e instanceof Error && /UNIQUE/.test(e.message)) return error(409, 'name_taken', { detail: 'a collection with that name already exists' });
    throw e;
  }
  const now = (await loadCollection(env, p, c.id))!;
  const counts = await visibleCounts(env, p, await viewerScopes(env, p), [c.id]);
  return json(summaryOf(p, now, counts.get(c.id) ?? 0));
}

/** Its references go with it: an artifact kept only by this collection is then swept after 30 days (spec §12). */
export async function deleteCollection(env: Env, p: Person, c: ColRow): Promise<Response> {
  if (!canEdit(p, c)) return error(403, 'not_permitted');
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM item_references WHERE from_kind = 'collection' AND from_id = ?`).bind(c.id),
    env.DB.prepare(`DELETE FROM collection_items WHERE collection_id = ?`).bind(c.id),
    env.DB.prepare(`DELETE FROM collections WHERE id = ?`).bind(c.id),
    audit(env.DB, { workspaceId: p.workspaceId, actor: p.principalId, act: p.act, action: 'collection.deleted', detail: { collection: c.id, name: c.name } }),
  ]);
  return new Response(null, { status: 204 });
}

async function visibleLive(env: Env, p: Person, itemId: string): Promise<ItemRow | null> {
  const i = await loadItem(env, itemId);
  if (!i || i.revoked_at || isExpired(i)) return null;
  return canSee(p, i, await viewerScopes(env, p)) ? i : null;
}

/** Spec §12: membership is a reference, so the artifact is kept while it is in the collection. */
export async function addToCollection(request: Request, env: Env, p: Person, c: ColRow): Promise<Response> {
  const b = CollectionAdd.safeParse(await request.json().catch(() => null));
  if (!b.success) return error(400, 'invalid', { issues: issues(b.error) });
  const item = await visibleLive(env, p, b.data.itemId);
  if (!item) return error(404, 'not_found');
  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO collection_items (collection_id, item_id, note, added_by) VALUES (?, ?, ?, ?)`).bind(c.id, item.id, b.data.note ?? null, p.principalId),
    env.DB.prepare(`INSERT OR IGNORE INTO item_references (item_id, from_kind, from_id) VALUES (?, 'collection', ?)`).bind(item.id, c.id),
    env.DB.prepare(`UPDATE collections SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).bind(c.id),
    audit(env.DB, { workspaceId: p.workspaceId, actor: p.principalId, act: p.act, action: 'collection.item_added', itemId: item.id, detail: { collection: c.id } }),
  ]);
  return json({ added: true }, 201);
}

export async function removeFromCollection(env: Env, p: Person, c: ColRow, itemId: string): Promise<Response> {
  const item = await loadItem(env, itemId);
  if (!item || !canSee(p, item, await viewerScopes(env, p))) return error(404, 'not_found');
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM collection_items WHERE collection_id = ? AND item_id = ?`).bind(c.id, itemId),
    env.DB.prepare(`DELETE FROM item_references WHERE item_id = ? AND from_kind = 'collection' AND from_id = ?`).bind(itemId, c.id),
    env.DB.prepare(`UPDATE collections SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).bind(c.id),
    audit(env.DB, { workspaceId: p.workspaceId, actor: p.principalId, act: p.act, action: 'collection.item_removed', itemId, detail: { collection: c.id } }),
  ]);
  return new Response(null, { status: 204 });
}
