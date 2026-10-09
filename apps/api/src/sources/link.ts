import { checkPath, type LinkSource } from '@superlibrary/contract';
import type { Env } from '../env';
import { error } from '../http';
import { isHubService, type Uploader } from '../auth/caller';

/**
 * Plan P1/Task A10. The checks a station link gets on top of an upload's, or a refusal. Returns the
 * normalised source, or null when the upload has none (a person's own upload). Only the hub acting
 * for an agent may say where a file came from: trust keys on `via`, never on `act` (operator ruling
 * R-H1: the hub never acts for a person, so a person can never send a source).
 */
export function checkLinkSource(env: Env, p: Uploader, body: { source?: LinkSource; scope: string; item?: string; expiresAt?: string }): LinkSource | null | Response {
  const trusted = p.kind === 'agent' && isHubService(env, p.via);
  if (body.source && !trusted) return error(403, 'source_not_trusted', { detail: 'only the AgentPod hub may say where a file came from' });
  if (p.kind === 'agent') {
    if (!body.source) return error(400, 'source_required', { detail: 'an agent links files from its own workspace, with their source' });
    if (body.item || body.expiresAt) return error(400, 'invalid', { detail: 'an agent cannot choose the item or an expiry' });
  }
  if (!body.source) return null;
  const c = checkPath(body.source.path);
  if (!c.ok) return error(400, 'path_refused', { path: c.path, reason: c.reason, ...(c.rule ? { rule: c.rule } : {}) });
  if (body.scope !== `board:${body.source.board}`) return error(400, 'scope_mismatch', { detail: 'a linked file belongs to the board of its run' });
  return { ...body.source, path: c.path };
}

/**
 * Spec §3: linking the same path again creates version n+1. The live item (not revoked, not expired)
 * for this station path, if any; a revoked or expired one is never revived by a link, which starts a new item.
 */
export async function linkSessionItem(env: Env, workspaceId: string, source: LinkSource): Promise<string | null> {
  const row = await env.DB.prepare(
    `SELECT i.id FROM item_sources s JOIN items i ON i.id = s.item_id
      WHERE i.workspace_id = ?1 AND s.source = 'agentpod' AND s.station = ?2 AND s.source_path = ?3 AND i.revoked_at IS NULL
        AND (i.expires_at IS NULL OR i.expires_at > ?4)
      ORDER BY i.created_at DESC LIMIT 1`,
  ).bind(workspaceId, source.station, source.path, new Date().toISOString()).first<{ id: string }>();
  return row?.id ?? null;
}
