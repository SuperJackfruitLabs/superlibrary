import { SELF, env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseToken, signingMessage } from '@superlibrary/contract';
import { API, upload } from './helpers/upload';
import { seedRecord } from './helpers/records';
import { HUMAN_2, ORG, OTHER_ORG, devHeaders } from './helpers/org-plane';
import { useSigningKey } from './helpers/signing';

let publicKey: CryptoKey;
beforeAll(async () => { publicKey = await useSigningKey(); });

const embed = (id: string, body: object = {}, headers: Record<string, string> = devHeaders()) =>
  SELF.fetch(`${API}/api/v1/items/${id}/embed`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(body) });
const auditCount = async (action: string, itemId: string, actor = 'prn_000000000000000000a1') =>
  (await env.DB.prepare(`SELECT COUNT(*) AS n FROM audit_events WHERE action = ? AND item_id = ? AND actor = ?`).bind(action, itemId, actor).first<{ n: number }>())!.n;

describe('visibility (spec §4 as it applies to people in phase 1)', () => {
  it('a workspace item is visible to every member; another workspace gets 404, not 403', async () => {
    const r = await upload([{ path: 'a.md', body: '# a' }]);
    expect((await SELF.fetch(`${API}/api/v1/items/${r.body.itemId}`, { headers: devHeaders(HUMAN_2) })).status).toBe(200);
    const outsider = devHeaders('prn_000000000000000000f9', OTHER_ORG);
    for (const res of [await SELF.fetch(`${API}/api/v1/items/${r.body.itemId}`, { headers: outsider }), await embed(r.body.itemId, {}, outsider)]) {
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'not_found' });
    }
    const listed = await (await SELF.fetch(`${API}/api/v1/items`, { headers: outsider })).json<{ items: { id: string }[] }>();
    expect(listed.items.map((i) => i.id)).not.toContain(r.body.itemId);
  });

  it('a board-scoped item is visible only to its uploader until phase 3 (plan D11)', async () => {
    const r = await upload([{ path: 'b.md', body: '# b' }], { scope: 'board:brd_00000000000000b1' });
    expect((await SELF.fetch(`${API}/api/v1/items/${r.body.itemId}`)).status).toBe(401);
    expect((await SELF.fetch(`${API}/api/v1/items/${r.body.itemId}`, { headers: devHeaders() })).status).toBe(200);
    expect((await SELF.fetch(`${API}/api/v1/items/${r.body.itemId}`, { headers: devHeaders(HUMAN_2) })).status).toBe(404);
    const listed = await (await SELF.fetch(`${API}/api/v1/items?limit=100`, { headers: devHeaders(HUMAN_2) })).json<{ items: { id: string }[] }>();
    expect(listed.items.map((i) => i.id)).not.toContain(r.body.itemId);
  });
});

describe('every read is audited', () => {
  it('list, get and embed each write an audit row for the reader', async () => {
    const r = await upload([{ path: 'c.md', body: '# c' }]);
    await SELF.fetch(`${API}/api/v1/items/${r.body.itemId}`, { headers: devHeaders(HUMAN_2) });
    await embed(r.body.itemId, {}, devHeaders(HUMAN_2));
    expect(await auditCount('item.read', r.body.itemId, HUMAN_2)).toBe(1);
    expect(await auditCount('item.viewed', r.body.itemId, HUMAN_2)).toBe(1);
    await SELF.fetch(`${API}/api/v1/items`, { headers: devHeaders(HUMAN_2) });
    const listed = await env.DB.prepare(`SELECT COUNT(*) AS n FROM audit_events WHERE action = 'items.listed' AND actor = ?`).bind(HUMAN_2).first<{ n: number }>();
    expect(listed!.n).toBeGreaterThan(0);
  });
});

describe('the embed URL', () => {
  it("is a 5-minute signed URL for one item version on the item's own subdomain", async () => {
    const r = await upload([{ path: 'd.md', body: '# d' }]);
    const before = Math.floor(Date.now() / 1000);
    const grant = await (await embed(r.body.itemId)).json<{ url: string; downloadUrl: string; expiresAt: string; version: number; itemUrl: string }>();
    const u = new URL(grant.url);
    expect(u.origin).toBe(`https://${r.body.itemId.replace('_', '-')}.content.test`);
    expect(u.pathname).toBe('/_view');
    const t = parseToken(u.searchParams.get('sig')!)!;
    expect(t.version).toBe(1);
    expect(t.exp - before).toBeGreaterThanOrEqual(299);
    expect(t.exp - before).toBeLessThanOrEqual(301);
    expect(t.host).toBe(API);
    expect(await crypto.subtle.verify('Ed25519', publicKey, t.sig, signingMessage({ itemId: r.body.itemId, version: 1, exp: t.exp, host: t.host }))).toBe(true);
    expect(grant.downloadUrl).toBe(`https://${r.body.itemId.replace('_', '-')}.content.test/s/${u.searchParams.get('sig')}/d.md?download=1`);
    expect(grant.itemUrl).toBe(`${API}/a/${r.body.itemId}/v/1`);
    expect(Date.parse(grant.expiresAt) / 1000).toBe(t.exp);
  });

  it('signs the requesting host when it is allowed, and answers its CORS preflight; others get the app', async () => {
    const r = await upload([{ path: 'e.md', body: '# e' }]);
    const pre = await SELF.fetch(`${API}/api/v1/items/${r.body.itemId}/embed`, { method: 'OPTIONS', headers: { Origin: 'https://host.test', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization, content-type' } });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-origin')).toBe('https://host.test');
    expect(pre.headers.get('access-control-allow-credentials')).toBeNull();
    const fromHost = await embed(r.body.itemId, {}, { ...devHeaders(), Origin: 'https://host.test' });
    expect(fromHost.headers.get('access-control-allow-origin')).toBe('https://host.test');
    expect(parseToken(new URL((await fromHost.json<{ url: string }>()).url).searchParams.get('sig')!)!.host).toBe('https://host.test');
    const evil = await embed(r.body.itemId, {}, { ...devHeaders(), Origin: 'https://evil.test' });
    expect(evil.headers.get('access-control-allow-origin')).toBeNull();
    expect(parseToken(new URL((await evil.json<{ url: string }>()).url).searchParams.get('sig')!)!.host).toBe(API);
    const evilPre = await SELF.fetch(`${API}/api/v1/items/${r.body.itemId}/embed`, { method: 'OPTIONS', headers: { Origin: 'https://evil.test', 'Access-Control-Request-Method': 'POST' } });
    expect(evilPre.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('an allowed host can read the refusals too, not an opaque failure', async () => {
    const r = await upload([{ path: 'f.md', body: '# f' }]);
    const fromHost = { ...devHeaders(), Origin: 'https://host.test' };
    for (const res of [await embed(r.body.itemId, { version: 9 }, fromHost), await embed('itm_00000000000000ff', {}, fromHost)]) {
      expect(res.status).toBe(404);
      expect(res.headers.get('access-control-allow-origin')).toBe('https://host.test');
    }
    expect((await embed(r.body.itemId, { version: 9 }, { ...devHeaders(), Origin: 'https://evil.test' })).headers.get('access-control-allow-origin')).toBeNull();
  });

  it('names a version, refuses one that does not exist, and has no download for a folder', async () => {
    const r = await upload([{ path: 's/index.html', body: '<!doctype html>' }, { path: 's/a.css', body: 'p{}' }]);
    expect((await embed(r.body.itemId, { version: 2 })).status).toBe(404);
    const g = await (await embed(r.body.itemId, { version: 1 })).json<{ downloadUrl: string | null }>();
    expect(g.downloadUrl).toBeNull();
  });
});

type FileEntry = { path: string; mediaType: string; view: string; bytes: number };

/** What D1 holds for one version's files, in the order given. */
async function filesOf(itemId: string, version: number, order: string[]): Promise<FileEntry[]> {
  const rows = await env.DB.prepare(`SELECT path, media_type, view, bytes FROM version_files WHERE item_id = ? AND version = ?`).bind(itemId, version)
    .all<{ path: string; media_type: string; view: string; bytes: number }>();
  expect(rows.results.map((r) => r.path).sort()).toEqual([...order].sort());
  return order.map((p) => {
    const r = rows.results.find((x) => x.path === p)!;
    return { path: r.path, mediaType: r.media_type, view: r.view, bytes: r.bytes };
  });
}

describe("a version's file list (the host toolbar's Files)", () => {
  // Plain string order would give s/a-b.css, s/a.css, s/a/x.css (because '-' < '.' < '/'); tree order
  // compares segment by segment, so the folder s/a sorts before its siblings a-b.css and a.css.
  const FOLDER = [
    { path: 's/a.css', body: 'p{}' },
    { path: 's/a-b.css', body: 'b{}' },
    { path: 's/index.html', body: '<!doctype html><p>hi</p>' },
    { path: 's/a/x.css', body: 'x{color:red}' },
    { path: 'readme.txt', body: 'top' },
  ];
  const TREE = ['s/index.html', 'readme.txt', 's/a/x.css', 's/a-b.css', 's/a.css'];

  it('the embed grant names the entry and lists every file, entry first, then in tree order', async () => {
    const r = await upload(FOLDER);
    const g = await (await embed(r.body.itemId)).json<{ entry: string; files: FileEntry[] }>();
    expect(g.entry).toBe('s/index.html');
    expect(g.files).toEqual(await filesOf(r.body.itemId, 1, TREE));
    expect(g.files.find((f) => f.path === 's/index.html')).toMatchObject({ view: 'html', bytes: 24 });
    expect(g.files.find((f) => f.path === 's/a/x.css')).toMatchObject({ view: 'code', bytes: 12 });
  });

  it('a single file lists itself', async () => {
    const r = await upload([{ path: 'note.md', body: '# n' }]);
    const g = await (await embed(r.body.itemId)).json<{ entry: string; files: FileEntry[] }>();
    expect(g.entry).toBe('note.md');
    expect(g.files).toEqual([{ path: 'note.md', mediaType: (await filesOf(r.body.itemId, 1, ['note.md']))[0]!.mediaType, view: 'markdown', bytes: 3 }]);
  });

  it("the item detail carries each version's own list, in the same order", async () => {
    const v1 = await upload(FOLDER);
    await upload([{ path: 'only/index.html', body: '<!doctype html>' }, { path: 'only/b.js', body: 'let b' }], { item: v1.body.itemId });
    const d = await (await SELF.fetch(`${API}/api/v1/items/${v1.body.itemId}`, { headers: devHeaders() })).json<{ versions: { version: number; files: FileEntry[] }[] }>();
    expect(d.versions.map((v) => v.version)).toEqual([2, 1]);
    expect(d.versions[0]!.files).toEqual(await filesOf(v1.body.itemId, 2, ['only/index.html', 'only/b.js']));
    expect(d.versions[1]!.files).toEqual(await filesOf(v1.body.itemId, 1, TREE));
    const g = await (await embed(v1.body.itemId, { version: 1 })).json<{ files: FileEntry[] }>();
    expect(g.files).toEqual(d.versions[1]!.files);
  });
});

describe('item listing and detail', () => {
  it('lists newest first with a cursor, and shows versions', async () => {
    const h = devHeaders('prn_000000000000000000c1', 'org_00000000000000000f06');
    const a = await upload([{ path: 'a.txt', body: 'a' }], { headers: h, title: 'A' });
    // created_at has one-second resolution: age A so the order does not depend on the clock.
    await env.DB.prepare(`UPDATE items SET created_at = datetime(created_at, '-1 minute') WHERE id = ?`).bind(a.body.itemId).run();
    const b = await upload([{ path: 'b.txt', body: 'b' }], { headers: h, title: 'B' });
    await upload([{ path: 'b.txt', body: 'b2' }], { headers: h, item: b.body.itemId, title: 'B' });
    const page1 = await (await SELF.fetch(`${API}/api/v1/items?limit=1`, { headers: h })).json<{ items: { id: string }[]; next: string }>();
    expect(page1.items.map((i) => i.id)).toEqual([b.body.itemId]);
    const page2 = await (await SELF.fetch(`${API}/api/v1/items?limit=1&before=${encodeURIComponent(page1.next)}`, { headers: h })).json<{ items: { id: string }[] }>();
    expect(page2.items.map((i) => i.id)).toEqual([a.body.itemId]);
    const detail = await (await SELF.fetch(`${API}/api/v1/items/${b.body.itemId}`, { headers: h })).json<{ item: { latestVersion: number }; versions: { version: number }[] }>();
    expect(detail.item.latestVersion).toBe(2);
    expect(detail.versions.map((v) => v.version)).toEqual([2, 1]);
  });
});

describe('timestamps', () => {
  const ISO_Z = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
  it('are ISO 8601 UTC with Z in the list and the detail, though D1 stores SQLite time', async () => {
    const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
    const r = await upload([{ path: 't.md', body: '# t' }], { expiresAt });
    const stored = await env.DB.prepare(`SELECT created_at FROM items WHERE id = ?`).bind(r.body.itemId).first<{ created_at: string }>();
    expect(stored!.created_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    const d = await (await SELF.fetch(`${API}/api/v1/items/${r.body.itemId}`, { headers: devHeaders() })).json<{ item: { createdAt: string; expiresAt: string }; versions: { createdAt: string }[] }>();
    expect(d.item.createdAt).toBe(stored!.created_at.replace(' ', 'T') + 'Z');
    expect(d.versions[0]!.createdAt).toMatch(ISO_Z);
    expect(d.item.expiresAt).toMatch(ISO_Z);
    expect(Date.parse(d.item.expiresAt)).toBe(Date.parse(expiresAt));
    const listed = await (await SELF.fetch(`${API}/api/v1/items?limit=100`, { headers: devHeaders() })).json<{ items: { id: string; createdAt: string }[] }>();
    expect(listed.items.find((i) => i.id === r.body.itemId)!.createdAt).toBe(d.item.createdAt);
  });
});

describe('supersededBy on the phase-1 routes names only a replacement the person can see', () => {
  const B1 = 'brd_00000000000000b1';
  const B2 = 'brd_00000000000000b2';
  const oldId = (n: number) => `itm_0000000000000${n}d1`;
  const newId = (n: number) => `itm_0000000000000${n}d2`;
  async function setup(n: number) {
    await SELF.fetch(`${API}/api/v1/items`, { headers: devHeaders() }); // creates the workspace
    const ws = (await env.DB.prepare(`SELECT id FROM workspaces WHERE external_id = ?`).bind(ORG).first<{ id: string }>())!.id;
    await env.DB.prepare(`INSERT OR REPLACE INTO source_boards (workspace_id, board_id, name, last_seen_at) VALUES (?, ?, 'B', 't')`).bind(ws, B1).run();
    await seedRecord({ id: oldId(n), ws, board: B1, text: 'old plan', outcome: 'superseded' });
    await env.DB.prepare(`UPDATE work_records SET superseded_by_card = ? WHERE item_id = ?`).bind(`card_${newId(n).slice(4)}`, oldId(n)).run();
    return ws;
  }
  const named = async (n: number) => {
    const l = await (await SELF.fetch(`${API}/api/v1/items?limit=100`, { headers: devHeaders() })).json<{ items: { id: string; supersededBy?: string | null }[] }>();
    const d = await (await SELF.fetch(`${API}/api/v1/items/${oldId(n)}`, { headers: devHeaders() })).json<{ item: { supersededBy?: string | null } }>();
    return [l.items.find((i) => i.id === oldId(n))!.supersededBy, d.item.supersededBy];
  };

  it('names a visible, live replacement', async () => {
    const ws = await setup(1);
    await seedRecord({ id: newId(1), ws, board: B1, text: 'new plan' });
    expect(await named(1)).toEqual([newId(1), newId(1)]);
  });
  it('does not name a revoked replacement', async () => {
    const ws = await setup(2);
    await seedRecord({ id: newId(2), ws, board: B1, text: 'new plan' });
    await env.DB.prepare(`UPDATE items SET revoked_at = '2026-01-01T00:00:00.000Z' WHERE id = ?`).bind(newId(2)).run();
    expect(await named(2)).toEqual([null, null]);
  });
  it('does not name a replacement on a board unknown to the person', async () => {
    const ws = await setup(3);
    await seedRecord({ id: newId(3), ws, board: B2, text: 'new plan' });
    expect(await named(3)).toEqual([null, null]);
  });
});
