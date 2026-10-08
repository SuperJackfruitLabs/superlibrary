import type { Manifest, View } from '@superlibrary/contract';
import type { Env } from '../env';

export async function sha256Hex(data: ArrayBuffer | Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Content addressing (spec §3): identical bytes are one object, whoever uploads them. */
export const blobKey = (sha256: string) => `blobs/${sha256}`;
/** What the content Worker reads instead of a database (plan D7). */
export const manifestKey = (itemId: string, version: number) => `manifests/${itemId}/${version}.json`;
/**
 * Bytes whose secret scan hit (spec §8, ruling T7/T8): private to one upload session, never in a
 * manifest, so never servable. Commit moves them to `blobKey` only after a recorded override.
 */
export const quarantineKey = (uploadId: string, sha256: string) => `quarantine/${uploadId}/${sha256}`;
/** Everything one session holds in quarantine, for deleting it when the session ends uncommitted. */
export const quarantinePrefix = (uploadId: string) => `quarantine/${uploadId}/`;

/**
 * After a recorded override, commit moves this session's flagged bytes from quarantine into
 * `blobs/` and empties the quarantine. Every quarantined SHA-256 is a declared file of the session
 * (a path's bytes must match its declared hash), so all of them belong to the version. Idempotent:
 * a retried commit finishes what a failed one left.
 */
export async function releaseQuarantine(env: Env, uploadId: string): Promise<void> {
  const held = (await env.BLOBS.list({ prefix: quarantinePrefix(uploadId) })).objects.map((o) => o.key);
  for (const key of held) {
    const sha = key.slice(quarantinePrefix(uploadId).length);
    if (await env.BLOBS.head(blobKey(sha))) continue;
    const q = await env.BLOBS.get(key);
    if (q) await env.BLOBS.put(blobKey(sha), await q.arrayBuffer(), { sha256: sha });
  }
  if (held.length > 0) await env.BLOBS.delete(held);
}

/**
 * Writes the manifest from D1. A revoked item or version gets none (spec §12: revocation is
 * immediate), so a retried commit or an expiry change can never bring a revoked version back.
 */
export async function writeManifest(env: Env, itemId: string, version: number): Promise<void> {
  const item = await env.DB.prepare(`SELECT expires_at, revoked_at FROM items WHERE id = ?`).bind(itemId).first<{ expires_at: string | null; revoked_at: string | null }>();
  const v = await env.DB.prepare(`SELECT entry, revoked_at FROM versions WHERE item_id = ? AND version = ?`).bind(itemId, version).first<{ entry: string; revoked_at: string | null }>();
  if (!item || !v) throw new Error(`no such version ${itemId}@${version}`);
  if (item.revoked_at || v.revoked_at) return deleteManifest(env, itemId, version);
  const rows = await env.DB.prepare(`SELECT path, sha256, bytes, media_type, view FROM version_files WHERE item_id = ? AND version = ? ORDER BY path`).bind(itemId, version).all<{ path: string; sha256: string; bytes: number; media_type: string; view: View }>();
  const manifest: Manifest = {
    itemId, version, entry: v.entry, expiresAt: item.expires_at,
    files: Object.fromEntries(rows.results.map((r) => [r.path, { sha256: r.sha256, bytes: r.bytes, mediaType: r.media_type, view: r.view }])),
  };
  await env.BLOBS.put(manifestKey(itemId, version), JSON.stringify(manifest), { httpMetadata: { contentType: 'application/json' } });
}

/** Revocation (spec §12) takes effect at once: without its manifest a version cannot be served. */
export async function deleteManifest(env: Env, itemId: string, version: number): Promise<void> {
  await env.BLOBS.delete(manifestKey(itemId, version));
}
