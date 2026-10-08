import { LIMITS, encodePath, orderFiles, type EmbedGrant, type FileEntry, type ItemSummary, type VersionSummary, type View } from '@superlibrary/contract';
import type { Env } from '../env';
import { error, json, type Handler } from '../http';
import { audit } from '../audit';
import { resolvePerson, type Person } from '../auth/caller';
import { VISIBLE_SQL, canSee, isExpired, loadItem, type ItemRow } from './visibility';
import { contentOrigin, signContent } from './sign';

const hostsOf = (s: string) => s.split(/\s+/).filter((x) => x !== '');

export function summary(i: ItemRow): ItemSummary {
  return {
    id: i.id, kind: i.kind, title: i.title, scope: i.scope as ItemSummary['scope'], outcome: i.outcome as ItemSummary['outcome'],
    createdBy: i.created_by, createdAt: i.created_at, latestVersion: i.latest_version, expiresAt: i.expires_at, revokedAt: i.revoked_at,
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
    sha256: v.sha256, createdAt: v.created_at, revokedAt: v.revoked_at, scanOverride: v.scan_override === 1, files: files.get(v.version)!,
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
  return json(grant, 200, corsFor(request, env));
}

const ITEM = /^\/api\/v1\/items\/(itm_[0-9a-f]{16})(\/embed)?$/;

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
  if (sub === '/embed' && request.method === 'POST') return embed(request, env, p, id);
  return null;
};
