/**
 * Upload sessions (plan D16): declare the files, send each one, commit (Task 8). Every declared
 * and every sent path goes through `checkPath`, and rows are keyed on its normalised form.
 */
import { LIMITS, UploadCreate, checkPath } from '@superlibrary/contract';
import type { Env } from '../env';
import { error, json, type Handler } from '../http';
import { newId } from '../ids';
import { audit } from '../audit';
import { resolvePerson, type Person } from '../auth/caller';
import { decodeText, sniff } from '../guard/sniff';
import { scanText } from '../guard/secrets';
import { newBytes, workspaceUsage } from '../guard/limits';
import { blobKey, quarantineKey, sha256Hex } from '../storage/blobs';

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

function defaultEntry(paths: string[]): string {
  if (paths.length === 1) return paths[0]!;
  const sorted = [...paths].sort();
  return sorted.find((p) => p.toLowerCase() === 'index.html') ?? sorted.find((p) => p.toLowerCase() === 'readme.md') ?? sorted[0]!;
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

// Implemented in Task 8.
async function overrideScan(_r: Request, _e: Env, _p: Person, _id: string): Promise<Response> {
  return error(501, 'not_implemented');
}
async function commit(_e: Env, _p: Person, _id: string): Promise<Response> {
  return error(501, 'not_implemented');
}
