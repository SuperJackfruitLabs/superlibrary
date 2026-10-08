/**
 * Spec §8: 1 GB per workspace by default. Usage counts each distinct blob once per workspace,
 * across committed versions and uploads still open, so re-uploading the same bytes costs nothing.
 * Quarantined bytes (ruling T7/T8) are part of an open upload, so they count too.
 */
const USAGE = `
  SELECT sha256, bytes FROM version_files vf JOIN items i ON i.id = vf.item_id WHERE i.workspace_id = ?1
  UNION
  SELECT uf.sha256, uf.bytes FROM upload_files uf JOIN upload_sessions s ON s.id = uf.session_id WHERE s.workspace_id = ?1 AND s.state = 'open'`;

export async function workspaceUsage(db: D1Database, workspaceId: string): Promise<number> {
  const row = await db.prepare(`SELECT COALESCE(SUM(bytes), 0) AS used FROM (${USAGE})`).bind(workspaceId).first<{ used: number }>();
  return row?.used ?? 0;
}

/** Bytes these files add: those whose SHA-256 the workspace does not already hold. */
export async function newBytes(db: D1Database, workspaceId: string, files: { sha256: string; bytes: number }[]): Promise<number> {
  const held = await db
    .prepare(`SELECT DISTINCT sha256 FROM (${USAGE}) WHERE sha256 IN (SELECT value FROM json_each(?2))`)
    .bind(workspaceId, JSON.stringify([...new Set(files.map((f) => f.sha256))]))
    .all<{ sha256: string }>();
  const have = new Set(held.results.map((r) => r.sha256));
  const seen = new Set<string>();
  let total = 0;
  for (const f of files) {
    if (have.has(f.sha256) || seen.has(f.sha256)) continue;
    seen.add(f.sha256);
    total += f.bytes;
  }
  return total;
}
