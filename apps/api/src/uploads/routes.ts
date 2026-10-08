/**
 * Upload sessions (plan D16): declare the files, send each one, commit (Task 8). Every declared
 * and every sent path goes through `checkPath`, and rows are keyed on its normalised form.
 */
import { z } from 'zod';
import { LIMITS, UploadCreate, checkPath, type CommitResult } from '@superlibrary/contract';
import type { Env } from '../env';
import { error, json, type Handler } from '../http';
import { newId } from '../ids';
import { audit } from '../audit';
import { resolvePerson, type Person } from '../auth/caller';
import { decodeText, sniff } from '../guard/sniff';
import { scanText } from '../guard/secrets';
import { committedUsage, newBytes, newCommittedBytes, workspaceUsage } from '../guard/limits';
import { blobKey, quarantineKey, releaseQuarantine, sha256Hex, writeManifest } from '../storage/blobs';

export interface SessionRow {
  id: string; workspace_id: string; created_by: string; item_id: string | null; title: string; scope: string;
  entry: string; item_expires_at: string | null; expires_at: string; state: 'open' | 'committed';
  result_item_id: string | null; result_version: number | null;
  override_reason: string | null; override_by: string | null; override_at: string | null; created_at: string;
}

/** One declared file as Task 8's commit reads it. `quarantined` 1: its bytes are at `quarantineKey`. */
export interface UploadFileRow {
  session_id: string; path: string; sha256: string; bytes: number; received: number;
  media_type: string | null; view: string | null; quarantined: number;
}

/** Ruling T8: the shallowest index.html, then the shallowest README.md, then the first path. */
function defaultEntry(paths: string[]): string {
  const sorted = [...paths].sort();
  const depth = (p: string) => p.split('/').length;
  const shallowest = (name: string) =>
    sorted.filter((p) => p.split('/').pop()!.toLowerCase() === name).sort((a, b) => depth(a) - depth(b))[0];
  return shallowest('index.html') ?? shallowest('readme.md') ?? sorted[0]!;
}

const refusePath = (c: { path: string; reason: string; rule?: string }) =>
  error(400, 'path_refused', { path: c.path, reason: c.reason, ...(c.rule ? { rule: c.rule } : {}) });

/** The caller's own session, or a refusal. Someone else's session is 404, not 403. */
export async function ownSession(env: Env, p: Person, id: string): Promise<SessionRow | Response> {
  const s = await env.DB.prepare(`SELECT * FROM upload_sessions WHERE id = ? AND workspace_id = ? AND created_by = ?`).bind(id, p.workspaceId, p.principalId).first<SessionRow>();
  if (!s) return error(404, 'not_found');
  if (s.state === 'open' && Date.parse(s.expires_at) <= Date.now()) return error(410, 'upload_expired');
  return s;
}

async function create(request: Request, env: Env, p: Person): Promise<Response> {
  const parsed = UploadCreate.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return error(400, 'invalid', { issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
  const body = parsed.data;
  // One stored form, and the same refusal PATCH gives (Task 10).
  const itemExpiresAt = body.expiresAt ? new Date(body.expiresAt).toISOString() : null;
  if (itemExpiresAt && Date.parse(itemExpiresAt) <= Date.now()) return error(400, 'invalid', { detail: 'expiresAt must be in the future' });

  const files: { path: string; bytes: number; sha256: string }[] = [];
  const seen = new Set<string>();
  for (const f of body.files) {
    const c = checkPath(f.path);
    if (!c.ok) return refusePath(c);
    if (seen.has(c.path)) return error(400, 'duplicate_path', { path: c.path });
    seen.add(c.path);
    files.push({ ...f, path: c.path });
  }
  if (files.length > LIMITS.folderFiles) return error(413, 'too_many_files', { limit: LIMITS.folderFiles });
  const tooBig = files.find((f) => f.bytes > LIMITS.fileBytes);
  if (tooBig) return error(413, 'file_too_large', { path: tooBig.path, limit: LIMITS.fileBytes });
  if (files.reduce((n, f) => n + f.bytes, 0) > LIMITS.folderBytes) return error(413, 'folder_too_large', { limit: LIMITS.folderBytes });

  let entry = defaultEntry(files.map((f) => f.path));
  if (body.entry) {
    const c = checkPath(body.entry);
    if (!c.ok || !seen.has(c.path)) return error(400, 'entry_not_found', { entry: body.entry });
    entry = c.path;
  }
  if (body.item) {
    const item = await env.DB.prepare(`SELECT created_by, revoked_at FROM items WHERE id = ? AND workspace_id = ?`).bind(body.item, p.workspaceId).first<{ created_by: string; revoked_at: string | null }>();
    if (!item || (item.created_by !== p.principalId && p.role !== 'owner')) return error(404, 'not_found');
    if (item.revoked_at) return error(410, 'revoked');
  }
  const quota = (await env.DB.prepare(`SELECT quota_bytes FROM workspaces WHERE id = ?`).bind(p.workspaceId).first<{ quota_bytes: number }>())?.quota_bytes ?? LIMITS.workspaceBytes;
  const used = await workspaceUsage(env.DB, p.workspaceId);
  if (used + (await newBytes(env.DB, p.workspaceId, files)) > quota) return error(413, 'quota_exceeded', { limit: quota, used });

  const id = newId('upl');
  const expiresAt = new Date(Date.now() + LIMITS.uploadTtlHours * 3600_000).toISOString();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO upload_sessions (id, workspace_id, created_by, item_id, title, scope, entry, item_expires_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, p.workspaceId, p.principalId, body.item ?? null, body.title, body.scope, entry, itemExpiresAt, expiresAt),
    ...files.map((f) => env.DB.prepare(`INSERT INTO upload_files (session_id, path, sha256, bytes) VALUES (?, ?, ?, ?)`).bind(id, f.path, f.sha256, f.bytes)),
    audit(env.DB, { workspaceId: p.workspaceId, actor: p.principalId, act: p.act, action: 'upload.created', detail: { uploadId: id, files: files.length } }),
  ]);
  return json({ uploadId: id, expiresAt, entry }, 201);
}

async function put(request: Request, env: Env, p: Person, id: string, url: URL): Promise<Response> {
  const s = await ownSession(env, p, id);
  if (s instanceof Response) return s;
  if (s.state !== 'open') return error(409, 'already_committed');
  // URLSearchParams has decoded `?path=` once; it is never decoded again, only normalised.
  const c = checkPath(url.searchParams.get('path') ?? '');
  if (!c.ok) return refusePath(c);
  const path = c.path;
  const f = await env.DB.prepare(`SELECT sha256, bytes FROM upload_files WHERE session_id = ? AND path = ?`).bind(id, path).first<{ sha256: string; bytes: number }>();
  if (!f) return error(404, 'not_declared', { path });
  const announced = Number(request.headers.get('content-length') ?? NaN);
  if (Number.isFinite(announced) && announced !== f.bytes) return error(400, 'size_mismatch', { path });
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length !== f.bytes) return error(400, 'size_mismatch', { path });
  if ((await sha256Hex(bytes)) !== f.sha256) return error(400, 'sha256_mismatch', { path });

  const sniffed = sniff(bytes, path);
  const findings = sniffed.text && sniffed.encoding ? scanText(decodeText(bytes, sniffed.encoding)) : [];
  // Spec §8: scanned before storing. A hit never reaches blobs/ (ruling T7/T8): it waits in this
  // session's quarantine for an override at commit, or is deleted with the session.
  const quarantined = findings.length > 0;
  if (quarantined) await env.BLOBS.put(quarantineKey(id, f.sha256), bytes, { sha256: f.sha256 });
  else if (!(await env.BLOBS.head(blobKey(f.sha256)))) await env.BLOBS.put(blobKey(f.sha256), bytes, { sha256: f.sha256 });
  await env.DB.batch([
    env.DB.prepare(`UPDATE upload_files SET received = 1, media_type = ?, view = ?, quarantined = ? WHERE session_id = ? AND path = ?`)
      .bind(sniffed.mediaType, sniffed.view, quarantined ? 1 : 0, id, path),
    env.DB.prepare(`DELETE FROM secret_findings WHERE session_id = ? AND path = ?`).bind(id, path),
    ...findings.map((x) => env.DB.prepare(`INSERT OR IGNORE INTO secret_findings (session_id, path, line, rule) VALUES (?, ?, ?, ?)`).bind(id, path, x.line, x.rule)),
    // An override covers the findings it was shown (and recorded); a new hit needs a new one.
    ...(quarantined ? [env.DB.prepare(`UPDATE upload_sessions SET override_reason = NULL, override_by = NULL, override_at = NULL WHERE id = ?`).bind(id)] : []),
  ]);
  return json({ path, mediaType: sniffed.mediaType, view: sniffed.view, findings });
}

const UPLOAD = /^\/api\/v1\/uploads\/(upl_[0-9a-f]{16})(\/files|\/override|\/commit)?$/;

export const uploadRoutes: Handler = async (request, env, _ctx, url) => {
  if (url.pathname === '/api/v1/uploads' && request.method === 'POST') {
    const p = await resolvePerson(request, env);
    return p instanceof Response ? p : create(request, env, p);
  }
  const m = UPLOAD.exec(url.pathname);
  if (!m) return null;
  const p = await resolvePerson(request, env);
  if (p instanceof Response) return p;
  const [, id, action] = m as unknown as [string, string, string | undefined];
  if (action === '/files' && request.method === 'PUT') return put(request, env, p, id, url);
  if (action === '/override' && request.method === 'POST') return overrideScan(request, env, p, id);
  if (action === '/commit' && request.method === 'POST') return commit(env, p, id);
  return error(405, 'method_not_allowed');
};

const OverrideBody = z.object({ reason: z.string().trim().min(1).max(500) });

async function findingsOf(env: Env, id: string) {
  return (await env.DB.prepare(`SELECT path, line, rule FROM secret_findings WHERE session_id = ? ORDER BY path, line, rule`).bind(id).all<{ path: string; line: number; rule: string }>()).results;
}

async function overrideScan(request: Request, env: Env, p: Person, id: string): Promise<Response> {
  const s = await ownSession(env, p, id);
  if (s instanceof Response) return s;
  if (s.state !== 'open') return error(409, 'already_committed');
  const parsed = OverrideBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return error(400, 'invalid', { detail: 'a reason is required' });
  const findings = await findingsOf(env, id);
  if (findings.length === 0) return error(409, 'nothing_to_override');
  await env.DB.batch([
    env.DB.prepare(`UPDATE upload_sessions SET override_reason = ?, override_by = ?, override_at = datetime('now') WHERE id = ?`).bind(parsed.data.reason, p.principalId, id),
    // Spec §8: "The override is recorded." Who, why, and exactly what was waved through.
    audit(env.DB, { workspaceId: p.workspaceId, actor: p.principalId, act: p.act, action: 'scan.overridden', detail: { uploadId: id, reason: parsed.data.reason, findings } }),
  ]);
  return json({ overridden: true });
}

async function resultOf(env: Env, itemId: string, version: number): Promise<CommitResult> {
  const v = await env.DB.prepare(`SELECT sha256, media_type, total_bytes FROM versions WHERE item_id = ? AND version = ?`).bind(itemId, version).first<{ sha256: string; media_type: string; total_bytes: number }>();
  return { itemId, version, url: `${env.APP_URL}/a/${itemId}`, sha256: v!.sha256, mediaType: v!.media_type, bytes: v!.total_bytes };
}

/**
 * Bytes before manifest: the flagged bytes reach blobs/ only once D1 holds the version, and the
 * manifest (what makes a version servable) is written last. Each step is idempotent, so a commit
 * that failed between them is finished by its retry.
 */
async function publish(env: Env, uploadId: string, itemId: string, version: number): Promise<void> {
  await releaseQuarantine(env, uploadId);
  await writeManifest(env, itemId, version);
}

async function committed(env: Env, s: SessionRow): Promise<Response> {
  // Idempotent: a retried commit answers the first one's result and repairs what it left undone.
  await publish(env, s.id, s.result_item_id!, s.result_version!);
  return json(await resultOf(env, s.result_item_id!, s.result_version!), 200);
}

async function commit(env: Env, p: Person, id: string): Promise<Response> {
  const s = await ownSession(env, p, id);
  if (s instanceof Response) return s;
  if (s.state === 'committed') return committed(env, s);
  const files = (await env.DB.prepare(`SELECT path, sha256, bytes, received, media_type, view FROM upload_files WHERE session_id = ? ORDER BY path`).bind(id).all<{ path: string; sha256: string; bytes: number; received: number; media_type: string | null; view: string | null }>()).results;
  const missing = files.filter((f) => !f.received).map((f) => f.path);
  if (missing.length > 0) return error(409, 'incomplete', { missing });
  // Refused: nothing is written. The flagged bytes stay in this session's private quarantine,
  // so an override can follow without a re-upload; retention deletes them if none does.
  const findings = await findingsOf(env, id);
  if (findings.length > 0 && !s.override_reason) return error(422, 'secret_found', { findings });

  // Ruling T8: the declare-time check counted declarations; this one counts what is committed.
  const quota = (await env.DB.prepare(`SELECT quota_bytes FROM workspaces WHERE id = ?`).bind(p.workspaceId).first<{ quota_bytes: number }>())?.quota_bytes ?? LIMITS.workspaceBytes;
  const used = await committedUsage(env.DB, p.workspaceId);
  if (used + (await newCommittedBytes(env.DB, p.workspaceId, files)) > quota) return error(413, 'quota_exceeded', { limit: quota, used });

  let itemId: string;
  let version: number;
  const statements: D1PreparedStatement[] = [];
  if (s.item_id) {
    const item = await env.DB.prepare(`SELECT latest_version, revoked_at FROM items WHERE id = ? AND workspace_id = ?`).bind(s.item_id, p.workspaceId).first<{ latest_version: number; revoked_at: string | null }>();
    if (!item) return error(404, 'not_found');
    if (item.revoked_at) return error(410, 'revoked');
    itemId = s.item_id;
    version = item.latest_version + 1;
  } else {
    itemId = newId('itm');
    version = 1;
  }
  // First in the batch: a second commit of this same session fails here (migration 0003).
  statements.push(env.DB.prepare(`UPDATE upload_sessions SET state = 'committed', result_item_id = ?, result_version = ? WHERE id = ?`).bind(itemId, version, id));
  if (s.item_id) {
    statements.push(env.DB.prepare(`UPDATE items SET latest_version = ?, title = ? WHERE id = ? AND latest_version = ?`).bind(version, s.title, itemId, version - 1));
  } else {
    statements.push(
      env.DB.prepare(`INSERT INTO items (id, workspace_id, kind, title, scope, created_by, latest_version, expires_at) VALUES (?, ?, 'artifact', ?, ?, ?, 1, ?)`)
        .bind(itemId, p.workspaceId, s.title, s.scope, p.principalId, s.item_expires_at),
      audit(env.DB, { workspaceId: p.workspaceId, actor: p.principalId, act: p.act, action: 'item.created', itemId }),
    );
  }
  const entry = files.find((f) => f.path === s.entry)!;
  // Spec §3: a file is addressed by its SHA-256; a folder by the SHA-256 of its (path, sha256)
  // list sorted by path (SQLite's BINARY order: UTF-8 bytes, which is code point order).
  const sha256 = files.length === 1 ? files[0]!.sha256 : await sha256Hex(JSON.stringify(files.map((f) => [f.path, f.sha256])));
  const totalBytes = files.reduce((n, f) => n + f.bytes, 0);
  const override = findings.length > 0 ? 1 : 0;
  statements.push(
    env.DB.prepare(`INSERT INTO versions (item_id, version, entry, view, media_type, total_bytes, file_count, sha256, created_by, scan_override) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(itemId, version, entry.path, entry.view, entry.media_type, totalBytes, files.length, sha256, p.principalId, override),
    ...files.map((f) => env.DB.prepare(`INSERT INTO version_files (item_id, version, path, sha256, bytes, media_type, view) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(itemId, version, f.path, f.sha256, f.bytes, f.media_type, f.view)),
    env.DB.prepare(`DELETE FROM upload_files WHERE session_id = ?`).bind(id),
    audit(env.DB, { workspaceId: p.workspaceId, actor: p.principalId, act: p.act, action: 'version.created', itemId, version, detail: { uploadId: id, files: files.length, bytes: totalBytes, scanOverride: override === 1 } }),
  );
  try {
    await env.DB.batch(statements);
  } catch (e) {
    // The batch is one transaction, so a loser wrote nothing.
    const message = e instanceof Error ? e.message : '';
    if (/upload already committed/.test(message)) {
      // The same session, committed concurrently: answer the winner's result.
      const now = await ownSession(env, p, id);
      return now instanceof Response ? now : committed(env, now);
    }
    // Two sessions for one item raced to the same version number. The client retries.
    if (/UNIQUE|PRIMARY KEY/i.test(message)) return error(409, 'version_conflict');
    throw e;
  }
  // After D1, never before: a manifest written for a version that then failed to commit would
  // overwrite the winner's. A failure from here on is repaired by the idempotent retry above.
  await publish(env, id, itemId, version);
  return json(await resultOf(env, itemId, version), 201);
}
