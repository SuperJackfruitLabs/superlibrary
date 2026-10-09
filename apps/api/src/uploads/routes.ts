/**
 * Upload sessions (plan D16): declare the files, send them (one per PUT, or many per batch), commit
 * (Task 8). Every declared and every sent path goes through `checkPath`, and rows are keyed on its
 * normalised form. Each D1 round trip crosses to the database's region, so per-request work is a
 * fixed number of statements, never one per file.
 */
import { z } from 'zod';
import { LIMITS, UploadCreate, checkPath, type CommitResult, type LinkSource } from '@superlibrary/contract';
import type { Env } from '../env';
import { error, json, preflight, withCors, type Handler } from '../http';
import { newId } from '../ids';
import { audit } from '../audit';
import { resolveUploader, type Uploader } from '../auth/caller';
import { itemChanged } from '../events';
import { checkLinkSource, linkSessionItem } from '../sources/link';
import { decodeText, sniff } from '../guard/sniff';
import { scanText, scanUndecodedText } from '../guard/secrets';
import { committedUsage, newBytes, newCommittedBytes, workspaceUsage } from '../guard/limits';
import { blobKey, quarantineKey, releaseQuarantine, sha256Hex, writeManifest } from '../storage/blobs';
import { canManage, isExpired, loadItem } from '../items/visibility';

export interface SessionRow {
  id: string; workspace_id: string; created_by: string; item_id: string | null; title: string; scope: string;
  entry: string; item_expires_at: string | null; expires_at: string; state: 'open' | 'committed';
  result_item_id: string | null; result_version: number | null;
  override_reason: string | null; override_by: string | null; override_at: string | null; created_at: string;
  /** A station link's LinkSource as JSON (Task A10), or null for a person's own upload. */
  source: string | null;
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
export async function ownSession(env: Env, p: Uploader, id: string): Promise<SessionRow | Response> {
  const s = await env.DB.prepare(`SELECT * FROM upload_sessions WHERE id = ? AND workspace_id = ? AND created_by = ?`).bind(id, p.workspaceId, p.principalId).first<SessionRow>();
  if (!s) return error(404, 'not_found');
  if (s.state === 'open' && Date.parse(s.expires_at) <= Date.now()) return error(410, 'upload_expired');
  return s;
}

async function create(request: Request, env: Env, p: Uploader): Promise<Response> {
  const parsed = UploadCreate.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return error(400, 'invalid', { issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
  const body = parsed.data;
  const source = checkLinkSource(env, p, body);
  if (source instanceof Response) return source;
  // Spec §3: a link of a station path already linked is that item's next version. The hub vouches
  // for the station and the item already belongs to that station path, so canManage does not apply.
  let itemForSource: string | null = null;
  if (source && !body.item) itemForSource = await linkSessionItem(env, p.workspaceId, source);
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
    // checkLinkSource has refused an agent's `item`; only a person names one.
    if (p.kind !== 'human') return error(400, 'invalid', { detail: 'an agent cannot choose the item' });
    // The same rule as revoke, expiry and scope (plan D11/D12): an item the caller may not manage,
    // including another person's board item an owner cannot see, is not confirmed to exist.
    const item = await loadItem(env, body.item);
    if (!item || !canManage(p, item)) return error(404, 'not_found');
    if (item.revoked_at) return error(410, 'revoked');
    // Expired but not yet swept: only an upload that sets a new (future, checked above) expiry revives it.
    if (isExpired(item) && !itemExpiresAt) return error(410, 'expired');
  }
  const quota = (await env.DB.prepare(`SELECT quota_bytes FROM workspaces WHERE id = ?`).bind(p.workspaceId).first<{ quota_bytes: number }>())?.quota_bytes ?? LIMITS.workspaceBytes;
  const used = await workspaceUsage(env.DB, p.workspaceId);
  if (used + (await newBytes(env.DB, p.workspaceId, files)) > quota) return error(413, 'quota_exceeded', { limit: quota, used });

  const id = newId('upl');
  const expiresAt = new Date(Date.now() + LIMITS.uploadTtlHours * 3600_000).toISOString();
  // Read before the session exists, so its own declarations cannot count as held.
  const heldShas = await heldBy(env, p, files.map((f) => f.sha256));
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO upload_sessions (id, workspace_id, created_by, item_id, title, scope, entry, item_expires_at, expires_at, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, p.workspaceId, p.principalId, body.item ?? itemForSource, body.title, body.scope, entry, itemExpiresAt, expiresAt, source ? JSON.stringify(source) : null),
    // One statement for every declared file: D1 counts each statement of a batch against its
    // per-invocation cap, and a 500-file folder must not spend 500 of them.
    env.DB.prepare(`INSERT INTO upload_files (session_id, path, sha256, bytes) SELECT ?1, json_extract(value, '$.path'), json_extract(value, '$.sha256'), json_extract(value, '$.bytes') FROM json_each(?2)`)
      .bind(id, JSON.stringify(files.map((f) => ({ path: f.path, sha256: f.sha256, bytes: f.bytes })))),
    audit(env.DB, { workspaceId: p.workspaceId, actor: p.principalId, act: p.act, action: 'upload.created', detail: { uploadId: id, files: files.length } }),
  ]);
  // Resume (content addressing): the paths whose bytes this person has already sent. A client may
  // send them as `held` entries in a batch instead of sending the bytes again.
  return json({ uploadId: id, expiresAt, entry, held: files.filter((f) => heldShas.has(f.sha256)).map((f) => f.path) }, 201);
}

/**
 * Of these SHA-256s, the ones this person has sent themself: in a version they committed in this
 * workspace, or received clean in one of their own sessions. Never someone else's bytes: knowing a
 * hash is not having the file, so a hash alone must not let anyone claim bytes they never sent.
 */
async function heldBy(env: Env, p: Uploader, shas: string[]): Promise<Set<string>> {
  if (shas.length === 0) return new Set();
  const rows = await env.DB.prepare(
    `SELECT vf.sha256 FROM version_files vf JOIN versions v ON v.item_id = vf.item_id AND v.version = vf.version JOIN items i ON i.id = vf.item_id
       WHERE i.workspace_id = ?1 AND v.created_by = ?2 AND vf.sha256 IN (SELECT value FROM json_each(?3))
     UNION
     SELECT uf.sha256 FROM upload_files uf JOIN upload_sessions s ON s.id = uf.session_id
       WHERE s.workspace_id = ?1 AND s.created_by = ?2 AND uf.received = 1 AND uf.quarantined = 0 AND uf.sha256 IN (SELECT value FROM json_each(?3))`,
  ).bind(p.workspaceId, p.principalId, JSON.stringify([...new Set(shas)])).all<{ sha256: string }>();
  return new Set(rows.results.map((r) => r.sha256));
}

/** Runs `fn` over `items`, at most `limit` at a time, keeping their order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i]!); } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** R2 calls in flight at once within one request. */
const R2_PARALLEL = 16;

/** A file as it arrives: its bytes, or `held` (resume) when this person sent the same bytes before. */
type Arrival = { path: string; bytes: Uint8Array } | { path: string; held: true };
type Received = { path: string; mediaType: string; view: string; findings: { line: number; rule: string }[] } | { path: string; missing: true };

const sqlTime = (t: string) => Date.parse(/[zZ]|[+-]\d{2}:\d{2}$/.test(t) ? t : `${t.replace(' ', 'T')}Z`);

/**
 * Files arriving renew their session by uploadTtlHours (a long upload must not expire while it is
 * still sending), never past uploadMaxHours after it was declared.
 */
function renewedExpiry(s: SessionRow): string {
  const cap = sqlTime(s.created_at) + LIMITS.uploadMaxHours * 3600_000;
  return new Date(Math.max(Date.parse(s.expires_at), Math.min(Date.now() + LIMITS.uploadTtlHours * 3600_000, cap))).toISOString();
}

/**
 * The one receiving path, for a single PUT and for a batch: every check a file gets (path rules,
 * declared, size, SHA-256, sniff, secret scan before storing) runs on every file before anything is
 * written, so a refused request records nothing. The D1 writes are one batch of a fixed number of
 * statements, whatever the file count.
 */
async function receive(env: Env, p: Uploader, s: SessionRow, arrivals: Arrival[]): Promise<Received[] | Response> {
  const id = s.id;
  const items: Array<Arrival & { path: string }> = [];
  const seen = new Set<string>();
  for (const a of arrivals) {
    const c = checkPath(a.path);
    if (!c.ok) return refusePath(c);
    if (seen.has(c.path)) return error(400, 'duplicate_path', { path: c.path });
    seen.add(c.path);
    items.push({ ...a, path: c.path });
  }
  const declared = new Map((await env.DB.prepare(`SELECT path, sha256, bytes FROM upload_files WHERE session_id = ?1 AND path IN (SELECT value FROM json_each(?2))`)
    .bind(id, JSON.stringify([...seen])).all<{ path: string; sha256: string; bytes: number }>()).results.map((r) => [r.path, r]));
  for (const a of items) {
    const f = declared.get(a.path);
    if (!f) return error(404, 'not_declared', { path: a.path });
    if ('bytes' in a) {
      if (a.bytes.length !== f.bytes) return error(400, 'size_mismatch', { path: a.path });
      if ((await sha256Hex(a.bytes)) !== f.sha256) return error(400, 'sha256_mismatch', { path: a.path });
    }
  }
  // Held entries are read back from storage, and only bytes this person sent count as held.
  const wantHeld = items.filter((a) => 'held' in a);
  const held = await heldBy(env, p, wantHeld.map((a) => declared.get(a.path)!.sha256));
  const fromStore = await mapLimit(wantHeld, R2_PARALLEL, async (a) => {
    const f = declared.get(a.path)!;
    if (!held.has(f.sha256)) return null;
    const o = await env.BLOBS.get(blobKey(f.sha256));
    if (!o) return null;
    const bytes = new Uint8Array(await o.arrayBuffer());
    // Content addressed (and stored with its checksum), but checked like any arrival all the same.
    return bytes.length === f.bytes && (await sha256Hex(bytes)) === f.sha256 ? bytes : null;
  });
  const stored = new Map(wantHeld.map((a, i) => [a.path, fromStore[i]]));

  const out: Received[] = [];
  const rows: { path: string; mediaType: string; view: string; q: number }[] = [];
  const findings: { path: string; line: number; rule: string }[] = [];
  const writes: { key: string; bytes: Uint8Array; sha256: string }[] = [];
  for (const a of items) {
    const f = declared.get(a.path)!;
    const bytes = 'bytes' in a ? a.bytes : stored.get(a.path);
    if (!bytes) { out.push({ path: a.path, missing: true }); continue; }
    const sniffed = sniff(bytes, a.path);
    // Recognised binaries (images, audio, video, PDF, fonts, zip/Office) are not scanned; anything
    // else that is not valid text may still be text in another encoding, so it is read byte-wise.
    const hits = sniffed.text && sniffed.encoding
      ? scanText(decodeText(bytes, sniffed.encoding))
      : sniffed.mediaType === 'application/octet-stream' ? scanUndecodedText(bytes) : [];
    // Spec §8: scanned before storing. A hit never reaches blobs/ (ruling T7/T8): it waits in this
    // session's quarantine for an override at commit, or is deleted with the session. Held bytes
    // are scanned again, so an override given to an earlier upload does not carry over.
    const quarantined = hits.length > 0;
    if (quarantined) writes.push({ key: quarantineKey(id, f.sha256), bytes, sha256: f.sha256 });
    else if ('bytes' in a) writes.push({ key: blobKey(f.sha256), bytes, sha256: f.sha256 });
    rows.push({ path: a.path, mediaType: sniffed.mediaType, view: sniffed.view, q: quarantined ? 1 : 0 });
    for (const h of hits) findings.push({ path: a.path, line: h.line, rule: h.rule });
    out.push({ path: a.path, mediaType: sniffed.mediaType, view: sniffed.view, findings: hits });
  }
  // Content addressed: writing the same bytes to the same key again changes nothing, and costs one
  // call where a head first would cost one or two.
  const unique = [...new Map(writes.map((w) => [w.key, w])).values()];
  await mapLimit(unique, R2_PARALLEL, (w) => env.BLOBS.put(w.key, w.bytes, { sha256: w.sha256 }));
  if (rows.length === 0) return out;

  const paths = JSON.stringify(rows.map((r) => r.path));
  try {
    await env.DB.batch([
      env.DB.prepare(`UPDATE upload_files SET received = 1, media_type = json_extract(j.value, '$.mediaType'), view = json_extract(j.value, '$.view'), quarantined = json_extract(j.value, '$.q')
        FROM json_each(?2) AS j WHERE upload_files.session_id = ?1 AND upload_files.path = json_extract(j.value, '$.path')`).bind(id, JSON.stringify(rows)),
      env.DB.prepare(`DELETE FROM secret_findings WHERE session_id = ?1 AND path IN (SELECT value FROM json_each(?2))`).bind(id, paths),
      ...(findings.length > 0 ? [
        env.DB.prepare(`INSERT OR IGNORE INTO secret_findings (session_id, path, line, rule) SELECT ?1, json_extract(value, '$.path'), json_extract(value, '$.line'), json_extract(value, '$.rule') FROM json_each(?2)`).bind(id, JSON.stringify(findings)),
        // An override covers the findings it was shown (and recorded); a new hit needs a new one.
        env.DB.prepare(`UPDATE upload_sessions SET override_reason = NULL, override_by = NULL, override_at = NULL WHERE id = ?`).bind(id),
      ] : []),
      env.DB.prepare(`UPDATE upload_sessions SET expires_at = ? WHERE id = ? AND state = 'open'`).bind(renewedExpiry(s), id),
    ]);
  } catch (e) {
    // Committed between our read and this write (migration 0003 refuses the session update).
    if (/upload already committed/.test(e instanceof Error ? e.message : '')) return error(409, 'already_committed');
    throw e;
  }
  return out;
}

async function put(request: Request, env: Env, p: Uploader, id: string, url: URL): Promise<Response> {
  const s = await ownSession(env, p, id);
  if (s instanceof Response) return s;
  if (s.state !== 'open') return error(409, 'already_committed');
  // URLSearchParams has decoded `?path=` once; it is never decoded again, only normalised.
  const raw = url.searchParams.get('path') ?? '';
  const c = checkPath(raw);
  if (!c.ok) return refusePath(c);
  const announced = Number(request.headers.get('content-length') ?? NaN);
  if (Number.isFinite(announced)) {
    const f = await env.DB.prepare(`SELECT bytes FROM upload_files WHERE session_id = ? AND path = ?`).bind(id, c.path).first<{ bytes: number }>();
    if (!f) return error(404, 'not_declared', { path: c.path });
    if (announced !== f.bytes) return error(400, 'size_mismatch', { path: c.path });
  }
  const r = await receive(env, p, s, [{ path: raw, bytes: new Uint8Array(await request.arrayBuffer()) }]);
  return r instanceof Response ? r : json(r[0]);
}

const BatchManifest = z.object({ files: z.array(z.object({ path: z.string(), held: z.literal(true).optional() }).strict()).min(1) }).strict();
/** Multipart framing around LIMITS.batchBytes of files: part headers and the manifest. */
const BATCH_OVERHEAD = 256 * 1024;

/** The body, or null as soon as it passes `cap` bytes (never buffered past it). */
async function readCapped(body: ReadableStream<Uint8Array> | null, cap: number): Promise<Uint8Array | null> {
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > cap) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

/**
 * Many files in one request (multipart/form-data): a `manifest` part `{ files: [{ path, held? }] }`
 * and one `file` part per entry without `held`, in manifest order. At most LIMITS.batchFiles files
 * and LIMITS.batchBytes of them; a file over that goes alone through PUT.
 */
async function batch(request: Request, env: Env, p: Uploader, id: string): Promise<Response> {
  const tooLarge = () => error(413, 'batch_too_large', { limit: LIMITS.batchFiles, bytesLimit: LIMITS.batchBytes });
  const announced = Number(request.headers.get('content-length') ?? NaN);
  if (Number.isFinite(announced) && announced > LIMITS.batchBytes + BATCH_OVERHEAD) return tooLarge();
  const s = await ownSession(env, p, id);
  if (s instanceof Response) return s;
  if (s.state !== 'open') return error(409, 'already_committed');
  const type = request.headers.get('content-type') ?? '';
  if (!/^multipart\/form-data/i.test(type)) return error(415, 'unsupported_media_type', { detail: 'send multipart/form-data' });
  const raw = await readCapped(request.body, LIMITS.batchBytes + BATCH_OVERHEAD);
  if (!raw) return tooLarge();
  let form: FormData;
  try {
    form = await new Response(raw, { headers: { 'content-type': type } }).formData();
  } catch {
    return error(400, 'invalid', { detail: 'the body is not multipart/form-data' });
  }
  const manifestPart = form.get('manifest');
  let manifest: z.infer<typeof BatchManifest>;
  try {
    const parsed = BatchManifest.safeParse(JSON.parse(typeof manifestPart === 'string' ? manifestPart : await (manifestPart as Blob | null)?.text() ?? ''));
    if (!parsed.success) return error(400, 'invalid', { detail: 'manifest must be { files: [{ path, held? }] }' });
    manifest = parsed.data;
  } catch {
    return error(400, 'invalid', { detail: 'manifest must be JSON' });
  }
  if (manifest.files.length > LIMITS.batchFiles) return error(413, 'batch_too_large', { limit: LIMITS.batchFiles });
  const parts = form.getAll('file');
  const carried = manifest.files.filter((f) => !f.held);
  if (parts.length !== carried.length || (parts as unknown[]).some((x) => typeof x === 'string')) return error(400, 'invalid', { detail: 'one file part per entry without held, in manifest order' });
  const bodies = await Promise.all((parts as unknown as Blob[]).map(async (b) => new Uint8Array(await b.arrayBuffer())));
  if (bodies.reduce((n, b) => n + b.length, 0) > LIMITS.batchBytes) return tooLarge();
  let k = 0;
  const arrivals: Arrival[] = manifest.files.map((f) => (f.held ? { path: f.path, held: true as const } : { path: f.path, bytes: bodies[k++]! }));
  const r = await receive(env, p, s, arrivals);
  return r instanceof Response ? r : json({ files: r });
}

const UPLOAD = /^\/api\/v1\/uploads\/(upl_[0-9a-f]{16})(\/files|\/batch|\/override|\/commit)?$/;

/** The routes the AgentPod console calls from the browser with the person's own token (ruling RA3), and their methods. */
function consoleMethods(pathname: string): string | null {
  if (pathname === '/api/v1/uploads') return 'POST';
  const m = UPLOAD.exec(pathname);
  if (!m) return null;
  if (m[2] === '/files') return 'PUT';
  if (m[2] === '/batch' || m[2] === '/commit') return 'POST';
  return null;
}

export const uploadRoutes: Handler = async (request, env, _ctx, url) => {
  const methods = consoleMethods(url.pathname);
  if (methods && request.method === 'OPTIONS') return preflight(request, env.CONSOLE_ORIGINS, methods);
  const res = await routeUpload(request, env, url);
  // Every answer, refusals included, so the console reads a refusal rather than an opaque failure.
  // An uncaught throw becomes index.ts's 500 outside this wrapper, so that answer carries no CORS headers.
  return res && methods ? withCors(request, env.CONSOLE_ORIGINS, res) : res;
};

async function routeUpload(request: Request, env: Env, url: URL): Promise<Response | null> {
  if (url.pathname === '/api/v1/uploads' && request.method === 'POST') {
    const p = await resolveUploader(request, env);
    return p instanceof Response ? p : create(request, env, p);
  }
  const m = UPLOAD.exec(url.pathname);
  if (!m) return null;
  const p = await resolveUploader(request, env);
  if (p instanceof Response) return p;
  const [, id, action] = m as unknown as [string, string, string | undefined];
  if (action === '/files' && request.method === 'PUT') return put(request, env, p, id, url);
  if (action === '/batch' && request.method === 'POST') return batch(request, env, p, id);
  if (action === '/override' && request.method === 'POST') return overrideScan(request, env, p, id);
  if (action === '/commit' && request.method === 'POST') return commit(env, p, id);
  return error(405, 'method_not_allowed');
}

const OverrideBody = z.object({ reason: z.string().trim().min(1).max(500) });

async function findingsOf(env: Env, id: string) {
  return (await env.DB.prepare(`SELECT path, line, rule FROM secret_findings WHERE session_id = ? ORDER BY path, line, rule`).bind(id).all<{ path: string; line: number; rule: string }>()).results;
}

async function overrideScan(request: Request, env: Env, p: Uploader, id: string): Promise<Response> {
  // Spec §8: agents cannot override the secret scan.
  if (p.kind !== 'human') return error(403, 'principal_not_supported', { detail: 'only a person may override the scan' });
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
async function publish(env: Env, s: SessionRow, itemId: string, version: number): Promise<void> {
  await releaseQuarantine(env, s.id);
  // A new version that sets an expiry changes the item's, so every version's manifest is rewritten
  // (plan D7: "changing an expiry rewrites it"); for a revoked one writeManifest deletes the
  // manifest instead of writing it.
  const versions = s.item_id && s.item_expires_at
    ? (await env.DB.prepare(`SELECT version FROM versions WHERE item_id = ? ORDER BY version`).bind(itemId).all<{ version: number }>()).results.map((r) => r.version)
    : [version];
  for (const v of versions) await writeManifest(env, itemId, v);
}

async function committed(env: Env, s: SessionRow): Promise<Response> {
  // Its item may have been deleted since (expiry, retention): nothing is left to answer with.
  const v = await env.DB.prepare(`SELECT 1 FROM versions WHERE item_id = ? AND version = ?`).bind(s.result_item_id, s.result_version).first();
  if (!v) return error(410, 'gone');
  // Idempotent: a retried commit answers the first one's result and repairs what it left undone.
  await publish(env, s, s.result_item_id!, s.result_version!);
  // The first commit's message may have been lost with whatever this retry repaired (plan P10).
  await itemChanged(env, s.result_item_id!, s.workspace_id, 'upserted');
  return json(await resultOf(env, s.result_item_id!, s.result_version!), 200);
}

async function commit(env: Env, p: Uploader, id: string): Promise<Response> {
  const s = await ownSession(env, p, id);
  if (s instanceof Response) return s;
  if (s.state === 'committed') return committed(env, s);
  const files = (await env.DB.prepare(`SELECT path, sha256, bytes, received, media_type, view, quarantined FROM upload_files WHERE session_id = ? ORDER BY path`).bind(id).all<{ path: string; sha256: string; bytes: number; received: number; media_type: string | null; view: string | null; quarantined: number }>()).results;
  const missing = files.filter((f) => !f.received).map((f) => f.path);
  if (missing.length > 0) return error(409, 'incomplete', { missing });
  // A PUT that found its bytes already in blobs/ stored nothing; those bytes may have been deleted
  // since (PR 2 review). Every clean file's blob must exist now, or the client sends it again.
  const clean = [...new Set(files.filter((f) => !f.quarantined).map((f) => f.sha256))];
  const present = await mapLimit(clean, R2_PARALLEL, async (sha) => (await env.BLOBS.head(blobKey(sha))) !== null);
  const absent = new Set(clean.filter((_, i) => !present[i]));
  if (absent.size > 0) {
    const gone = files.filter((f) => !f.quarantined && absent.has(f.sha256)).map((f) => f.path);
    await env.DB.prepare(`UPDATE upload_files SET received = 0 WHERE session_id = ?1 AND path IN (SELECT value FROM json_each(?2))`).bind(id, JSON.stringify(gone)).run();
    return error(409, 'incomplete', { missing: gone });
  }
  // Refused: nothing is written. The flagged bytes stay in this session's private quarantine,
  // so an override can follow without a re-upload; retention deletes them if none does.
  const findings = await findingsOf(env, id);
  if (findings.length > 0 && !s.override_reason) return error(422, 'secret_found', { findings });

  // Ruling T8: the declare-time check counted declarations; this one counts what is committed.
  const quota = (await env.DB.prepare(`SELECT quota_bytes FROM workspaces WHERE id = ?`).bind(p.workspaceId).first<{ quota_bytes: number }>())?.quota_bytes ?? LIMITS.workspaceBytes;
  const used = await committedUsage(env.DB, p.workspaceId);
  if (used + (await newCommittedBytes(env.DB, p.workspaceId, files)) > quota) return error(413, 'quota_exceeded', { limit: quota, used });

  // Only the hub acting for an agent can have stored one (checkLinkSource at declare).
  const src = s.source ? (JSON.parse(s.source) as LinkSource) : null;
  let itemId: string;
  let version: number;
  const statements: D1PreparedStatement[] = [];
  if (s.item_id) {
    const item = await env.DB.prepare(`SELECT latest_version, revoked_at, expires_at FROM items WHERE id = ? AND workspace_id = ?`).bind(s.item_id, p.workspaceId).first<{ latest_version: number; revoked_at: string | null; expires_at: string | null }>();
    if (!item) return error(404, 'not_found');
    if (item.revoked_at) return error(410, 'revoked');
    // Expired since declare and not swept yet: refused unless this upload sets a new future expiry.
    const revives = s.item_expires_at !== null && Date.parse(s.item_expires_at) > Date.now();
    if (item.expires_at !== null && Date.parse(item.expires_at) <= Date.now() && !revives) return error(410, 'expired');
    itemId = s.item_id;
    version = item.latest_version + 1;
  } else {
    itemId = newId('itm');
    version = 1;
  }
  // First in the batch: a second commit of this same session fails here (migration 0003).
  statements.push(env.DB.prepare(`UPDATE upload_sessions SET state = 'committed', result_item_id = ?, result_version = ? WHERE id = ?`).bind(itemId, version, id));
  if (s.item_id) {
    statements.push(env.DB.prepare(`UPDATE items SET latest_version = ?, title = ?, expires_at = COALESCE(?, expires_at) WHERE id = ? AND latest_version = ?`).bind(version, s.title, s.item_expires_at, itemId, version - 1));
    // A station path linked again on the same board: the provenance names the latest run and the agent that made it.
    if (src && p.kind === 'agent') {
      statements.push(env.DB.prepare(`UPDATE item_sources SET card_id = ?, run_id = ?, agent_principal = ?, via_service = ?, station_name = ? WHERE item_id = ? AND source = 'agentpod'`)
        .bind(src.card ?? null, src.run ?? null, p.principalId, p.via, src.stationName ?? null, itemId));
    }
  } else {
    statements.push(
      env.DB.prepare(`INSERT INTO items (id, workspace_id, kind, title, scope, created_by, latest_version, expires_at) VALUES (?, ?, 'artifact', ?, ?, ?, 1, ?)`)
        .bind(itemId, p.workspaceId, s.title, s.scope, p.principalId, s.item_expires_at),
      audit(env.DB, { workspaceId: p.workspaceId, actor: p.principalId, act: p.act, action: 'item.created', itemId }),
    );
    // Spec §3 provenance: the agent and the hub that acted for it, the station and its path, the run.
    if (src && p.kind === 'agent') {
      statements.push(env.DB.prepare(`INSERT INTO item_sources (item_id, source, board_id, card_id, run_id, agent_principal, via_service, station, station_name, source_path) VALUES (?, 'agentpod', ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(itemId, src.board, src.card ?? null, src.run ?? null, p.principalId, p.via, src.station, src.stationName ?? null, src.path));
    }
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
    // One statement for every file (D1 counts each statement of a batch against its per-invocation
    // cap): the rows are copied from the declarations just read, inside the same transaction.
    env.DB.prepare(`INSERT INTO version_files (item_id, version, path, sha256, bytes, media_type, view) SELECT ?1, ?2, path, sha256, bytes, media_type, view FROM upload_files WHERE session_id = ?3`).bind(itemId, version, id),
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
  await publish(env, s, itemId, version);
  // Every commit, a person's included: indexing learns of the new version (plan P10).
  await itemChanged(env, itemId, p.workspaceId, 'upserted');
  return json(await resultOf(env, itemId, version), 201);
}
