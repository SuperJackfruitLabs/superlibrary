import { unzipSync } from 'fflate';
import { LIMITS, checkPath, pathRefusalSentence, type CommitResult, type PathRefusal } from '@superlibrary/contract';

export interface LocalFile { path: string; bytes: Uint8Array }
export type Api = (path: string, init?: RequestInit) => Promise<Response>;
export type Finding = { path: string; line: number; rule: string };
/** What a refusal's body said beyond its error code (only the fields the upload API sends). */
export interface RefusalDetail { path?: string; reason?: string; rule?: string; missing?: string[]; limit?: number; used?: number; entry?: string; detail?: string }
export type UploadOutcome =
  | { ok: true; result: CommitResult }
  | { ok: false; status: number; error: string; uploadId?: string; findings?: Finding[]; detail?: RefusalDetail };
export type Refusal = Extract<UploadOutcome, { ok: false }>;
export type Progress = (sent: number, total: number) => void;

/**
 * The files an input holds, and the input emptied, so choosing the same file again (after fixing
 * it, say) fires `change` again.
 */
export function takePicked(input: { files: FileList | null; value: string }): File[] {
  const files = Array.from(input.files ?? []);
  input.value = '';
  return files;
}

/** Files from an <input type=file>, with a folder pick's own name dropped from every path. */
export async function filesFromPicker(files: ArrayLike<File>): Promise<LocalFile[]> {
  const list = Array.from(files);
  const rel = list.map((f) => (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name);
  const tops = new Set(rel.map((p) => p.split('/')[0]));
  const strip = list.length > 0 && rel.every((p) => p.includes('/')) && tops.size === 1;
  return Promise.all(list.map(async (f, i) => ({ path: strip ? rel[i]!.split('/').slice(1).join('/') : rel[i]!, bytes: new Uint8Array(await f.arrayBuffer()) })));
}

/** The central directory, read directly: fflate does not expose an entry's Unix mode. */
export function zipEntries(zip: Uint8Array): { name: string; size: number; symlink: boolean; dir: boolean }[] {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i--) if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('not a zip file');
  const count = view.getUint16(eocd + 10, true);
  let at = view.getUint32(eocd + 16, true);
  const out: { name: string; size: number; symlink: boolean; dir: boolean }[] = [];
  for (let n = 0; n < count; n++) {
    if (at + 46 > zip.length || view.getUint32(at, true) !== 0x02014b50) throw new Error('damaged zip file');
    const size = view.getUint32(at + 24, true);
    const nameLen = view.getUint16(at + 28, true);
    const extraLen = view.getUint16(at + 30, true);
    const commentLen = view.getUint16(at + 32, true);
    const mode = view.getUint32(at + 38, true) >>> 16;
    const name = new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLen));
    out.push({ name, size, symlink: (mode & 0o170000) === 0o120000, dir: name.endsWith('/') });
    at += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** A Mac's Compress stores resource forks under __MACOSX/; they are not part of the folder. */
const isMacJunk = (name: string) => name === '__MACOSX/' || name.startsWith('__MACOSX/');

export function expandZip(zip: Uint8Array): LocalFile[] | { refused: string } {
  let entries;
  try {
    entries = zipEntries(zip);
  } catch (e) {
    return { refused: `This file could not be read as a zip: ${e instanceof Error ? e.message : String(e)}.` };
  }
  const link = entries.find((e) => e.symlink);
  if (link) return { refused: `The zip contains a symbolic link, ${link.name}, which is not uploaded.` };
  const files = entries.filter((e) => !e.dir && !isMacJunk(e.name));
  if (files.length > LIMITS.folderFiles) return { refused: `The zip has ${files.length} files; a folder may have at most ${LIMITS.folderFiles}.` };
  if (files.reduce((n, e) => n + e.size, 0) > LIMITS.folderBytes) return { refused: 'The zip expands to more than 100 MB, the limit for a folder.' };
  let inflated;
  try {
    inflated = unzipSync(zip, { filter: (f) => !f.name.endsWith('/') && !isMacJunk(f.name) });
  } catch (e) {
    return { refused: `This file could not be read as a zip: ${e instanceof Error ? e.message : String(e)}.` };
  }
  return Object.keys(inflated).sort().map((path) => ({ path, bytes: inflated[path]! }));
}

/** The server decides; this only says it first, in the same words for every client. */
export function precheck(files: LocalFile[]): string | null {
  if (files.length === 0) return 'Choose at least one file.';
  for (const f of files) {
    const c = checkPath(f.path);
    if (!c.ok) return pathRefusalSentence(c);
    if (f.bytes.length > LIMITS.fileBytes) return `${f.path} is larger than 25 MB, the limit for one file.`;
  }
  if (files.length > LIMITS.folderFiles) return `A folder may have at most ${LIMITS.folderFiles} files.`;
  if (files.reduce((n, f) => n + f.bytes.length, 0) > LIMITS.folderBytes) return 'Together these are more than 100 MB, the limit for a folder.';
  return null;
}

/** An <input type=date> value as the start of that day in the person's own time zone. */
export function deleteOnToIso(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d).toISOString();
}

const list = (parts: string[]) => (parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`);

/** Spec §8: refused naming file and line. The flagged bytes wait in a private quarantine, not in the library. */
export function secretRefusal(findings: Finding[]): string {
  const where = list(findings.map((f) => `${f.path} line ${f.line} (${f.rule})`));
  return `${where} ${findings.length === 1 ? 'looks like a secret' : 'look like secrets'}. Nothing was added to the library.`;
}

const NOTHING = 'Nothing was added to the library.';

/** One sentence for each refusal the upload API gives (apps/api/src/uploads/routes.ts). */
export function describeRefusal(r: Refusal): string {
  const d = r.detail ?? {};
  switch (r.error) {
    case 'path_refused': return d.path && d.reason ? pathRefusalSentence({ path: d.path, reason: d.reason as PathRefusal, rule: d.rule }) : `A path was refused. ${NOTHING}`;
    case 'duplicate_path': return `${d.path} is chosen twice.`;
    case 'file_too_large': return `${d.path} is larger than 25 MB, the limit for one file.`;
    case 'folder_too_large': return 'Together these are more than 100 MB, the limit for a folder.';
    case 'too_many_files': return `A folder may have at most ${LIMITS.folderFiles} files.`;
    case 'quota_exceeded': return `This would take the workspace over its storage limit. ${NOTHING}`;
    case 'secret_found': return secretRefusal(r.findings ?? []);
    case 'upload_expired': return `This upload was not finished within ${LIMITS.uploadTtlHours} hours and has expired. Upload it again.`;
    case 'revoked': return 'That item has been revoked, so it cannot have a new version.';
    case 'expired': return 'That item has expired. Choose a new delete date to upload a new version.';
    case 'not_found': return r.uploadId ? 'This upload is no longer open. Upload it again.' : 'That item does not exist, or you cannot change it.';
    case 'incomplete': return `${list(d.missing ?? [])} did not arrive. Upload again.`;
    case 'size_mismatch': case 'sha256_mismatch': return `${d.path} changed while it was being sent. Upload again.`;
    case 'version_conflict': return 'Someone else added a version of this item at the same moment. Upload again.';
    case 'gone': return 'This upload was committed, but its item has since been deleted.';
    case 'invalid':
      if (d.detail === 'expiresAt must be in the future') return `The delete date must be after today. ${NOTHING}`;
      return d.detail ? `The upload was not accepted: ${d.detail}. ${NOTHING}` : `The upload was not accepted. ${NOTHING}`;
    case 'not_declared': return `${d.path} was not part of this upload. Upload again.`;
    case 'already_committed': return 'This upload is already in the library.';
    case 'nothing_to_override': return 'Nothing in this upload needs an override. Upload it again.';
    case 'entry_not_found': return `${d.entry}, the file to open first, is not among the chosen files. ${NOTHING}`;
    case 'product_not_enabled': return 'Superlibrary is not enabled for this workspace.';
    default: return `The upload was refused (${r.error}, HTTP ${r.status}). ${NOTHING}`;
  }
}

async function sha256Hex(b: Uint8Array): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', b as Uint8Array<ArrayBuffer>))].map((x) => x.toString(16).padStart(2, '0')).join('');
}

const DETAIL_KEYS = ['path', 'reason', 'rule', 'missing', 'limit', 'used', 'entry', 'detail'] as const;

async function refusal(res: Response, uploadId?: string): Promise<Refusal> {
  const body = (await res.json().catch(() => ({}))) as { error?: string; findings?: Finding[] } & RefusalDetail;
  const detail = Object.fromEntries(DETAIL_KEYS.filter((k) => body[k] !== undefined).map((k) => [k, body[k]])) as RefusalDetail;
  return {
    ok: false, status: res.status, error: body.error ?? `http_${res.status}`,
    ...(uploadId ? { uploadId } : {}), ...(body.findings ? { findings: body.findings } : {}), ...(Object.keys(detail).length ? { detail } : {}),
  };
}

/** One request per file, each through `api`, so each carries a token fetched for it (plan Review Focus). */
async function send(api: Api, uploadId: string, files: LocalFile[], onProgress?: Progress): Promise<Refusal | null> {
  onProgress?.(0, files.length);
  for (const [i, f] of files.entries()) {
    const res = await api(`/api/v1/uploads/${uploadId}/files?path=${encodeURIComponent(f.path)}`, { method: 'PUT', body: f.bytes as Uint8Array<ArrayBuffer> });
    if (!res.ok) return refusal(res, uploadId);
    onProgress?.(i + 1, files.length);
  }
  return null;
}

const normalised = (path: string) => { const c = checkPath(path); return c.ok ? c.path : path; };

/**
 * Commit; a `409 incomplete` names files the server lacks (a lost PUT, or bytes deleted since), so
 * those are sent again once when we still hold them, and the commit is retried.
 */
async function commit(api: Api, uploadId: string, files: LocalFile[] = []): Promise<UploadOutcome> {
  for (let attempt = 0; ; attempt++) {
    const res = await api(`/api/v1/uploads/${uploadId}/commit`, { method: 'POST' });
    if (res.ok) return { ok: true, result: (await res.json()) as CommitResult };
    const out = await refusal(res, uploadId);
    if (attempt > 0 || out.error !== 'incomplete' || !out.detail?.missing) return out;
    // The server names files by their normalised path (checkPath), which may differ from ours.
    const want = new Set(out.detail.missing);
    const again = files.filter((f) => want.has(normalised(f.path)));
    if (again.length !== want.size) return out;
    const failed = await send(api, uploadId, again);
    if (failed) return failed;
  }
}

/** `onProgress(sent, total)`: files sent so far, called before the first and after each one. */
export async function uploadFiles(
  api: Api, files: LocalFile[], meta: { title: string; item?: string; expiresAt?: string }, opts: { onProgress?: Progress } = {},
): Promise<UploadOutcome> {
  const declared = await Promise.all(files.map(async (f) => ({ path: f.path, bytes: f.bytes.length, sha256: await sha256Hex(f.bytes) })));
  const created = await api('/api/v1/uploads', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...meta, files: declared }) });
  if (created.status !== 201) return refusal(created);
  const { uploadId } = (await created.json()) as { uploadId: string };
  const failed = await send(api, uploadId, files, opts.onProgress);
  if (failed) return failed;
  return commit(api, uploadId, files);
}

/**
 * Spec §8 and D12: a person may override the scan on their own upload; the server records who and
 * why. `files` lets a commit that finds something missing send it again.
 */
export async function overrideAndCommit(api: Api, uploadId: string, reason: string, files: LocalFile[] = []): Promise<UploadOutcome> {
  const res = await api(`/api/v1/uploads/${uploadId}/override`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason }) });
  if (!res.ok) return refusal(res, uploadId);
  return commit(api, uploadId, files);
}
