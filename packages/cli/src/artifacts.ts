import { lstatSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { basename, join, relative, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { ITEM_ID, LIMITS, NOTHING_ADDED, checkPath, sendFiles, isTransient, describeRefusal, pathRefusalSentence, refusalSentence, sizeRefusal, type UploadRefusal, type CommitResult, type EmbedGrant } from '@superlibrary/contract';
import { baseUrl, tokenSource, type TokenSource } from './credential.ts';

export interface LocalFile { path: string; bytes: Uint8Array }
export type Client = (method: string, path: string, body?: unknown) => Promise<Response>;
/** Files accounted for so far, of the total. */
export type Progress = (sent: number, total: number) => void;

/** A file or a folder as upload paths. Symlinks are followed only while they stay inside (spec §8). */
export function walk(root: string): LocalFile[] {
  const rootReal = realpathSync(root);
  const found: { path: string; target: string; size: number }[] = [];
  const rootStat = statSync(rootReal);
  if (rootStat.isFile()) {
    const c = checkPath(basename(root));
    if (!c.ok) throw new Error(pathRefusalSentence(c));
    found.push({ path: c.path, target: rootReal, size: rootStat.size });
  }
  const visit = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      const rel = relative(root, full).split(sep).join('/');
      let target = full;
      if (lstatSync(full).isSymbolicLink()) {
        target = realpathSync(full);
        if (target !== rootReal && !target.startsWith(rootReal + sep)) throw new Error(`${rel} points outside the folder; it is not uploaded.`);
      }
      const c = checkPath(rel);
      if (!c.ok) throw new Error(pathRefusalSentence(c));
      const st = statSync(target);
      if (st.isDirectory()) visit(full);
      else found.push({ path: c.path, target, size: st.size });
    }
  };
  if (!rootStat.isFile()) visit(root);
  // The caps are checked from sizes alone, so nothing over them is read into memory.
  const big = found.find((f) => f.size > LIMITS.fileBytes);
  if (big) throw new Error(sizeRefusal.file(big.path));
  if (found.length > LIMITS.folderFiles) throw new Error(sizeRefusal.files(found.length));
  if (found.reduce((n, f) => n + f.size, 0) > LIMITS.folderBytes) throw new Error(sizeRefusal.folder());
  return found.map((f) => ({ path: f.path, bytes: readFileSync(f.target) }));
}

/**
 * A token per request, never one per upload: a long upload outlives a five-minute token. A device
 * token the server refuses (revoked, or the server's clock ahead of ours) is exchanged once more
 * and the request sent again; only a second refusal is "sign in again".
 */
export function makeClient(base: string, token: TokenSource['token'], fetchImpl: typeof fetch = fetch, source: 'env' | 'device' | 'none' = 'device'): Client {
  return async (method, path, body) => {
    let payload: RequestInit['body'];
    const json = body !== undefined && !(body instanceof Uint8Array) && !(body instanceof FormData);
    if (body instanceof Uint8Array || body instanceof FormData) payload = body as RequestInit['body'];
    else if (body !== undefined) payload = JSON.stringify(body);
    const send = async (fresh: boolean) => {
      const t = await token(fresh ? { fresh } : undefined);
      if (!t) throw new Error('not signed in. Run suli login.');
      const headers: Record<string, string> = { Authorization: `Bearer ${t}`, ...(json ? { 'content-type': 'application/json' } : {}) };
      return fetchImpl(`${base}${path}`, { method, headers, body: payload, redirect: 'error' });
    };
    let res = await send(false);
    if (res.status === 401 && source === 'device') { await res.body?.cancel(); res = await send(true); }
    if (res.status === 401) throw new Error(source === 'env' ? 'the token in SUPERLIBRARY_TOKEN was refused by the server.' : 'the server did not accept your sign-in. Run suli login.');
    return res;
  };
}

/**
 * A refusal as a sentence. `shared` (the upload requests) uses the contract's wording, the same the
 * web app shows; other requests name the code, since those sentences speak of uploads.
 */
export async function refused(res: Response, what: string, shared = false): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as { error?: string; path?: string; rule?: string; org?: string; findings?: UploadRefusal['findings'] } & NonNullable<UploadRefusal['detail']>;
  if (body.error === 'product_not_enabled') throw new Error(`Superlibrary is not enabled for workspace ${body.org}. An owner can enable it in the account settings.`);
  const { error = `http_${res.status}`, findings, ...detail } = body;
  const sentence = shared ? refusalSentence({ ok: false, status: res.status, error, findings, detail }) : null;
  throw new Error(sentence ?? `${what} was refused (${res.status} ${body.error ?? ''}${body.path ? `: ${body.path}` : ''}${body.rule ? ` matches ${body.rule}` : ''}).`);
}

/** `--expires` is a calendar date, read as the start of that day in UTC. */
function expiryIso(date: string): string {
  const at = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(at.getTime()) || at.toISOString().slice(0, 10) !== date) throw new Error('--expires takes a real date, YYYY-MM-DD');
  return at.toISOString();
}

export const itemId = (id: string | undefined, verb: string): string => {
  if (!id) throw new Error(`name an item: suli ${verb} <itm_…>`);
  if (!ITEM_ID.test(id)) throw new Error(`${id} is not an item id (itm_ and 16 hex digits).`);
  return id;
};
const versionNumber = (v: string | null): string | null => {
  if (v !== null && !/^[1-9]\d*$/.test(v)) throw new Error('--version takes a whole number, 1 or more.');
  return v;
};

/** A request that failed in transit is sent again (every upload request but the first is idempotent). */
async function retried(fn: () => Promise<Response>): Promise<Response> {
  for (let n = 0; ; n++) {
    try {
      const res = await fn();
      if ((res.status === 429 || res.status >= 500) && n < 3) { await res.body?.cancel(); await new Promise((r) => setTimeout(r, 500 * 2 ** n)); continue; }
      return res;
    } catch (e) {
      if (!isTransient(e) || n >= 3) throw e;
      await new Promise((r) => setTimeout(r, 500 * 2 ** n));
    }
  }
}

export async function uploadWith(client: Client, root: string, o: { title?: string; item?: string; board?: string; entry?: string; expires?: string; override?: string; onProgress?: Progress; concurrency?: number }): Promise<CommitResult> {
  const expiresAt = o.expires ? expiryIso(o.expires) : undefined;
  const files = walk(root);
  const declared = files.map((f) => ({ path: f.path, bytes: f.bytes.length, sha256: createHash('sha256').update(f.bytes).digest('hex') }));
  const created = await client('POST', '/api/v1/uploads', {
    title: o.title ?? basename(resolve(root)), files: declared,
    ...(o.item ? { item: o.item } : {}), ...(o.board ? { scope: `board:${o.board}` } : {}), ...(o.entry ? { entry: o.entry } : {}),
    ...(expiresAt ? { expiresAt } : {}),
  });
  if (created.status !== 201) return refused(created, 'the upload', true);
  const { uploadId, held = [] } = (await created.json()) as { uploadId: string; held?: string[] };
  const send = (only: LocalFile[], progress?: Progress) => sendFiles((path, init) => client(init.method, path, init.body), uploadId, only, { held, onProgress: progress, concurrency: o.concurrency });
  const failed = await send(files, o.onProgress);
  if (failed) return refused(failed, 'a file', true);
  const commit = () => retried(() => client('POST', `/api/v1/uploads/${uploadId}/commit`));
  let committed = await commit();
  // Bytes the server lost since they were sent (it names them) are sent once more.
  if (committed.status === 409) {
    const body = (await committed.clone().json().catch(() => ({}))) as { error?: string; missing?: string[] };
    const want = new Set(body.missing ?? []);
    const again = files.filter((f) => want.has(f.path));
    if (body.error === 'incomplete' && again.length === want.size && again.length > 0) {
      const lost = await sendFiles((path, init) => client(init.method, path, init.body), uploadId, again, { concurrency: o.concurrency });
      if (lost) return refused(lost, 'a file', true);
      committed = await commit();
    }
  }
  if (committed.status === 422) {
    const { findings = [] } = (await committed.json()) as { findings?: { path: string; line: number; rule: string }[] };
    const where = findings.map((f) => `${f.path} line ${f.line}: ${f.rule}`).join('; ');
    if (!o.override) throw new Error(`this looks like it contains a secret — ${where}. ${NOTHING_ADDED} Remove it, or pass --override "<why>" to upload anyway (recorded).`);
    const ov = await client('POST', `/api/v1/uploads/${uploadId}/override`, { reason: o.override });
    if (!ov.ok) return refused(ov, 'the override', true);
    committed = await commit();
  }
  if (!committed.ok) return refused(committed, 'the commit', true);
  return (await committed.json()) as CommitResult;
}

/**
 * One progress line on stderr (stdout stays the result alone, so `--json` pipes cleanly): rewritten
 * in place on a terminal, else a line at each tenth and at the end.
 */
export function progressLine(write: (s: string) => void, tty: boolean): Progress {
  let lastTenth = -1;
  return (sent, total) => {
    if (total < 2) return;
    const line = `suli: sent ${sent}/${total} files`;
    if (tty) { write(`\r${line}${sent === total ? '\n' : ''}`); return; }
    const tenth = Math.floor((sent * 10) / total);
    if (tenth !== lastTenth || sent === total) { lastTenth = tenth; write(`${line}\n`); }
  };
}

export const client = () => {
  const src = tokenSource();
  return makeClient(baseUrl(), (o) => src.token(o), fetch, src.kind);
};

export async function upload(path: string | undefined, o: { title: string | null; item: string | null; board: string | null; entry: string | null; expires: string | null; override: string | null; json: boolean }): Promise<void> {
  if (!path) throw new Error('name a file or a folder: suli upload <path>');
  const onProgress = progressLine((s) => process.stderr.write(s), process.stderr.isTTY === true);
  const r = await uploadWith(client(), path, { title: o.title ?? undefined, item: o.item ?? undefined, board: o.board ?? undefined, entry: o.entry ?? undefined, expires: o.expires ?? undefined, override: o.override ?? undefined, onProgress });
  process.stdout.write(o.json ? JSON.stringify(r) + '\n' : `${r.url} (v${r.version})\n`);
}

export async function getItem(rawId: string | undefined, o: { embed: boolean; version: string | null; json: boolean }): Promise<void> {
  const id = itemId(rawId, 'get');
  const version = versionNumber(o.version);
  const c = client();
  const res = await c('GET', `/api/v1/items/${encodeURIComponent(id)}`);
  if (!res.ok) return refused(res, id);
  const body = (await res.json()) as { item: { title: string; scope: string; createdBy: string; createdAt: string }; versions: { version: number; fileCount: number; sha256: string; revokedAt: string | null }[] };
  let grant: EmbedGrant | null = null;
  if (o.embed) {
    const e = await c('POST', `/api/v1/items/${encodeURIComponent(id)}/embed`, version ? { version: Number(version) } : {});
    if (!e.ok) return refused(e, 'the viewer URL');
    grant = (await e.json()) as EmbedGrant;
  }
  if (o.json) { process.stdout.write(JSON.stringify({ ...body, ...(grant ? { embed: grant } : {}) }) + '\n'); return; }
  const lines = [`${body.item.title}  (${id})`, `scope ${body.item.scope} · uploaded by ${body.item.createdBy} · ${body.item.createdAt}`];
  for (const v of body.versions) lines.push(`  v${v.version}  ${v.fileCount} file(s)  ${v.sha256.slice(0, 12)}${v.revokedAt ? '  revoked' : ''}`);
  if (grant) lines.push(`viewer of v${grant.version} (until ${grant.expiresAt}): ${grant.url}`);
  process.stdout.write(lines.join('\n') + '\n');
}

export async function revoke(rawId: string | undefined, o: { version: string | null; reason: string | null; json: boolean }): Promise<void> {
  const id = itemId(rawId, 'revoke');
  const version = versionNumber(o.version);
  if (version && o.reason) throw new Error('--reason is recorded only when the whole item is revoked; leave it out with --version.');
  const path = version ? `/api/v1/items/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}/revoke` : `/api/v1/items/${encodeURIComponent(id)}/revoke`;
  const res = await client()('POST', path, o.reason ? { reason: o.reason } : {});
  if (!res.ok) return refused(res, 'the revocation');
  process.stdout.write(o.json ? JSON.stringify(await res.json()) + '\n' : 'Revoked.\n');
}
