import { checkPath, type LinkSource, type StationFile } from '@superlibrary/contract';
import type { Env } from '../env';
import { error } from '../http';
import { isHubService, type Uploader } from '../auth/caller';
import { hubStation, type HubStation } from '../clients/stations';

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
 * for this station path on this board, if any; a revoked or expired one is never revived by a link, which starts a new item.
 * The board is part of the match: the same path linked for another board is a new item in that board's scope, never a
 * version of the old board's item (an agent never changes scope, spec §4).
 */
export async function linkSessionItem(env: Env, workspaceId: string, source: LinkSource): Promise<string | null> {
  const row = await env.DB.prepare(
    `SELECT i.id FROM item_sources s JOIN items i ON i.id = s.item_id
      WHERE i.workspace_id = ?1 AND s.source = 'agentpod' AND s.station = ?2 AND s.source_path = ?3 AND s.board_id = ?5 AND i.revoked_at IS NULL
        AND (i.expires_at IS NULL OR i.expires_at > ?4)
      ORDER BY i.created_at DESC LIMIT 1`,
  ).bind(workspaceId, source.station, source.path, new Date().toISOString(), source.board).first<{ id: string }>();
  return row?.id ?? null;
}

/** A station file the hub confirmed is the person's: its id, the hub's readable key, the normalised path. */
export interface PersonStationFile { station: string; stationName: string; path: string }

/**
 * Gap S1: a person's link from their own station (the AgentPod console). R-H1 holds: this is the
 * person's own token, never the hub acting for them; Superlibrary itself asks the hub whose station
 * it is and records it only for its owner. Unknown and not-yours answer the same (no oracle).
 */
export async function checkStationFile(env: Env, p: Uploader, body: { stationFile?: StationFile; source?: LinkSource; item?: string }): Promise<PersonStationFile | null | Response> {
  if (!body.stationFile) return null;
  if (p.kind !== 'human') return error(400, 'invalid', { detail: 'an agent links through AgentPod, with its source' });
  if (body.source) return error(400, 'invalid', { detail: 'give a source or a station file, not both' });
  if (body.item) return error(400, 'invalid', { detail: 'a station file finds its own item' });
  const c = checkPath(body.stationFile.path);
  if (!c.ok) return error(400, 'path_refused', { path: c.path, reason: c.reason, ...(c.rule ? { rule: c.rule } : {}) });
  let st: HubStation | null;
  try {
    st = await hubStation(env, p.org, body.stationFile.station);
  } catch (e) {
    console.error('station check failed', e instanceof Error ? e.message : String(e));
    return error(502, 'hub_unreachable', { detail: 'AgentPod could not confirm the station; try again shortly' });
  }
  if (!st || st.owner !== p.principalId) return error(403, 'station_not_yours', { detail: 'Superlibrary records a station only for the person it belongs to' });
  return { station: st.id, stationName: st.key, path: c.path };
}

/** Spec §3 for a person's link: the same person, station, path and scope is the next version of their live item. */
export async function personStationItem(env: Env, workspaceId: string, prn: string, f: PersonStationFile, scope: string): Promise<string | null> {
  const row = await env.DB.prepare(
    `SELECT i.id FROM item_sources s JOIN items i ON i.id = s.item_id
      WHERE i.workspace_id = ?1 AND s.source = 'agentpod' AND s.linked_by = ?2 AND s.station = ?3 AND s.source_path = ?4 AND i.scope = ?5
        AND i.revoked_at IS NULL AND (i.expires_at IS NULL OR i.expires_at > ?6)
      ORDER BY i.created_at DESC LIMIT 1`,
  ).bind(workspaceId, prn, f.station, f.path, scope, new Date().toISOString()).first<{ id: string }>();
  return row?.id ?? null;
}
