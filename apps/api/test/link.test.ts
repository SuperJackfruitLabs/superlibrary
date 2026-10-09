import { SELF, env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureWorkspace } from '../src/auth/caller';
import { AGENT, HUMAN, planeToken, withOrgPlane } from './helpers/org-plane';
import { API, HUB_SVC, hubHeaders, sha256Hex, upload } from './helpers/upload';

const bag = env as unknown as Record<string, unknown>;
const AGENT_2 = 'prn_000000000000000000a3';
const BOARD = 'brd_00000000000000b1';
const SCOPE = `board:${BOARD}`;
const SRC = { station: 'stn_1', stationName: 'builder', path: 'out/report.md', board: BOARD, card: 'card_00000000000000c1', run: 'run_00000000000000d1' };
beforeEach(() => { bag.HUB_SERVICE_PRINCIPAL = HUB_SVC; });
afterEach(() => { bag.HUB_SERVICE_PRINCIPAL = ''; });

const provenance = (itemId: string) =>
  env.DB.prepare(`SELECT source, agent_principal, via_service, station, station_name, source_path, board_id, card_id, run_id FROM item_sources WHERE item_id = ?`).bind(itemId).first();

describe('an agent links through the hub (spec §5)', () => {
  it('creates an item by the agent, scoped to the board, with its provenance, and emits item.changed', async () => {
    await withOrgPlane(async () => {
      const send = vi.spyOn(env.INDEX, 'send');
      const r = await upload([{ path: 'report.md', body: '# Report\n' }], { headers: await hubHeaders(AGENT), scope: SCOPE, source: SRC });
      expect(r.status).toBe(201);
      const item = await env.DB.prepare(`SELECT created_by, scope FROM items WHERE id = ?`).bind(r.body.itemId).first();
      expect(item).toEqual({ created_by: AGENT, scope: SCOPE });
      expect(await provenance(r.body.itemId)).toEqual({
        source: 'agentpod', agent_principal: AGENT, via_service: HUB_SVC, station: 'stn_1', station_name: 'builder', source_path: 'out/report.md',
        board_id: BOARD, card_id: 'card_00000000000000c1', run_id: 'run_00000000000000d1',
      });
      const created = await env.DB.prepare(`SELECT act FROM audit_events WHERE item_id = ? AND action = 'item.created'`).bind(r.body.itemId).first();
      expect(created).toEqual({ act: HUB_SVC });
      expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'item.changed', itemId: r.body.itemId, change: 'upserted' }));
      send.mockRestore();
    });
  });

  it('linking the same station path again is version n+1 of the same item, with the latest run (spec §3)', async () => {
    await withOrgPlane(async () => {
      const h = await hubHeaders(AGENT);
      const src = { ...SRC, path: 'out/twice.md' };
      const a = await upload([{ path: 'twice.md', body: 'v1' }], { headers: h, scope: SCOPE, source: src });
      const later = { ...src, stationName: 'builder-2', card: 'card_00000000000000c2', run: 'run_00000000000000d2' };
      const b = await upload([{ path: 'twice.md', body: 'v2' }], { headers: await hubHeaders(AGENT_2), scope: SCOPE, source: later });
      expect([a.status, b.status]).toEqual([201, 201]);
      expect(b.body).toMatchObject({ itemId: a.body.itemId, version: 2 });
      expect(await provenance(a.body.itemId)).toMatchObject({ agent_principal: AGENT_2, via_service: HUB_SVC, station_name: 'builder-2', card_id: 'card_00000000000000c2', run_id: 'run_00000000000000d2' });
    });
  });

  it('a link never revives an expired item: the same path starts a new one', async () => {
    await withOrgPlane(async () => {
      const h = await hubHeaders(AGENT);
      const src = { ...SRC, path: 'out/stale.md' };
      const a = await upload([{ path: 'stale.md', body: 'v1' }], { headers: h, scope: SCOPE, source: src });
      await env.DB.prepare(`UPDATE items SET expires_at = ? WHERE id = ?`).bind(new Date(Date.now() - 1000).toISOString(), a.body.itemId).run();
      const b = await upload([{ path: 'stale.md', body: 'v2' }], { headers: h, scope: SCOPE, source: src });
      expect(b.status).toBe(201);
      expect(b.body.itemId).not.toBe(a.body.itemId);
      expect(b.body.version).toBe(1);
    });
  });

  it('the same path linked for another board is a new item there, never a version of the old board\'s item', async () => {
    await withOrgPlane(async () => {
      const h = await hubHeaders(AGENT);
      const B2 = 'brd_00000000000000b2';
      const src = { ...SRC, path: 'out/cross.md' };
      const a = await upload([{ path: 'cross.md', body: 'b1' }], { headers: h, scope: SCOPE, source: src });
      const b = await upload([{ path: 'cross.md', body: 'b2' }], { headers: h, scope: `board:${B2}`, source: { ...src, board: B2, card: 'card_00000000000000c2', run: 'run_00000000000000d2' } });
      expect([a.status, b.status]).toEqual([201, 201]);
      expect(b.body.itemId).not.toBe(a.body.itemId);
      expect(b.body.version).toBe(1);
      expect(await env.DB.prepare(`SELECT scope, latest_version FROM items WHERE id = ?`).bind(a.body.itemId).first()).toEqual({ scope: SCOPE, latest_version: 1 });
      expect(await provenance(a.body.itemId)).toMatchObject({ board_id: BOARD, card_id: 'card_00000000000000c1', run_id: 'run_00000000000000d1' });
      expect(await provenance(b.body.itemId)).toMatchObject({ board_id: B2, card_id: 'card_00000000000000c2' });
    });
  });

  it('the same path on another station is a different item', async () => {
    await withOrgPlane(async () => {
      const h = await hubHeaders(AGENT);
      const a = await upload([{ path: 'x.md', body: 'a' }], { headers: h, scope: SCOPE, source: { ...SRC, path: 'x.md' } });
      const b = await upload([{ path: 'x.md', body: 'b' }], { headers: h, scope: SCOPE, source: { ...SRC, station: 'stn_2', path: 'x.md' } });
      expect([a.status, b.status]).toEqual([201, 201]);
      expect(b.body.itemId).not.toBe(a.body.itemId);
    });
  });

  it('an agent must say where the file came from, and the scope must be that board', async () => {
    await withOrgPlane(async () => {
      const h = await hubHeaders(AGENT);
      expect((await upload([{ path: 'a.md', body: 'a' }], { headers: h, scope: SCOPE })).body).toMatchObject({ error: 'source_required' });
      expect((await upload([{ path: 'a.md', body: 'a' }], { headers: h, scope: 'workspace', source: SRC })).body).toMatchObject({ error: 'scope_mismatch' });
    });
  });

  it('an agent cannot choose the item or an expiry', async () => {
    await withOrgPlane(async () => {
      const h = await hubHeaders(AGENT);
      const first = await upload([{ path: 'own.md', body: 'a' }], { headers: h, scope: SCOPE, source: { ...SRC, path: 'own.md' } });
      expect(first.status).toBe(201);
      const item = await upload([{ path: 'own.md', body: 'b' }], { headers: h, scope: SCOPE, source: { ...SRC, path: 'other.md' }, item: first.body.itemId });
      expect([item.status, item.body.error]).toEqual([400, 'invalid']);
      const exp = await upload([{ path: 'own.md', body: 'b' }], { headers: h, scope: SCOPE, source: { ...SRC, path: 'other.md' }, expiresAt: new Date(Date.now() + 86_400_000).toISOString() });
      expect([exp.status, exp.body.error]).toEqual([400, 'invalid']);
    });
  });

  it('a source path that escapes is refused', async () => {
    await withOrgPlane(async () => {
      const r = await upload([{ path: 'a.md', body: 'a' }], { headers: await hubHeaders(AGENT), scope: SCOPE, source: { ...SRC, path: '../../etc/passwd' } });
      expect(r.status).toBe(400);
      expect(r.body).toMatchObject({ error: 'path_refused' });
    });
  });

  it("an agent's link with a secret is refused naming file and line, with no override", async () => {
    await withOrgPlane(async () => {
      const h = await hubHeaders(AGENT);
      const r = await upload([{ path: 'notes.md', body: 'ok\nkey = ghp_' + 'a'.repeat(36) + '\n' }], { headers: h, scope: SCOPE, source: { ...SRC, path: 'notes.md' } });
      expect(r.status).toBe(422);
      expect(r.body).toMatchObject({ error: 'secret_found', findings: [{ path: 'notes.md', line: 2, rule: 'github-token' }] });
      const o = await SELF.fetch(`${API}/api/v1/uploads/${r.uploadId}/override`, { method: 'POST', headers: { ...h, 'content-type': 'application/json' }, body: JSON.stringify({ reason: 'trust me' }) });
      expect(o.status).toBe(403);
      expect(await o.json()).toMatchObject({ error: 'principal_not_supported' });
      const s = await env.DB.prepare(`SELECT override_reason FROM upload_sessions WHERE id = ?`).bind(r.uploadId).first();
      expect(s).toEqual({ override_reason: null });
    });
  });

  it("an agent's link is held to the same caps and sniffing as an upload", async () => {
    await withOrgPlane(async () => {
      const h = await hubHeaders(AGENT);
      const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52]);
      const r = await upload([{ path: 'looks.md', body: png }], { headers: h, scope: SCOPE, source: { ...SRC, path: 'looks.md' } });
      expect(r.body.mediaType).toBe('image/png');
      const big = await SELF.fetch(`${API}/api/v1/uploads`, { method: 'POST', headers: { ...h, 'content-type': 'application/json' }, body: JSON.stringify({ title: 'big', scope: SCOPE, source: { ...SRC, path: 'big.bin' }, files: [{ path: 'big.bin', bytes: 25 * 1024 * 1024 + 1, sha256: 'a'.repeat(64) }] }) });
      expect(big.status).toBe(413);
    });
  });

  it('a person may not send a source; only the hub may', async () => {
    const r = await upload([{ path: 'a.md', body: 'a' }], { scope: SCOPE, source: SRC });
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ error: 'source_not_trusted' });
  });

  it("a person's own upload emits item.changed too, and records no source (P10)", async () => {
    const send = vi.spyOn(env.INDEX, 'send');
    const r = await upload([{ path: 'mine.md', body: 'mine' }]);
    expect(r.status).toBe(201);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'item.changed', itemId: r.body.itemId, change: 'upserted' }));
    expect(await provenance(r.body.itemId)).toBeNull();
    send.mockRestore();
  });

  it('a retried commit sends item.changed again (it may have repaired a lost one)', async () => {
    const r = await upload([{ path: 'again.md', body: 'again' }]);
    expect(r.status).toBe(201);
    const send = vi.spyOn(env.INDEX, 'send');
    const again = await SELF.fetch(`${API}/api/v1/uploads/${r.uploadId}/commit`, { method: 'POST', headers: { 'X-Dev-Principal': HUMAN, 'X-Dev-Org': 'org_00000000000000000a01' } });
    expect(again.status).toBe(200);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ itemId: r.body.itemId, change: 'upserted' }));
    send.mockRestore();
  });

  it('a revoked item is never revived by a link and never listed for the station', async () => {
    await withOrgPlane(async () => {
      const h = await hubHeaders(AGENT);
      const src = { ...SRC, station: 'stn_7', path: 'rev.md' };
      const a = await upload([{ path: 'rev.md', body: 'one' }], { headers: h, scope: SCOPE, source: src });
      await env.DB.prepare(`UPDATE items SET scope = 'workspace', revoked_at = ? WHERE id = ?`).bind(new Date().toISOString(), a.body.itemId).run();
      const b = await upload([{ path: 'rev.md', body: 'two' }], { headers: h, scope: SCOPE, source: src });
      expect(b.status).toBe(201);
      expect(b.body.itemId).not.toBe(a.body.itemId);
      await env.DB.prepare(`UPDATE items SET scope = 'workspace' WHERE id = ?`).bind(b.body.itemId).run();
      const res = await SELF.fetch(`${API}/api/v1/sources/agentpod/items?station=stn_7`, { headers: { Authorization: `Bearer ${await planeToken()}` } });
      expect(((await res.json()) as { items: Array<{ id: string }> }).items.map((i) => i.id)).toEqual([b.body.itemId]);
    });
  });

  it("lists a board-scoped agent link on a board the workspace knows, and not on one it does not (plan P4)", async () => {
    await withOrgPlane(async () => {
      const ws = (await env.DB.prepare(`SELECT id FROM workspaces WHERE external_id = 'org_00000000000000000a01'`).first<{ id: string }>())?.id
        ?? (await ensureWorkspace(env.DB, 'org_00000000000000000a01'));
      const h = await hubHeaders(AGENT);
      const mine = 'brd_00000000000000b6'; // a board only this test uses, so its source_boards row cannot leak
      const known = await upload([{ path: 'k.md', body: 'k' }], { headers: h, scope: `board:${mine}`, source: { ...SRC, board: mine, station: 'stn_11', path: 'k.md' } });
      const strange = 'brd_00000000000000b7';
      const unknown = await upload([{ path: 'u.md', body: 'u' }], { headers: h, scope: `board:${strange}`, source: { ...SRC, board: strange, station: 'stn_11', path: 'u.md' } });
      await env.DB.prepare(`INSERT OR REPLACE INTO source_boards (workspace_id, board_id, name, last_seen_at) VALUES (?, ?, 'B', 't')`).bind(ws, mine).run();
      const res = await SELF.fetch(`${API}/api/v1/sources/agentpod/items?station=stn_11`, { headers: { Authorization: `Bearer ${await planeToken()}` } });
      expect(((await res.json()) as { items: Array<{ id: string }> }).items.map((i) => i.id)).toEqual([known.body.itemId]);
      expect(unknown.status).toBe(201);
      await env.DB.prepare(`DELETE FROM source_boards WHERE board_id = ?`).bind(mine).run();
    });
  });

  it('a source path on the denylist is refused, as a file path would be', async () => {
    await withOrgPlane(async () => {
      for (const path of ['.config/gh/hosts.yml', 'out/.env', '.bash_history']) {
        const r = await upload([{ path: 'a.md', body: 'a' }], { headers: await hubHeaders(AGENT), scope: SCOPE, source: { ...SRC, path } });
        expect([r.status, r.body.error, r.body.reason], path).toEqual([400, 'path_refused', 'denied']);
      }
    });
  });

  it("lists a station's items for the console, with the person's own token", async () => {
    await withOrgPlane(async () => {
      const h = await hubHeaders(AGENT);
      const a = await upload([{ path: 'l.md', body: 'l' }], { headers: h, scope: SCOPE, source: { ...SRC, station: 'stn_9', path: 'l.md' } });
      const other = await upload([{ path: 'm.md', body: 'm' }], { headers: h, scope: SCOPE, source: { ...SRC, station: 'stn_8', path: 'm.md' } });
      // A workspace-scoped link is listed whatever the board; the board-scoped case has its own test above.
      await env.DB.prepare(`UPDATE items SET scope = 'workspace' WHERE id IN (?, ?)`).bind(a.body.itemId, other.body.itemId).run();
      const res = await SELF.fetch(`${API}/api/v1/sources/agentpod/items?station=stn_9`, { headers: { Authorization: `Bearer ${await planeToken()}` } });
      expect(res.status).toBe(200);
      expect(((await res.json()) as { items: Array<{ id: string }> }).items.map((i) => i.id)).toEqual([a.body.itemId]);
      // People only: the hub acting for an agent may not list.
      const asAgent = await SELF.fetch(`${API}/api/v1/sources/agentpod/items?station=stn_9`, { headers: h });
      expect(asAgent.status).toBe(403);
      const none = await SELF.fetch(`${API}/api/v1/sources/agentpod/items`, { headers: { Authorization: `Bearer ${await planeToken()}` } });
      expect(none.status).toBe(400);
    });
  });
});

const CONSOLE = 'https://console.test';
const EVIL = 'https://evil.test';
const person = { 'X-Dev-Principal': HUMAN, 'X-Dev-Org': 'org_00000000000000000a01' };

describe('CORS for the AgentPod console (ruling RA3)', () => {
  it('answers a preflight from the console on the upload and station routes', async () => {
    for (const [path, method] of [
      ['/api/v1/uploads', 'POST'], ['/api/v1/uploads/upl_0000000000000001/files', 'PUT'], ['/api/v1/uploads/upl_0000000000000001/batch', 'POST'],
      ['/api/v1/uploads/upl_0000000000000001/commit', 'POST'], ['/api/v1/sources/agentpod/items', 'GET'],
    ] as const) {
      const pre = await SELF.fetch(`${API}${path}`, { method: 'OPTIONS', headers: { Origin: CONSOLE, 'Access-Control-Request-Method': method, 'Access-Control-Request-Headers': 'authorization, content-type' } });
      expect(pre.status, path).toBe(204);
      expect(pre.headers.get('Access-Control-Allow-Origin'), path).toBe(CONSOLE);
      expect(pre.headers.get('Vary'), path).toBe('Origin');
      expect(pre.headers.get('Access-Control-Allow-Methods'), path).toContain(method);
      expect(pre.headers.get('Access-Control-Allow-Headers'), path).toBe('authorization, content-type');
      expect(pre.headers.get('Access-Control-Max-Age'), path).toBe('600');
      expect(pre.headers.get('Access-Control-Allow-Credentials'), path).toBeNull();
    }
  });

  it("a console upload's every answer carries the origin, refusals included", async () => {
    const body = 'console';
    const declare = await SELF.fetch(`${API}/api/v1/uploads`, {
      method: 'POST', headers: { ...person, Origin: CONSOLE, 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'From the console', files: [{ path: 'c.md', bytes: body.length, sha256: await sha256Hex(body) }] }),
    });
    expect(declare.status).toBe(201);
    expect(declare.headers.get('Access-Control-Allow-Origin')).toBe(CONSOLE);
    expect(declare.headers.get('Vary')).toBe('Origin');
    const { uploadId } = await declare.json<{ uploadId: string }>();
    const put = await SELF.fetch(`${API}/api/v1/uploads/${uploadId}/files?path=c.md`, { method: 'PUT', headers: { ...person, Origin: CONSOLE }, body });
    expect([put.status, put.headers.get('Access-Control-Allow-Origin')]).toEqual([200, CONSOLE]);
    const commit = await SELF.fetch(`${API}/api/v1/uploads/${uploadId}/commit`, { method: 'POST', headers: { ...person, Origin: CONSOLE } });
    expect([commit.status, commit.headers.get('Access-Control-Allow-Origin')]).toEqual([201, CONSOLE]);
    const refused = await SELF.fetch(`${API}/api/v1/uploads`, { method: 'POST', headers: { Origin: CONSOLE, 'content-type': 'application/json' }, body: '{}' });
    expect([refused.status, refused.headers.get('Access-Control-Allow-Origin')]).toEqual([401, CONSOLE]);
    const list = await SELF.fetch(`${API}/api/v1/sources/agentpod/items?station=stn_1`, { headers: { ...person, Origin: CONSOLE } });
    expect([list.status, list.headers.get('Access-Control-Allow-Origin')]).toEqual([200, CONSOLE]);
  });

  it('an origin not in the list gets no CORS headers', async () => {
    const pre = await SELF.fetch(`${API}/api/v1/uploads`, { method: 'OPTIONS', headers: { Origin: EVIL, 'Access-Control-Request-Method': 'POST' } });
    expect(pre.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(pre.headers.get('Access-Control-Allow-Methods')).toBeNull();
    const declare = await SELF.fetch(`${API}/api/v1/uploads`, {
      method: 'POST', headers: { ...person, Origin: EVIL, 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'x', files: [{ path: 'e.md', bytes: 1, sha256: 'a'.repeat(64) }] }),
    });
    expect(declare.status).toBe(201);
    expect(declare.headers.get('Access-Control-Allow-Origin')).toBeNull();
    const list = await SELF.fetch(`${API}/api/v1/sources/agentpod/items?station=stn_1`, { headers: { ...person, Origin: EVIL } });
    expect(list.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
