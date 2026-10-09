import { OUTCOMES, type BrowsePage, type BrowseQuery, type OutcomeCounts } from '@superlibrary/contract';
import type { Env } from '../env';
import type { Person } from '../auth/caller';
import { audit } from '../audit';
import { viewerScopes, visibleBinds, visibleSql, type ItemRow } from '../items/visibility';
import { extrasFor, summary } from '../items/routes';
import { activitySql, extraFilterBind, extraFilterSql } from './filters';

/** `<activity>|<item id>`, exactly as this server writes it; anything else is refused, never interpolated. */
const CURSOR = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\|(itm_[0-9a-f]{16})$/;
export class BadCursor extends Error {}

export async function browse(env: Env, p: Person, q: BrowseQuery): Promise<BrowsePage> {
  let after: [string | null, string | null] = [null, null];
  if (q.cursor) {
    const m = CURSOR.exec(q.cursor);
    if (!m) throw new BadCursor('cursor');
    after = [m[1]!, m[2]!];
  }
  const scopes = await viewerScopes(env, p);
  // ?1-?3 visibility (spec §4, first), ?4 now, ?5 kinds, ?6 board scope, ?7 collection, ?8 agent/station/activity.
  const where = `${visibleSql('i')} AND i.revoked_at IS NULL AND (i.expires_at IS NULL OR i.expires_at > ?4)
    AND (?5 IS NULL OR i.kind IN (SELECT value FROM json_each(?5)))
    AND (?6 IS NULL OR i.scope = ?6)
    AND (?7 IS NULL OR EXISTS (SELECT 1 FROM collection_items ci WHERE ci.item_id = i.id AND ci.collection_id = ?7))
    ${extraFilterSql('i', 8)}`;
  const binds = [
    ...visibleBinds(p, scopes), new Date().toISOString(), q.kinds ? JSON.stringify(q.kinds) : null,
    q.board ? `board:${q.board}` : null, q.collection ?? null, extraFilterBind(q),
  ] as const;
  const act = activitySql('i');
  const rows = (await env.DB.prepare(
    `SELECT i.*, ${act} AS activity_at FROM items i WHERE ${where}
       AND (?9 IS NULL OR i.outcome IN (SELECT value FROM json_each(?9)))
       AND (?10 IS NULL OR ${act} < ?10 OR (${act} = ?10 AND i.id < ?11))
     ORDER BY activity_at DESC, i.id DESC LIMIT ?12`,
  ).bind(...binds, q.outcomes ? JSON.stringify(q.outcomes) : null, after[0], after[1], q.limit + 1).all<ItemRow & { activity_at: string }>()).results;
  // Counts use the same filters without the outcome filter: what each outcome tab would show.
  const counted = (await env.DB.prepare(`SELECT i.outcome AS outcome, COUNT(*) AS n FROM items i WHERE ${where} GROUP BY i.outcome`)
    .bind(...binds).all<{ outcome: string; n: number }>()).results;
  const counts = Object.fromEntries(OUTCOMES.map((o) => [o, 0])) as OutcomeCounts;
  for (const c of counted) if (c.outcome in counts) counts[c.outcome as keyof OutcomeCounts] = c.n;
  const page = rows.slice(0, q.limit);
  const extras = await extrasFor(env, p, page, scopes);
  const last = page.at(-1);
  await audit(env.DB, { workspaceId: p.workspaceId, actor: p.principalId, act: p.act, action: 'items.browsed', detail: { count: page.length } }).run();
  return {
    items: page.map((i) => summary(i, extras.get(i.id))),
    next: rows.length > q.limit && last ? `${last.activity_at}|${last.id}` : null,
    counts,
  };
}
