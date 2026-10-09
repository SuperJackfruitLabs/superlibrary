/**
 * Spec §11 filters beyond kind, outcome and board, as SQL over an `items` alias. One JSON bind
 * (`?n`) carries all four, so each caller keeps its own numbering and never shifts the others'.
 */
export interface ExtraFilters { agent?: string | undefined; station?: string | undefined; since?: string | undefined; until?: string | undefined }

/** An item's last activity (decision O4): a card's last update, else its newest version, else its creation. */
export const activitySql = (a: string) =>
  `datetime(COALESCE((SELECT w.source_updated_at FROM work_records w WHERE w.item_id = ${a}.id), (SELECT MAX(v.created_at) FROM versions v WHERE v.item_id = ${a}.id), ${a}.created_at))`;

export function extraFilterSql(a: string, n: number): string {
  const p = (k: string) => `json_extract(?${n}, '$.${k}')`;
  return `AND (${p('agent')} IS NULL OR EXISTS (SELECT 1 FROM item_sources s WHERE s.item_id = ${a}.id AND s.agent_principal = ${p('agent')}))
    AND (${p('station')} IS NULL OR EXISTS (SELECT 1 FROM item_sources s WHERE s.item_id = ${a}.id AND (s.station = ${p('station')} OR s.station_name = ${p('station')})))
    AND (${p('since')} IS NULL OR ${activitySql(a)} >= datetime(${p('since')}))
    AND (${p('until')} IS NULL OR ${activitySql(a)} < datetime(${p('until')}))`;
}

export const extraFilterBind = (q: ExtraFilters) =>
  JSON.stringify({ agent: q.agent ?? null, station: q.station ?? null, since: q.since ?? null, until: q.until ?? null });
