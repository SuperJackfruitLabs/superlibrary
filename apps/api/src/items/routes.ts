import { z } from 'zod';
import { LIMITS, SCOPE_RE, encodePath, orderFiles, type EmbedGrant, type FileEntry, type ItemSource, type ItemSummary, type VersionSummary, type View } from '@superlibrary/contract';
import type { Env } from '../env';
import { corsFor as corsForOrigins, error, json, preflight, type Handler } from '../http';
import { audit } from '../audit';
import { resolvePerson, type Person } from '../auth/caller';
import { itemChanged } from '../events';
import { visibleSupersededBy } from '../search/search';
import { audienceOf, canManage, canSee, isExpired, loadItem, viewerScopes, visibleBinds, visibleSql, type ItemRow } from './visibility';
import { deleteManifest, writeManifest } from '../storage/blobs';
import { contentOrigin, signContent } from './sign';
import { isoUtc } from '../time';

const hostsOf = (s: string) => s.split(/\s+/).filter((x) => x !== '');

interface SourceRow {
  source: 'upload' | 'agentpod' | 'superpipeline'; board_id: string | null; card_id: string | null; stage: string | null; run_id: string | null;
  agent_principal: string | null; station: string | null; station_name: string | null; source_path: string | null; source_id: string | null; source_url: string | null; station_removed_at: string | null;
}

function sourceOf(r: SourceRow): ItemSource {
  const s: ItemSource = { sourceKind: r.source, agent: r.agent_principal !== null, stationRemoved: r.station_removed_at !== null };
  if (r.agent_principal) s.agentPrincipal = r.agent_principal;
  if (r.station) s.station = r.station;
  if (r.station_name) s.stationName = r.station_name;
  if (r.source_path) s.path = r.source_path;
  if (r.board_id) s.board = r.board_id;
  if (r.card_id) s.card = r.card_id;
  if (r.stage) s.stage = r.stage;
  if (r.run_id) s.run = r.run_id;
  if (r.source_id) s.sourceId = r.source_id;
  if (r.source_url) s.sourceUrl = r.source_url;
  return s;
}

const SOURCE_COLS = `item_id, source, board_id, card_id, stage, run_id, agent_principal, station, station_name, source_path, source_id, source_url, station_removed_at`;

/** What `summary` adds: each item's source, whether its board is known, and a work record's replacement. */
interface Extras { source?: ItemSource; boardKnown?: boolean; supersededBy?: string | null }

export function summary(i: ItemRow, extra: Extras = {}): ItemSummary {
  const out: ItemSummary = {
    id: i.id, kind: i.kind, title: i.title, scope: i.scope as ItemSummary['scope'], outcome: i.outcome as ItemSummary['outcome'],
    createdBy: i.created_by, createdAt: isoUtc(i.created_at), latestVersion: i.latest_version, expiresAt: isoUtc(i.expires_at), revokedAt: isoUtc(i.revoked_at),
  };
  if (extra.source) out.source = extra.source;
  // 'uploader' when the board is not one Superlibrary knows: then only the uploader sees it.
  const a = audienceOf(i);
  out.audience = a === 'board' && extra.boardKnown === false ? 'uploader' : a;
  if (extra.supersededBy !== undefined) out.supersededBy = extra.supersededBy;
  return out;
}

/** Sources, known boards and replacements for these items, in one pass each (a list is never N+1). */
export async function extrasFor(env: Env, p: Person, items: ItemRow[], scopes?: string[]): Promise<Map<string, Extras>> {
  const out = new Map<string, Extras>(items.map((i) => [i.id, {}]));
  if (items.length === 0) return out;
  const ids = JSON.stringify(items.map((i) => i.id));
  const srcs = await env.DB.prepare(`SELECT ${SOURCE_COLS} FROM item_sources WHERE item_id IN (SELECT value FROM json_each(?1))`).bind(ids).all<SourceRow & { item_id: string }>();
  for (const r of srcs.results) out.get(r.item_id)!.source = sourceOf(r);
  const boards = new Set<string>();
  for (const i of items) if (i.scope.startsWith('board:')) boards.add(i.scope.slice(6));
  const known = new Set<string>();
  if (boards.size) {
    const ws = items[0]!.workspace_id;
    const rows = await env.DB.prepare(`SELECT board_id FROM source_boards WHERE workspace_id = ?1 AND board_id IN (SELECT value FROM json_each(?2))`).bind(ws, JSON.stringify([...boards])).all<{ board_id: string }>();
    for (const r of rows.results) known.add(r.board_id);
  }
  for (const i of items) out.get(i.id)!.boardKnown = !i.scope.startsWith('board:') || known.has(i.scope.slice(6));
  const wr = await env.DB.prepare(
    `SELECT w.item_id AS item_id, n.item_id AS next FROM work_records w LEFT JOIN work_records n ON n.workspace_id = w.workspace_id AND n.card_id = w.superseded_by_card
      WHERE w.item_id IN (SELECT value FROM json_each(?1))`,
  ).bind(ids).all<{ item_id: string; next: string | null }>();
  // A replacement the person cannot see, or that is revoked or expired, is not named (spec §4).
  const raw = new Map<string, string>(wr.results.flatMap((r) => (r.next ? [[r.item_id, r.next] as [string, string]] : [])));
  const visible = await visibleSupersededBy(env, p, scopes ?? (await viewerScopes(env, p)), raw);
  for (const r of wr.results) out.get(r.item_id)!.supersededBy = visible.get(r.item_id) ?? null;
  return out;
}

/** The visible, live item, or the refusal a caller should see. Invisible is 404 (plan D11). */
export async function readable(env: Env, p: Person, id: string): Promise<ItemRow | Response> {
  const item = await loadItem(env, id);
  if (!item || !canSee(p, item, await viewerScopes(env, p))) return error(404, 'not_found');
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
  const scopes = await viewerScopes(env, p);
  const rows = await env.DB.prepare(
    `SELECT * FROM items WHERE ${visibleSql('items')} AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?4)
       AND (?5 IS NULL OR created_at < ?5 OR (created_at = ?5 AND id < ?6))
     ORDER BY created_at DESC, id DESC LIMIT ?7`,
  ).bind(...visibleBinds(p, scopes), new Date().toISOString(), bAt, bId ?? null, limit + 1).all<ItemRow>();
  const page = rows.results.slice(0, limit);
  const last = page.at(-1);
  await audit(env.DB, { workspaceId: p.workspaceId, actor: p.principalId, act: p.act, action: 'items.listed', detail: { count: page.length } }).run();
  const extras = await extrasFor(env, p, page, scopes);
  return json({ items: page.map((i) => summary(i, extras.get(i.id))), next: rows.results.length > limit && last ? `${last.created_at}|${last.id}` : null });
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
  return json({ item: summary(item, (await extrasFor(env, p, [item])).get(id)), versions: out });
}

const corsFor = (request: Request, env: Env) => corsForOrigins(request, env.EMBED_HOSTS);

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
  const scopes = item ? await viewerScopes(env, p) : [];
  if (!item || !canSee(p, item, scopes)) return error(404, 'not_found');
  if (!canManage(p, item, scopes)) return error(403, 'not_permitted');
  if (item.revoked_at) return error(410, 'revoked');
  return item;
}

async function revokeItem(request: Request, env: Env, p: Person, id: string): Promise<Response> {
  const item = await manageable(env, p, id);
  if (item instanceof Response) return item;
  // No body means no reason; a body that is not JSON, or a reason that is not a short string, is refused.
  const text = await request.text();
  let raw: unknown = {};
  try {
    if (text.trim() !== '') raw = JSON.parse(text);
  } catch {
    return error(400, 'invalid');
  }
  const body = RevokeBody.safeParse(raw);
  if (!body.success) return error(400, 'invalid', { detail: 'reason must be a string of at most 500 characters' });
  const reason = body.data.reason || null;
  const versions = (await env.DB.prepare(`SELECT version FROM versions WHERE item_id = ?`).bind(id).all<{ version: number }>()).results;
  // Manifests first: the moment the API says "revoked", the content origin already refuses (plan D7).
  for (const v of versions) await deleteManifest(env, id, v.version);
  await env.DB.batch([
    env.DB.prepare(`UPDATE items SET revoked_at = datetime('now'), revoked_by = ?, revoke_reason = ? WHERE id = ? AND revoked_at IS NULL`).bind(p.principalId, reason, id),
    audit(env.DB, { workspaceId: p.workspaceId, actor: p.principalId, act: p.act, action: 'item.revoked', itemId: id, detail: reason ? { reason } : {} }),
  ]);
  // And again after: an expiry change or an n+1 commit that read the item before this batch may
  // have rewritten a manifest in between. From here on every writer sees revoked_at and deletes.
  for (const v of versions) await deleteManifest(env, id, v.version);
  // The index consumer reads the new state; a revoked item is un-indexed (Task B3).
  await itemChanged(env, id, item.workspace_id, 'upserted');
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
    // Again after the batch, for a manifest rewritten in between (see revokeItem).
    await deleteManifest(env, id, version);
  }
  await itemChanged(env, id, item.workspace_id, 'upserted');
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
  // Plan D7: the content Worker reads the expiry from each manifest. Only live versions are
  // rewritten; for a revoked one writeManifest would delete the manifest, never write it.
  const live = (await env.DB.prepare(`SELECT version FROM versions WHERE item_id = ? AND revoked_at IS NULL`).bind(id).all<{ version: number }>()).results;
  for (const v of live) await writeManifest(env, id, v.version);
  {
    const now = (await loadItem(env, id))!;
    return json({ item: summary(now, (await extrasFor(env, p, [now])).get(id)) });
  }
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
    await itemChanged(env, id, item.workspace_id, 'upserted');
  }
  {
    const now = (await loadItem(env, id))!;
    return json({ item: summary(now, (await extrasFor(env, p, [now])).get(id)) });
  }
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
  if (sub === '/embed' && request.method === 'OPTIONS') return preflight(request, env.EMBED_HOSTS, 'POST');
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
