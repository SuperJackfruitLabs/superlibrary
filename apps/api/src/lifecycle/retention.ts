/**
 * Lifecycle (spec §12): deleting an item, and the daily retention sweep the `retention` queue runs.
 * Expired items and abandoned uploads are deleted in every mode; unreferenced artifacts older than
 * 30 days only when RETENTION_MODE is `enforce` (plan D14), otherwise reported and audited.
 */
import { LIMITS } from '@superlibrary/contract';
import type { Env } from '../env';
import { audit } from '../audit';
import { itemChanged } from '../events';
import { blobKey, manifestKey } from '../storage/blobs';

export interface SweepReport {
  expired: string[];
  unreferenced: string[];
  deletedUnreferenced: boolean;
  abandonedUploads: string[];
  deletedBlobs: string[];
  /** Committed or vanished upload sessions whose leftover quarantine was emptied (ruling T10). */
  clearedQuarantines: string[];
}

const ACTOR = 'retention';

/** Every key under a prefix, across pages. */
async function keysUnder(env: Env, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.BLOBS.list({ prefix, cursor });
    keys.push(...page.objects.map((o) => o.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return keys;
}

async function deleteKeys(env: Env, keys: string[]): Promise<void> {
  // R2 deletes at most 1000 keys per call.
  for (let i = 0; i < keys.length; i += 1000) await env.BLOBS.delete(keys.slice(i, i + 1000));
}

/** Delete each blob nothing else uses: no version anywhere, no upload still declaring it. */
async function deleteOrphanBlobs(env: Env, shas: string[]): Promise<string[]> {
  const gone: string[] = [];
  for (const sha of new Set(shas)) {
    const used = await env.DB.prepare(`SELECT 1 FROM version_files WHERE sha256 = ?1 UNION SELECT 1 FROM upload_files WHERE sha256 = ?1 LIMIT 1`).bind(sha).first();
    if (used) continue;
    await env.BLOBS.delete(blobKey(sha));
    gone.push(sha);
  }
  return gone;
}

/**
 * Spec §12 "Deletion removes everything": manifests, rows, and bytes no other version shares.
 * Rows go children first (D1 enforces foreign keys). Returns the SHA-256 of each blob deleted.
 */
export async function deleteItem(env: Env, itemId: string, actor: string, reason: string): Promise<string[]> {
  const item = await env.DB.prepare(`SELECT workspace_id FROM items WHERE id = ?`).bind(itemId).first<{ workspace_id: string }>();
  if (!item) return [];
  const files = (await env.DB.prepare(`SELECT sha256 FROM version_files WHERE item_id = ?`).bind(itemId).all<{ sha256: string }>()).results;
  const versions = (await env.DB.prepare(`SELECT version FROM versions WHERE item_id = ?`).bind(itemId).all<{ version: number }>()).results;
  // Manifests first: from this moment the content origin refuses every version.
  await deleteKeys(env, versions.map((v) => manifestKey(itemId, v.version)));
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM version_files WHERE item_id = ?`).bind(itemId),
    env.DB.prepare(`DELETE FROM versions WHERE item_id = ?`).bind(itemId),
    // Also the references a deleted work record held: once its card's record is gone, an artifact
    // is no longer referenced by it (spec §12).
    env.DB.prepare(`DELETE FROM item_references WHERE item_id = ? OR (from_kind = 'work-record' AND from_id = ?)`).bind(itemId, itemId),
    env.DB.prepare(`DELETE FROM item_sources WHERE item_id = ?`).bind(itemId),
    env.DB.prepare(`DELETE FROM work_records WHERE item_id = ?`).bind(itemId),
    env.DB.prepare(`DELETE FROM items WHERE id = ?`).bind(itemId),
    audit(env.DB, { workspaceId: item.workspace_id, actor, action: 'item.deleted', itemId, detail: { reason } }),
  ]);
  await itemChanged(env, itemId, item.workspace_id, 'deleted');
  return deleteOrphanBlobs(env, files.map((f) => f.sha256));
}

/**
 * An upload never committed, past its 24 hours: its rows and the bytes only it held. Its
 * quarantine is emptied by `clearLeftoverQuarantine` later in the same sweep, as for any session
 * that no longer exists.
 */
async function deleteAbandonedUpload(env: Env, id: string): Promise<string[]> {
  const shas = (await env.DB.prepare(`SELECT sha256 FROM upload_files WHERE session_id = ?`).bind(id).all<{ sha256: string }>()).results.map((r) => r.sha256);
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM upload_files WHERE session_id = ?`).bind(id),
    env.DB.prepare(`DELETE FROM secret_findings WHERE session_id = ?`).bind(id),
    env.DB.prepare(`DELETE FROM upload_sessions WHERE id = ?`).bind(id),
  ]);
  return deleteOrphanBlobs(env, shas);
}

/**
 * Quarantine of every session that is over (ruling T10; Task 8 review minors 1 and 5): an abandoned
 * one just deleted, or a committed one left with some by a PUT that raced the commit or a crash
 * between the commit batch and publish. For a committed session, a
 * held SHA-256 that its version lists but `blobs/` lacks is moved there first (what the commit's
 * own retry would do), so clearing never loses a committed version's bytes. Anything else is
 * deleted. A session still open is left alone: it is in use, or not yet past its 24 hours.
 */
async function clearLeftoverQuarantine(env: Env): Promise<string[]> {
  const cleared: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.BLOBS.list({ prefix: 'quarantine/', delimiter: '/', cursor });
    for (const prefix of page.delimitedPrefixes) {
      const id = prefix.slice('quarantine/'.length, -1);
      const s = await env.DB.prepare(`SELECT state, result_item_id, result_version FROM upload_sessions WHERE id = ?`).bind(id)
        .first<{ state: 'open' | 'committed'; result_item_id: string | null; result_version: number | null }>();
      if (s?.state === 'open') continue;
      const keys = await keysUnder(env, prefix);
      if (s) {
        for (const key of keys) {
          const sha = key.slice(prefix.length);
          const held = await env.DB.prepare(`SELECT 1 FROM version_files WHERE item_id = ? AND version = ? AND sha256 = ? LIMIT 1`).bind(s.result_item_id, s.result_version, sha).first();
          if (!held || (await env.BLOBS.head(blobKey(sha)))) continue;
          const q = await env.BLOBS.get(key);
          if (q) await env.BLOBS.put(blobKey(sha), await q.arrayBuffer(), { sha256: sha });
        }
      }
      await deleteKeys(env, keys);
      cleared.push(id);
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return cleared;
}

/**
 * Spec §12: an artifact nothing references, whose newest version is older than the cutoff (`?1`,
 * SQLite's `YYYY-MM-DD HH:MM:SS`). Counted from the last version, not the item's creation, so an
 * item with a version added yesterday is not deleted whole.
 */
const STALE = `i.kind = 'artifact'
  AND COALESCE((SELECT MAX(v.created_at) FROM versions v WHERE v.item_id = i.id), i.created_at) <= ?1
  AND NOT EXISTS (SELECT 1 FROM item_references r WHERE r.item_id = i.id)`;

/**
 * Order matters (PR 2 review): the bounded cleanups that must always happen (abandoned uploads,
 * quarantine, expired items) run before the stale step, whose size grows with the library, so a
 * stale step that fails or runs out of budget can never starve them.
 */
export async function sweep(env: Env, now: number): Promise<SweepReport> {
  const nowIso = new Date(now).toISOString();
  const report: SweepReport = {
    expired: [], unreferenced: [], deletedUnreferenced: env.RETENTION_MODE === 'enforce', abandonedUploads: [], deletedBlobs: [], clearedQuarantines: [],
  };

  // Uploads never committed, past their 24 hours (session `expires_at` is ISO).
  const abandoned = await env.DB.prepare(`SELECT id FROM upload_sessions WHERE state = 'open' AND expires_at <= ?`).bind(nowIso).all<{ id: string }>();
  for (const { id } of abandoned.results) {
    report.deletedBlobs.push(...(await deleteAbandonedUpload(env, id)));
    report.abandonedUploads.push(id);
  }
  report.clearedQuarantines = await clearLeftoverQuarantine(env);

  // Expiry is a person's explicit choice: honoured in both modes.
  const expired = await env.DB.prepare(`SELECT id FROM items WHERE expires_at IS NOT NULL AND expires_at <= ?`).bind(nowIso).all<{ id: string }>();
  for (const { id } of expired.results) {
    report.expired.push(id);
    report.deletedBlobs.push(...(await deleteItem(env, id, ACTOR, 'expired')));
  }

  // Unreferenced after 30 days (spec §12). Enforced only in "enforce" (plan D14).
  const cutoff = new Date(now - LIMITS.retentionDays * 86_400_000).toISOString().replace('T', ' ').slice(0, 19);
  const stale = await env.DB.prepare(`SELECT i.id FROM items i WHERE ${STALE}`).bind(cutoff).all<{ id: string }>();
  report.unreferenced = stale.results.map((r) => r.id);
  if (report.deletedUnreferenced) {
    for (const id of report.unreferenced) report.deletedBlobs.push(...(await deleteItem(env, id, ACTOR, 'unreferenced for 30 days')));
  } else {
    // One statement, and each item recorded once however many days it stays stale.
    await env.DB.prepare(
      `INSERT INTO audit_events (id, workspace_id, actor, action, item_id)
       SELECT 'aud_' || lower(hex(randomblob(8))), i.workspace_id, ?2, 'retention.would_delete', i.id FROM items i
       WHERE ${STALE}
         AND NOT EXISTS (SELECT 1 FROM audit_events a WHERE a.item_id = i.id AND a.action = 'retention.would_delete')`,
    ).bind(cutoff, ACTOR).run();
  }

  console.log('retention sweep', JSON.stringify({
    mode: env.RETENTION_MODE, expired: report.expired.length, unreferenced: report.unreferenced.length,
    abandoned: report.abandonedUploads.length, blobs: report.deletedBlobs.length, quarantines: report.clearedQuarantines.length,
  }));
  return report;
}
