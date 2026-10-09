import type { WorkRecord, WorkRecordView } from '@superlibrary/contract';
import type { Env } from '../env';
import type { Person } from '../auth/caller';
import { audit } from '../audit';
import { error, json } from '../http';
import { canSee, loadItem, viewerScopes, visibleBinds, visibleSql, type ItemRow } from '../items/visibility';
import { extrasFor, summary } from '../items/routes';

/** The whole record, and the artifacts it links that the person can see. Invisible is 404 (D11). */
export async function recordView(env: Env, p: Person, id: string): Promise<Response> {
  const item = await loadItem(env, id);
  const scopes = item ? await viewerScopes(env, p) : [];
  if (!item || item.kind !== 'work-record' || !canSee(p, item, scopes)) return error(404, 'not_found');
  if (item.revoked_at) return error(410, 'revoked');
  const w = await env.DB.prepare(`SELECT body, board_id FROM work_records WHERE item_id = ?`).bind(id).first<{ body: string; board_id: string }>();
  if (!w) return error(404, 'not_found');
  const linked = (await env.DB.prepare(
    `SELECT i.* FROM item_references r JOIN items i ON i.id = r.item_id
      WHERE r.from_kind = 'work-record' AND r.from_id = ?5 AND ${visibleSql('i')}
        AND i.revoked_at IS NULL AND (i.expires_at IS NULL OR i.expires_at > ?4)
      ORDER BY i.created_at, i.id`,
  ).bind(...visibleBinds(p, scopes), new Date().toISOString(), id).all<ItemRow>()).results;
  const board = await env.DB.prepare(`SELECT name FROM source_boards WHERE workspace_id = ? AND board_id = ?`).bind(item.workspace_id, w.board_id).first<{ name: string }>();
  const extras = await extrasFor(env, p, [item, ...linked], scopes);
  await audit(env.DB, { workspaceId: p.workspaceId, actor: p.principalId, act: p.act, action: 'item.read', itemId: id, detail: { via: 'record' } }).run();
  const view: WorkRecordView = {
    item: summary(item, extras.get(item.id)),
    record: JSON.parse(w.body) as WorkRecord,
    artifacts: linked.map((a) => summary(a, extras.get(a.id))),
    boardName: board?.name ?? null,
  };
  return json(view);
}
