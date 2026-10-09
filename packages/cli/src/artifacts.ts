import { lstatSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { basename, join, relative, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { ITEM_ID, LIMITS, NOTHING_ADDED, checkPath, describeRefusal, pathRefusalSentence, refusalSentence, sizeRefusal, type UploadRefusal, type CommitResult, type EmbedGrant } from '@superlibrary/contract';
import { baseUrl, tokenSource } from './credential.ts';

export interface LocalFile { path: string; bytes: Uint8Array }
export type Client = (method: string, path: string, body?: unknown) => Promise<Response>;

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

/** A token per request, never one per upload: a long upload outlives a five-minute token. */
export function makeClient(base: string, token: () => Promise<string | null>, fetchImpl: typeof fetch = fetch, source: 'env' | 'device' | 'none' = 'device'): Client {
  return async (method, path, body) => {
    const t = await token();
    if (!t) throw new Error('not signed in. Run suli login.');
    const headers: Record<string, string> = { Authorization: `Bearer ${t}` };
    let payload: RequestInit['body'];
    if (body instanceof Uint8Array) payload = body as RequestInit['body'];
    else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetchImpl(`${base}${path}`, { method, headers, body: payload, redirect: 'error' });
    if (res.status === 401) throw new Error(source === 'env' ? 'the token in SUPERLIBRARY_TOKEN was refused by the server.' : 'the server did not accept your sign-in. Run suli login.');
    return res;
  };
}

/**
 * A refusal as a sentence. `shared` (the upload requests) uses the contract's wording, the same the
 * web app shows; other requests name the code, since those sentences speak of uploads.
 */
async function refused(res: Response, what: string, shared = false): Promise<never> {
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

const itemId = (id: string | undefined, verb: string): string => {
  if (!id) throw new Error(`name an item: suli ${verb} <itm_…>`);
  if (!ITEM_ID.test(id)) throw new Error(`${id} is not an item id (itm_ and 16 hex digits).`);
  return id;
};
const versionNumber = (v: string | null): string | null => {
  if (v !== null && !/^[1-9]\d*$/.test(v)) throw new Error('--version takes a whole number, 1 or more.');
  return v;
};

export async function uploadWith(client: Client, root: string, o: { title?: string; item?: string; board?: string; entry?: string; expires?: string; override?: string }): Promise<CommitResult> {
  const expiresAt = o.expires ? expiryIso(o.expires) : undefined;
  const files = walk(root);
  const declared = files.map((f) => ({ path: f.path, bytes: f.bytes.length, sha256: createHash('sha256').update(f.bytes).digest('hex') }));
  const created = await client('POST', '/api/v1/uploads', {
    title: o.title ?? basename(resolve(root)), files: declared,
    ...(o.item ? { item: o.item } : {}), ...(o.board ? { scope: `board:${o.board}` } : {}), ...(o.entry ? { entry: o.entry } : {}),
    ...(expiresAt ? { expiresAt } : {}),
  });
  if (created.status !== 201) return refused(created, 'the upload', true);
  const { uploadId } = (await created.json()) as { uploadId: string };
  for (const f of files) {
    const res = await client('PUT', `/api/v1/uploads/${uploadId}/files?path=${encodeURIComponent(f.path)}`, f.bytes);
    if (!res.ok) return refused(res, f.path, true);
  }
  let committed = await client('POST', `/api/v1/uploads/${uploadId}/commit`);
  if (committed.status === 422) {
    const { findings = [] } = (await committed.json()) as { findings?: { path: string; line: number; rule: string }[] };
    const where = findings.map((f) => `${f.path} line ${f.line}: ${f.rule}`).join('; ');
    if (!o.override) throw new Error(`this looks like it contains a secret — ${where}. ${NOTHING_ADDED} Remove it, or pass --override "<why>" to upload anyway (recorded).`);
    const ov = await client('POST', `/api/v1/uploads/${uploadId}/override`, { reason: o.override });
    if (!ov.ok) return refused(ov, 'the override', true);
    committed = await client('POST', `/api/v1/uploads/${uploadId}/commit`);
  }
  if (!committed.ok) return refused(committed, 'the commit', true);
  return (await committed.json()) as CommitResult;
}

const client = () => {
  const src = tokenSource();
  return makeClient(baseUrl(), () => src.token(), fetch, src.kind);
};

export async function upload(path: string | undefined, o: { title: string | null; item: string | null; board: string | null; entry: string | null; expires: string | null; override: string | null; json: boolean }): Promise<void> {
  if (!path) throw new Error('name a file or a folder: suli upload <path>');
  const r = await uploadWith(client(), path, { title: o.title ?? undefined, item: o.item ?? undefined, board: o.board ?? undefined, entry: o.entry ?? undefined, expires: o.expires ?? undefined, override: o.override ?? undefined });
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
