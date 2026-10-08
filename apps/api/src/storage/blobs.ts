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
