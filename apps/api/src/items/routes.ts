import { z } from 'zod';
import { LIMITS, SCOPE_RE, encodePath, orderFiles, type EmbedGrant, type FileEntry, type ItemSummary, type VersionSummary, type View } from '@superlibrary/contract';
import type { Env } from '../env';
import { error, json, type Handler } from '../http';
import { audit } from '../audit';
import { resolvePerson, type Person } from '../auth/caller';
import { VISIBLE_SQL, canManage, canSee, isExpired, loadItem, type ItemRow } from './visibility';
import { deleteManifest, writeManifest } from '../storage/blobs';
import { contentOrigin, signContent } from './sign';
import { isoUtc } from '../time';

const hostsOf = (s: string) => s.split(/\s+/).filter((x) => x !== '');

export function summary(i: ItemRow): ItemSummary {
  return {
    id: i.id, kind: i.kind, title: i.title, scope: i.scope as ItemSummary['scope'], outcome: i.outcome as ItemSummary['outcome'],
    createdBy: i.created_by, createdAt: isoUtc(i.created_at), latestVersion: i.latest_version, expiresAt: isoUtc(i.expires_at), revokedAt: isoUtc(i.revoked_at),
  };
}

/** The visible, live item, or the refusal a caller should see. Invisible is 404 (plan D11). */
export async function readable(env: Env, p: Person, id: string): Promise<ItemRow | Response> {
  const item = await loadItem(env, id);
  if (!item || !canSee(p, item)) return error(404, 'not_found');
  if (item.revoked_at) return error(410, 'revoked');
  if (isExpired(item)) return error(410, 'expired');
  return item;
}

/** Each listed version's files, keyed by version, entry first then tree order (`orderFiles`). */
async function filesByVersion(env: Env, itemId: string, versions: Array<{ version: number; entry: string }>): Promise<Map<number, FileEntry[]>> {
  const rows = versions.length === 1
    ? await env.DB.prepare(`SELECT version, path, media_type, view, bytes FROM version_files WHERE item_id = ? AND version = ?`).bind(itemId, versions[0]!.version)
      .all<{ version: number; path: string; media_type: string; view: View; bytes: number }>()
    : await env.DB.prepare(`SELECT version, path, media_type, view, bytes FROM version_files WHERE item_id = ?`).bind(itemId)
      .all<{ version: number; path: string; media_type: string; view: View; bytes: number }>();
  const out = new Map<number, FileEntry[]>(versions.map((v) => [v.version, []]));
  for (const r of rows.results) out.get(r.version)?.push({ path: r.path, mediaType: r.media_type, view: r.view, bytes: r.bytes });
  for (const v of versions) out.set(v.version, orderFiles(v.entry, out.get(v.version)!));
  return out;
}

async function list(env: Env, p: Person, url: URL): Promise<Response> {
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 50) || 50, 1), 100);
  const before = url.searchParams.get('before');
  const [bAt, bId] = before ? (before.split('|') as [string, string]) : [null, null];
  const rows = await env.DB.prepare(
    `SELECT * FROM items WHERE ${VISIBLE_SQL} AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?3)
       AND (?4 IS NULL OR created_at < ?4 OR (created_at = ?4 AND id < ?5))
     ORDER BY created_at DESC, id DESC LIMIT ?6`,
  ).bind(p.workspaceId, p.principalId, new Date().toISOString(), bAt, bId ?? null, limit + 1).all<ItemRow>();
  const page = rows.results.slice(0, limit);
  const last = page.at(-1);
  await audit(env.DB, { workspaceId: p.workspaceId, actor: p.principalId, act: p.act, action: 'items.listed', detail: { count: page.length } }).run();
  return json({ items: page.map(summary), next: rows.results.length > limit && last ? `${last.created_at}|${last.id}` : null });
}

async function detail(env: Env, p: Person, id: string): Promise<Response> {
  const item = await readable(env, p, id);
  if (item instanceof Response) return item;
  const versions = await env.DB.prepare(`SELECT * FROM versions WHERE item_id = ? ORDER BY version DESC`).bind(id).all<{
    version: number; entry: string; view: View; media_type: string; total_bytes: number; file_count: number; sha256: string; created_at: string; revoked_at: string | null; scan_override: number;
  }>();
  const files = await filesByVersion(env, id, versions.results);
  await audit(env.DB, { workspaceId: p.workspaceId, actor: p.principalId, act: p.act, action: 'item.read', itemId: id }).run();
  const out: VersionSummary[] = versions.results.map((v) => ({
    version: v.version, entry: v.entry, view: v.view, mediaType: v.media_type, totalBytes: v.total_bytes, fileCount: v.file_count,
    sha256: v.sha256, createdAt: isoUtc(v.created_at), revokedAt: isoUtc(v.revoked_at), scanOverride: v.scan_override === 1, files: files.get(v.version)!,
  }));
  return json({ item: summary(item), versions: out });
}

function corsFor(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin');
  return origin && hostsOf(env.EMBED_HOSTS).includes(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
}

async function embed(request: Request, env: Env, p: Person, id: string): Promise<Response> {
  const item = await readable(env, p, id);
  if (item instanceof Response) return item;
  const body = (await request.json().catch(() => ({}))) as { version?: unknown };
  const asked = typeof body.version === 'number' && Number.isInteger(body.version) ? body.version : null;
  const v = asked
    ? await env.DB.prepare(`SELECT version, entry, file_count, revoked_at FROM versions WHERE item_id = ? AND version = ?`).bind(id, asked).first<{ version: number; entry: string; file_count: number; revoked_at: string | null }>()
    : await env.DB.prepare(`SELECT version, entry, file_count, revoked_at FROM versions WHERE item_id = ? AND revoked_at IS NULL ORDER BY version DESC LIMIT 1`).bind(id).first<{ version: number; entry: string; file_count: number; revoked_at: string | null }>();
  if (!v) return asked ? error(404, 'not_found') : error(410, 'revoked');
  if (v.revoked_at) return error(410, 'revoked');

  // Plan D18: the frame may talk to exactly one origin — the caller's, when it is an allowed host.
  const origin = request.headers.get('Origin');
  const host = origin && [env.APP_URL, ...hostsOf(env.EMBED_HOSTS)].includes(origin) ? origin : env.APP_URL;
  const exp = Math.floor(Date.now() / 1000) + LIMITS.embedTtlSeconds;
  const token = await signContent(env, { itemId: id, version: v.version, exp, host });
  const base = contentOrigin(env, id);
  const grant: EmbedGrant = {
    url: `${base}/_view?sig=${token}`,
    downloadUrl: v.file_count === 1 ? `${base}/s/${token}/${encodePath(v.entry)}?download=1` : null,
    expiresAt: new Date(exp * 1000).toISOString(),
    version: v.version,
    itemUrl: `${env.APP_URL}/a/${id}/v/${v.version}`,
    entry: v.entry,
    files: (await filesByVersion(env, id, [v])).get(v.version)!,
  };
  await audit(env.DB, { workspaceId: p.workspaceId, actor: p.principalId, act: p.act, action: 'item.viewed', itemId: id, version: v.version, detail: { host } }).run();
  return json(grant);
}

const RevokeBody = z.object({ reason: z.string().trim().max(500).optional() });
const PatchBody = z.object({ expiresAt: z.iso.datetime().nullable() });
const ScopeBody = z.object({ scope: z.string().regex(SCOPE_RE) });

/**
 * The item the caller may revoke, expire or widen (plan D12: the uploader or an owner), or the
 * refusal. Not `readable`: an expired item can still be managed. Invisible is 404 (plan D11).
 */
async function manageable(env: Env, p: Person, id: string): Promise<ItemRow | Response> {
  const item = await loadItem(env, id);
  if (!item || !canSee(p, item)) return error(404, 'not_found');
  if (!canManage(p, item)) return error(403, 'not_permitted');
  if (item.revoked_at) return error(410, 'revoked');
  return item;
}

async function revokeItem(request: Request, env: Env, p: Person, id: string): Promise<Response> {
  const item = await manageable(env, p, id);
  if (item instanceof Response) return item;
  const body = RevokeBody.safeParse(await request.json().catch(() => ({})));
  const reason = body.success ? (body.data.reason || null) : null;
  const versions = (await env.DB.prepare(`SELECT version FROM versions WHERE item_id = ?`).bind(id).all<{ version: number }>()).results;
  // Manifests first: the moment the API says "revoked", the content origin already refuses (plan D7).
  for (const v of versions) await deleteManifest(env, id, v.version);
  await env.DB.batch([
    env.DB.prepare(`UPDATE items SET revoked_at = datetime('now'), revoked_by = ?, revoke_reason = ? WHERE id = ? AND revoked_at IS NULL`).bind(p.principalId, reason, id),
    audit(env.DB, { workspaceId: p.workspaceId, actor: p.principalId, act: p.act, action: 'item.revoked', itemId: id, detail: reason ? { reason } : {} }),
  ]);
  const now = await loadItem(env, id);
  return json({ revoked: true, revokedAt: isoUtc(now!.revoked_at) });
}

async function revokeVersion(env: Env, p: Person, id: string, version: number): Promise<Response> {
  const item = await manageable(env, p, id);
  if (item instanceof Response) return item;
  const v = await env.DB.prepare(`SELECT revoked_at FROM versions WHERE item_id = ? AND version = ?`).bind(id, version).first<{ revoked_at: string | null }>();
  if (!v) return error(404, 'not_found');
  await deleteManifest(env, id, version);
  if (!v.revoked_at) {
    await env.DB.batch([
      env.DB.prepare(`UPDATE versions SET revoked_at = datetime('now'), revoked_by = ? WHERE item_id = ? AND version = ? AND revoked_at IS NULL`).bind(p.principalId, id, version),
      audit(env.DB, { workspaceId: p.workspaceId, actor: p.principalId, act: p.act, action: 'version.revoked', itemId: id, version }),
    ]);
  }
  const now = await env.DB.prepare(`SELECT revoked_at FROM versions WHERE item_id = ? AND version = ?`).bind(id, version).first<{ revoked_at: string }>();
  return json({ revoked: true, version, revokedAt: isoUtc(now!.revoked_at) });
}

async function setExpiry(request: Request, env: Env, p: Person, id: string): Promise<Response> {
  const item = await manageable(env, p, id);
  if (item instanceof Response) return item;
  const body = PatchBody.safeParse(await request.json().catch(() => null));
  if (!body.success) return error(400, 'invalid');
  // One stored form, as upload declare stores it.
  const at = body.data.expiresAt === null ? null : new Date(body.data.expiresAt).toISOString();
  if (at !== null && Date.parse(at) <= Date.now()) return error(400, 'invalid', { detail: 'expiresAt must be in the future' });
  await env.DB.batch([
    env.DB.prepare(`UPDATE items SET expires_at = ? WHERE id = ?`).bind(at, id),
    audit(env.DB, { workspaceId: p.workspaceId, actor: p.principalId, act: p.act, action: 'item.expiry_set', itemId: id, detail: { expiresAt: at } }),
  ]);
  // Plan D7: the content Worker reads the expiry from each manifest. writeManifest skips revoked versions.
  const live = (await env.DB.prepare(`SELECT version FROM versions WHERE item_id = ? AND revoked_at IS NULL`).bind(id).all<{ version: number }>()).results;
  for (const v of live) await writeManifest(env, id, v.version);
  return json({ item: summary((await loadItem(env, id))!) });
}

/**
 * Spec §4: widening to `workspace` is a person's act, recorded (agents and services never get
 * here, plan D13). Narrowing is refused in phase 1: who already saw it cannot be undone, and a
 * board check needs phase 3. Manifests carry no scope, so none is rewritten.
 */
async function widenScope(request: Request, env: Env, p: Person, id: string): Promise<Response> {
  const item = await manageable(env, p, id);
  if (item instanceof Response) return item;
  const body = ScopeBody.safeParse(await request.json().catch(() => null));
  if (!body.success) return error(400, 'invalid');
  if (body.data.scope !== 'workspace') return error(400, 'invalid', { detail: 'scope can only be widened to workspace' });
  if (item.scope !== 'workspace') {
    await env.DB.batch([
      env.DB.prepare(`UPDATE items SET scope = 'workspace' WHERE id = ?`).bind(id),
      audit(env.DB, { workspaceId: p.workspaceId, actor: p.principalId, act: p.act, action: 'item.scope_changed', itemId: id, detail: { from: item.scope, to: 'workspace' } }),
    ]);
  }
  return json({ item: summary((await loadItem(env, id))!) });
}

const ITEM = /^\/api\/v1\/items\/(itm_[0-9a-f]{16})(\/embed|\/revoke|\/scope|\/versions\/([1-9][0-9]{0,8})\/revoke)?$/;

export const itemRoutes: Handler = async (request, env, _ctx, url) => {
  if (url.pathname === '/api/v1/items' && request.method === 'GET') {
    const p = await resolvePerson(request, env);
    return p instanceof Response ? p : list(env, p, url);
  }
  const m = ITEM.exec(url.pathname);
  if (!m) return null;
  const [, id, sub] = m as unknown as [string, string, string | undefined];
  if (sub === '/embed' && request.method === 'OPTIONS') {
    const cors = corsFor(request, env);
    if (!cors['Access-Control-Allow-Origin']) return new Response(null, { status: 204 });
    return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Max-Age': '600' } });
  }
  const p = await resolvePerson(request, env);
  if (p instanceof Response) {
    for (const [k, v] of Object.entries(corsFor(request, env))) p.headers.set(k, v);
    return p;
  }
  if (!sub && request.method === 'GET') return detail(env, p, id);
  if (sub === '/embed' && request.method === 'POST') {
    // An allowed host must be able to read every answer, refusals included, not an opaque failure.
    const res = await embed(request, env, p, id);
    for (const [k, v] of Object.entries(corsFor(request, env))) res.headers.set(k, v);
    return res;
  }
  if (!sub && request.method === 'PATCH') return setExpiry(request, env, p, id);
  if (sub === '/revoke' && request.method === 'POST') return revokeItem(request, env, p, id);
  if (sub === '/scope' && request.method === 'POST') return widenScope(request, env, p, id);
  if (sub?.startsWith('/versions/') && request.method === 'POST') return revokeVersion(env, p, id, Number(m[3]));
  return null;
};
