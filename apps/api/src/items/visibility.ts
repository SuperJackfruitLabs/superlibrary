import type { Env } from '../env';
import type { Person, Viewer } from '../auth/caller';
import { rosterBoards } from '../clients/roster';

export interface ItemRow {
  id: string; workspace_id: string; kind: 'artifact' | 'work-record'; title: string; scope: string; outcome: string;
  created_by: string; latest_version: number; expires_at: string | null; revoked_at: string | null; created_at: string;
}

export const loadItem = (env: Env, id: string) => env.DB.prepare(`SELECT * FROM items WHERE id = ?`).bind(id).first<ItemRow>();

/**
 * Spec §4, one definition for search, get, related and the prompt. A scope list, computed once per
 * request: people see the workspace's known boards (plan P4); their own items come from the created_by rule; agents their
 * roster. The SQL below says the same thing, and visibility-v2.test.ts ('visibleSql and canSee agree') holds them together.
 */
export async function viewerScopes(env: Env, v: Viewer): Promise<string[]> {
  if (v.kind === 'agent') return ['workspace', ...(await rosterBoards(env, v)).map((b) => `board:${b}`)];
  // Their own items stay visible by the created_by rule in canSee and visibleSql, not by scope.
  const boards = (await env.DB.prepare(`SELECT 'board:' || board_id AS s FROM source_boards WHERE workspace_id = ?`).bind(v.workspaceId).all<{ s: string }>()).results.map((r) => r.s);
  return ['workspace', ...boards];
}

export function canSee(v: Viewer, item: ItemRow, scopes: string[]): boolean {
  if (item.workspace_id !== v.workspaceId) return false;
  if (item.scope === 'workspace') return true;
  if (v.kind === 'human' && item.created_by === v.principalId) return true;
  return scopes.includes(item.scope);
}

/** `?1` workspace, `?2` JSON scopes, `?3` the person's prn ('' for an agent: no own-item rule). */
export const visibleSql = (a: string) =>
  `(${a}.workspace_id = ?1 AND (${a}.scope IN (SELECT value FROM json_each(?2)) OR (?3 <> '' AND ${a}.created_by = ?3)))`;
export const visibleBinds = (v: Viewer, scopes: string[]) => [v.workspaceId, JSON.stringify(scopes), v.kind === 'human' ? v.principalId : ''] as const;

/** Phase 1's rule, kept only for sources/routes.ts until Task I3 moves it to visibleSql. Stricter, never wider. */
export const VISIBLE_SQL = `workspace_id = ?1 AND (scope = 'workspace' OR created_by = ?2)`;

/** Revoke and expire (spec §12, plan D12): the uploader, or an owner of the workspace. */
export function canManage(p: Person, item: ItemRow, scopes: string[] = []): boolean {
  return canSee(p, item, scopes) && (item.created_by === p.principalId || p.role === 'owner');
}

export const audienceOf = (i: ItemRow): 'uploader' | 'board' | 'workspace' =>
  i.scope === 'workspace' ? 'workspace' : 'board';

export function isExpired(item: ItemRow, now = Date.now()): boolean {
  return item.expires_at !== null && Date.parse(item.expires_at) <= now;
}
