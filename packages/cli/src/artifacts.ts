import { lstatSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { LIMITS, NOTHING_ADDED, checkPath, pathRefusalSentence, sizeRefusal, type CommitResult, type EmbedGrant } from '@superlibrary/contract';
import { baseUrl, tokenSource } from './credential.ts';

export interface LocalFile { path: string; bytes: Uint8Array }
export type Client = (method: string, path: string, body?: unknown) => Promise<Response>;

/** A file or a folder as upload paths. Symlinks are followed only while they stay inside (spec §8). */
export function walk(root: string): LocalFile[] {
  const rootReal = realpathSync(root);
  if (statSync(rootReal).isFile()) return [{ path: basename(root), bytes: readFileSync(rootReal) }];
  const found: { path: string; target: string; size: number }[] = [];
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
  visit(root);
  // The caps are checked from sizes alone, so nothing over them is read into memory.
  const big = found.find((f) => f.size > LIMITS.fileBytes);
  if (big) throw new Error(sizeRefusal.file(big.path));
  if (found.length > LIMITS.folderFiles) throw new Error(sizeRefusal.files(found.length));
  if (found.reduce((n, f) => n + f.size, 0) > LIMITS.folderBytes) throw new Error(sizeRefusal.folder());
  return found.map((f) => ({ path: f.path, bytes: readFileSync(f.target) }));
}

/** A token per request, never one per upload: a long upload outlives a five-minute token. */
export function makeClient(base: string, token: () => Promise<string | null>, fetchImpl: typeof fetch = fetch): Client {
  return async (method, path, body) => {
    const t = await token();
    if (!t) throw new Error('not signed in. Run suli login.');
    const headers: Record<string, string> = { Authorization: `Bearer ${t}` };
    let payload: RequestInit['body'];
    if (body instanceof Uint8Array) payload = body as RequestInit['body'];
    else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetchImpl(`${base}${path}`, { method, headers, body: payload, redirect: 'error' });
    if (res.status === 401) throw new Error('the server did not accept your sign-in. Run suli login.');
    return res;
  };
}

async function refused(res: Response, what: string): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as { error?: string; path?: string; reason?: string; rule?: string; org?: string };
  if (body.error === 'product_not_enabled') throw new Error(`Superlibrary is not enabled for workspace ${body.org}. An owner can enable it in the account settings.`);
  throw new Error(`${what} was refused (${res.status} ${body.error ?? ''}${body.path ? `: ${body.path}` : ''}${body.rule ? ` matches ${body.rule}` : ''}).`);
}

export async function uploadWith(client: Client, root: string, o: { title?: string; item?: string; board?: string; entry?: string; expires?: string; override?: string }): Promise<CommitResult> {
  const files = walk(root);
  const declared = files.map((f) => ({ path: f.path, bytes: f.bytes.length, sha256: createHash('sha256').update(f.bytes).digest('hex') }));
  const created = await client('POST', '/api/v1/uploads', {
    title: o.title ?? basename(root), files: declared,
    ...(o.item ? { item: o.item } : {}), ...(o.board ? { scope: `board:${o.board}` } : {}), ...(o.entry ? { entry: o.entry } : {}),
    ...(o.expires ? { expiresAt: new Date(`${o.expires}T00:00:00Z`).toISOString() } : {}),
  });
  if (created.status !== 201) return refused(created, 'the upload');
  const { uploadId } = (await created.json()) as { uploadId: string };
  for (const f of files) {
    const res = await client('PUT', `/api/v1/uploads/${uploadId}/files?path=${encodeURIComponent(f.path)}`, f.bytes);
    if (!res.ok) return refused(res, f.path);
  }
  let committed = await client('POST', `/api/v1/uploads/${uploadId}/commit`);
  if (committed.status === 422) {
    const { findings = [] } = (await committed.json()) as { findings?: { path: string; line: number; rule: string }[] };
    const where = findings.map((f) => `${f.path} line ${f.line}: ${f.rule}`).join('; ');
    if (!o.override) throw new Error(`this looks like it contains a secret — ${where}. ${NOTHING_ADDED} Remove it, or pass --override "<why>" to upload anyway (recorded).`);
    const ov = await client('POST', `/api/v1/uploads/${uploadId}/override`, { reason: o.override });
    if (!ov.ok) return refused(ov, 'the override');
    committed = await client('POST', `/api/v1/uploads/${uploadId}/commit`);
  }
  if (!committed.ok) return refused(committed, 'the commit');
  return (await committed.json()) as CommitResult;
}

const client = () => makeClient(baseUrl(), () => tokenSource().token());

export async function upload(path: string | undefined, o: { title: string | null; item: string | null; board: string | null; entry: string | null; expires: string | null; override: string | null; json: boolean }): Promise<void> {
  if (!path) throw new Error('name a file or a folder: suli upload <path>');
  if (o.expires && !/^\d{4}-\d{2}-\d{2}$/.test(o.expires)) throw new Error('--expires takes a date, YYYY-MM-DD');
  const r = await uploadWith(client(), path, { title: o.title ?? undefined, item: o.item ?? undefined, board: o.board ?? undefined, entry: o.entry ?? undefined, expires: o.expires ?? undefined, override: o.override ?? undefined });
  process.stdout.write(o.json ? JSON.stringify(r) + '\n' : `${r.url} (v${r.version})\n`);
}

export async function getItem(id: string | undefined, o: { embed: boolean; version: string | null; json: boolean }): Promise<void> {
  if (!id) throw new Error('name an item: suli get <itm_…>');
  const c = client();
  const res = await c('GET', `/api/v1/items/${id}`);
  if (!res.ok) return refused(res, id);
  const body = (await res.json()) as { item: { title: string; scope: string; createdBy: string; createdAt: string }; versions: { version: number; fileCount: number; sha256: string; revokedAt: string | null }[] };
  let grant: EmbedGrant | null = null;
  if (o.embed) {
    const e = await c('POST', `/api/v1/items/${id}/embed`, o.version ? { version: Number(o.version) } : {});
    if (!e.ok) return refused(e, 'the viewer URL');
    grant = (await e.json()) as EmbedGrant;
  }
  if (o.json) { process.stdout.write(JSON.stringify({ ...body, ...(grant ? { embed: grant } : {}) }) + '\n'); return; }
  const lines = [`${body.item.title}  (${id})`, `scope ${body.item.scope} · uploaded by ${body.item.createdBy} · ${body.item.createdAt}`];
  for (const v of body.versions) lines.push(`  v${v.version}  ${v.fileCount} file(s)  ${v.sha256.slice(0, 12)}${v.revokedAt ? '  revoked' : ''}`);
  if (grant) lines.push(`viewer (until ${grant.expiresAt}): ${grant.url}`);
  process.stdout.write(lines.join('\n') + '\n');
}

export async function revoke(id: string | undefined, o: { version: string | null; reason: string | null; json: boolean }): Promise<void> {
  if (!id) throw new Error('name an item: suli revoke <itm_…>');
  const path = o.version ? `/api/v1/items/${id}/versions/${o.version}/revoke` : `/api/v1/items/${id}/revoke`;
  const res = await client()('POST', path, o.reason ? { reason: o.reason } : {});
  if (!res.ok) return refused(res, 'the revocation');
  process.stdout.write(o.json ? JSON.stringify(await res.json()) + '\n' : 'Revoked.\n');
}
