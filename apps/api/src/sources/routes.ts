import type { Env } from '../env';
import { error, json, preflight, withCors, type Handler } from '../http';
import { resolvePerson } from '../auth/caller';
import { VISIBLE_SQL, type ItemRow } from '../items/visibility';
import { summary } from '../items/routes';

const STATION_ITEMS = '/api/v1/sources/agentpod/items';

/** VISIBLE_SQL over `items i` joined to `item_sources`. Task B4 changes the rule in one place. */
const VISIBLE_I = VISIBLE_SQL.replace(/\bworkspace_id\b/g, 'i.workspace_id').replace(/\bscope\b/g, 'i.scope').replace(/\bcreated_by\b/g, 'i.created_by');

/** Source-side routes (lane A). Task A11 adds the Superpipeline webhook, Task A14 the backfill. */
export const sourceRoutes: Handler = async (request, env, _ctx, url) => {
  if (url.pathname !== STATION_ITEMS) return null;
  // The AgentPod console lists a station's links with the person's own token (ruling RA3).
  if (request.method === 'OPTIONS') return preflight(request, env.CONSOLE_ORIGINS, 'GET');
  if (request.method !== 'GET') return null;
  return withCors(request, env.CONSOLE_ORIGINS, await stationItems(request, env, url));
};

/** A station's live items the person can see (people only: the hub never acts for a person, R-H1). */
async function stationItems(request: Request, env: Env, url: URL): Promise<Response> {
  const p = await resolvePerson(request, env);
  if (p instanceof Response) return p;
  const station = url.searchParams.get('station') ?? '';
  if (station === '' || station.length > 100) return error(400, 'invalid', { detail: 'station is required' });
  const rows = await env.DB.prepare(
    `SELECT i.* FROM items i JOIN item_sources s ON s.item_id = i.id
      WHERE ${VISIBLE_I} AND s.source = 'agentpod' AND s.station = ?3
        AND i.revoked_at IS NULL AND (i.expires_at IS NULL OR i.expires_at > ?4)
      ORDER BY i.created_at DESC, i.id DESC LIMIT 200`,
  ).bind(p.workspaceId, p.principalId, station, new Date().toISOString()).all<ItemRow>();
  return json({ items: rows.results.map((r) => summary(r)) });
}
