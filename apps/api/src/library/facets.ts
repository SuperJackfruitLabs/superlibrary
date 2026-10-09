import type { Facets } from '@superlibrary/contract';
import type { Env } from '../env';
import type { Person } from '../auth/caller';
import { viewerScopes, visibleBinds, visibleSql } from '../items/visibility';

const LIVE = `i.revoked_at IS NULL AND (i.expires_at IS NULL OR i.expires_at > ?4)`;

/** What a person can filter by. Agents and stations come only from items they can see (spec §4). */
export async function facets(env: Env, p: Person): Promise<Facets> {
  const scopes = await viewerScopes(env, p);
  const vis = [...visibleBinds(p, scopes), new Date().toISOString()] as const;
  const boards = (await env.DB.prepare(`SELECT board_id AS id, name FROM source_boards WHERE workspace_id = ? ORDER BY name COLLATE NOCASE, board_id`)
    .bind(p.workspaceId).all<{ id: string; name: string }>()).results;
  const agents = (await env.DB.prepare(
    `SELECT DISTINCT s.agent_principal AS a FROM item_sources s JOIN items i ON i.id = s.item_id
      WHERE ${visibleSql('i')} AND ${LIVE} AND s.agent_principal IS NOT NULL ORDER BY 1 LIMIT 200`,
  ).bind(...vis).all<{ a: string }>()).results.map((r) => r.a);
  const stations = (await env.DB.prepare(
    `SELECT s.station AS id, MAX(s.station_name) AS name FROM item_sources s JOIN items i ON i.id = s.item_id
      WHERE ${visibleSql('i')} AND ${LIVE} AND s.station IS NOT NULL
      GROUP BY s.station ORDER BY COALESCE(MAX(s.station_name), s.station) COLLATE NOCASE LIMIT 200`,
  ).bind(...vis).all<{ id: string; name: string | null }>()).results;
  return { boards, agents, stations };
}
