import type { Env } from '../env';
import type { Person } from '../auth/caller';

export interface ItemRow {
  id: string; workspace_id: string; kind: 'artifact' | 'work-record'; title: string; scope: string; outcome: string;
  created_by: string; latest_version: number; expires_at: string | null; revoked_at: string | null; created_at: string;
}

export const loadItem = (env: Env, id: string) => env.DB.prepare(`SELECT * FROM items WHERE id = ?`).bind(id).first<ItemRow>();

/**
 * Spec §4 for people, phase 1 (plan D11): a member sees `workspace` items; a board item only if
 * they uploaded it, until phase 3 asks Superpipeline which boards they can read. This is the one
 * definition: the list query below says the same thing in SQL and a test holds them together.
 */
export function canSee(p: Person, item: ItemRow): boolean {
  return item.workspace_id === p.workspaceId && (item.scope === 'workspace' || item.created_by === p.principalId);
}
export const VISIBLE_SQL = `workspace_id = ?1 AND (scope = 'workspace' OR created_by = ?2)`;

/** Revoke and expire (spec §12, plan D12): the uploader, or an owner of the workspace. */
export function canManage(p: Person, item: ItemRow): boolean {
  return canSee(p, item) && (item.created_by === p.principalId || p.role === 'owner');
}

export function isExpired(item: ItemRow, now = Date.now()): boolean {
  return item.expires_at !== null && Date.parse(item.expires_at) <= now;
}
