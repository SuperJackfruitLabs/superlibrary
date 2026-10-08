import { SELF, env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { API, upload } from './helpers/upload';
import { HUMAN_2, OTHER_ORG, devHeaders } from './helpers/org-plane';
import { useSigningKey } from './helpers/signing';

beforeAll(useSigningKey);
const post = (path: string, body: object = {}, headers = devHeaders()) =>
  SELF.fetch(`${API}${path}`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(body) });
const patch = (id: string, body: object, headers = devHeaders()) =>
  SELF.fetch(`${API}/api/v1/items/${id}`, { method: 'PATCH', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(body) });
const get = (id: string, headers = devHeaders()) => SELF.fetch(`${API}/api/v1/items/${id}`, { headers });
const auditRows = (action: string, itemId: string) =>
  env.DB.prepare(`SELECT actor, detail FROM audit_events WHERE action = ? AND item_id = ?`).bind(action, itemId).all<{ actor: string; detail: string }>();
const ISO_Z = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const BOARD = 'board:brd_00000000000000b1';

describe('revocation is immediate', () => {
  it('revoking an item deletes every manifest at once and refuses new embeds', async () => {
    const r = await upload([{ path: 'a.md', body: '# 1' }]);
    await upload([{ path: 'a.md', body: '# 2' }], { item: r.body.itemId });
    const res = await post(`/api/v1/items/${r.body.itemId}/revoke`, { reason: 'posted by mistake' });
    expect(res.status).toBe(200);
    expect(await env.BLOBS.head(`manifests/${r.body.itemId}/1.json`)).toBeNull();
    expect(await env.BLOBS.head(`manifests/${r.body.itemId}/2.json`)).toBeNull();
    expect((await post(`/api/v1/items/${r.body.itemId}/embed`)).status).toBe(410);
    const a = await env.DB.prepare(`SELECT detail FROM audit_events WHERE action = 'item.revoked' AND item_id = ?`).bind(r.body.itemId).first<{ detail: string }>();
    expect(JSON.parse(a!.detail)).toEqual({ reason: 'posted by mistake' });
  });

  it('revoking one version leaves the others viewable; the default embed is the newest live one', async () => {
    const r = await upload([{ path: 'a.md', body: '# v1' }]);
    await upload([{ path: 'a.md', body: '# v2' }], { item: r.body.itemId });
    expect((await post(`/api/v1/items/${r.body.itemId}/versions/2/revoke`)).status).toBe(200);
    expect(await env.BLOBS.head(`manifests/${r.body.itemId}/2.json`)).toBeNull();
    expect(await env.BLOBS.head(`manifests/${r.body.itemId}/1.json`)).not.toBeNull();
    expect((await post(`/api/v1/items/${r.body.itemId}/embed`, { version: 2 })).status).toBe(410);
    expect(await (await post(`/api/v1/items/${r.body.itemId}/embed`)).json()).toMatchObject({ version: 1 });
  });

  it('only the uploader or an owner may revoke', async () => {
    // A fresh workspace, so who is owner does not depend on test order: the first person seen is.
    const org = 'org_00000000000000000a77';
    const owner = devHeaders('prn_000000000000000000b1', org);
    const uploader = devHeaders('prn_000000000000000000b2', org);
    const stranger = devHeaders('prn_000000000000000000b3', org);
    await SELF.fetch(`${API}/api/v1/me`, { headers: owner });
    const r = await upload([{ path: 'a.md', body: '# owned' }], { headers: uploader });
    const refused = await post(`/api/v1/items/${r.body.itemId}/revoke`, {}, stranger);
    expect(refused.status).toBe(403);
    expect(await refused.json()).toEqual({ error: 'not_permitted' });
    expect((await post(`/api/v1/items/${r.body.itemId}/versions/1/revoke`, {}, stranger)).status).toBe(403);
    expect(await env.BLOBS.head(`manifests/${r.body.itemId}/1.json`)).not.toBeNull();
    expect((await post(`/api/v1/items/${r.body.itemId}/revoke`, {}, owner)).status).toBe(200);
  });

  it('revokedAt comes back as ISO 8601 UTC with Z, for the item and for a version', async () => {
    const r = await upload([{ path: 'a.md', body: '# iso v1' }]);
    await upload([{ path: 'a.md', body: '# iso v2' }], { item: r.body.itemId });
    const v = await (await post(`/api/v1/items/${r.body.itemId}/versions/1/revoke`)).json<{ revoked: boolean; version: number; revokedAt: string }>();
    expect(v).toMatchObject({ revoked: true, version: 1 });
    expect(v.revokedAt).toMatch(ISO_Z);
    const d = await (await get(r.body.itemId)).json<{ versions: Array<{ version: number; revokedAt: string | null }> }>();
    expect(d.versions.find((x) => x.version === 1)!.revokedAt).toBe(v.revokedAt);
    expect(d.versions.find((x) => x.version === 2)!.revokedAt).toBeNull();
    const i = await (await post(`/api/v1/items/${r.body.itemId}/revoke`)).json<{ revoked: boolean; revokedAt: string }>();
    expect(i.revoked).toBe(true);
    expect(i.revokedAt).toMatch(ISO_Z);
    const stored = await env.DB.prepare(`SELECT revoked_at, revoked_by FROM items WHERE id = ?`).bind(r.body.itemId).first<{ revoked_at: string; revoked_by: string }>();
    expect(i.revokedAt).toBe(`${stored!.revoked_at.replace(' ', 'T')}Z`);
  });

  it('refuses a second revoke (410), an unknown version (404), and another workspace’s item (404)', async () => {
    const r = await upload([{ path: 'a.md', body: '# refusals' }]);
    expect((await post(`/api/v1/items/${r.body.itemId}/versions/9/revoke`)).status).toBe(404);
    expect((await post(`/api/v1/items/${r.body.itemId}/revoke`, {}, devHeaders(undefined, OTHER_ORG))).status).toBe(404);
    expect((await post(`/api/v1/items/${r.body.itemId}/revoke`)).status).toBe(200);
    const again = await post(`/api/v1/items/${r.body.itemId}/revoke`);
    expect(again.status).toBe(410);
    expect(await again.json()).toEqual({ error: 'revoked' });
    expect((await auditRows('item.revoked', r.body.itemId)).results).toHaveLength(1);
  });

  it('revoking a version twice is answered the same and audited once', async () => {
    const r = await upload([{ path: 'a.md', body: '# twice' }]);
    expect((await post(`/api/v1/items/${r.body.itemId}/versions/1/revoke`)).status).toBe(200);
    expect((await post(`/api/v1/items/${r.body.itemId}/versions/1/revoke`)).status).toBe(200);
    expect((await auditRows('version.revoked', r.body.itemId)).results).toHaveLength(1);
  });
});

describe('expiry', () => {
  it('sets a future expiry, writes it into the manifests, and refuses a past one', async () => {
    const r = await upload([{ path: 'a.md', body: '# e' }]);
    const at = new Date(Date.now() + 86_400_000).toISOString();
    const res = await patch(r.body.itemId, { expiresAt: at });
    expect(res.status).toBe(200);
    expect((await (await env.BLOBS.get(`manifests/${r.body.itemId}/1.json`))!.json<{ expiresAt: string }>()).expiresAt).toBe(at);
    expect((await patch(r.body.itemId, { expiresAt: new Date(Date.now() - 1000).toISOString() })).status).toBe(400);
    expect((await patch(r.body.itemId, { expiresAt: null })).status).toBe(200);
  });

  it('answers the item, clears the manifests on null, and audits each change', async () => {
    const r = await upload([{ path: 'a.md', body: '# e2' }]);
    const at = new Date(Date.now() + 3_600_000).toISOString();
    const set = await (await patch(r.body.itemId, { expiresAt: at })).json<{ item: { id: string; expiresAt: string } }>();
    expect(set.item).toMatchObject({ id: r.body.itemId, expiresAt: at });
    const cleared = await (await patch(r.body.itemId, { expiresAt: null })).json<{ item: { expiresAt: string | null } }>();
    expect(cleared.item.expiresAt).toBeNull();
    expect((await (await env.BLOBS.get(`manifests/${r.body.itemId}/1.json`))!.json<{ expiresAt: string | null }>()).expiresAt).toBeNull();
    expect((await auditRows('item.expiry_set', r.body.itemId)).results.map((x) => JSON.parse(x.detail))).toEqual([{ expiresAt: at }, { expiresAt: null }]);
  });

  it('never brings back a revoked version’s manifest', async () => {
    const r = await upload([{ path: 'a.md', body: '# e3 v1' }]);
    await upload([{ path: 'a.md', body: '# e3 v2' }], { item: r.body.itemId });
    await post(`/api/v1/items/${r.body.itemId}/versions/1/revoke`);
    expect((await patch(r.body.itemId, { expiresAt: new Date(Date.now() + 3_600_000).toISOString() })).status).toBe(200);
    expect(await env.BLOBS.head(`manifests/${r.body.itemId}/1.json`)).toBeNull();
    expect(await env.BLOBS.head(`manifests/${r.body.itemId}/2.json`)).not.toBeNull();
  });

  it('refuses a malformed body, a stranger, and a revoked item', async () => {
    const r = await upload([{ path: 'a.md', body: '# e4' }]);
    expect((await patch(r.body.itemId, { expiresAt: 'tomorrow' })).status).toBe(400);
    expect((await patch(r.body.itemId, {})).status).toBe(400);
    const stranger = await patch(r.body.itemId, { expiresAt: null }, devHeaders(HUMAN_2));
    expect(stranger.status).toBe(403);
    expect(await stranger.json()).toEqual({ error: 'not_permitted' });
    await post(`/api/v1/items/${r.body.itemId}/revoke`);
    expect((await patch(r.body.itemId, { expiresAt: null })).status).toBe(410);
  });
});

describe('widening scope (spec §4: a person’s act, audited)', () => {
  const scope = (id: string, body: object, headers = devHeaders()) => post(`/api/v1/items/${id}/scope`, body, headers);

  it('widens a board item to the workspace, once, recorded with from and to', async () => {
    const r = await upload([{ path: 'a.md', body: '# board' }], { scope: BOARD });
    expect((await get(r.body.itemId, devHeaders(HUMAN_2))).status).toBe(404);
    const res = await scope(r.body.itemId, { scope: 'workspace' });
    expect(res.status).toBe(200);
    expect((await res.json<{ item: { scope: string } }>()).item.scope).toBe('workspace');
    expect((await get(r.body.itemId, devHeaders(HUMAN_2))).status).toBe(200);
    // Idempotent: the same answer, no second record.
    const again = await scope(r.body.itemId, { scope: 'workspace' });
    expect(again.status).toBe(200);
    expect((await again.json<{ item: { scope: string } }>()).item.scope).toBe('workspace');
    const rows = (await auditRows('item.scope_changed', r.body.itemId)).results;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.actor).toBe(devHeaders()['X-Dev-Principal']);
    expect(JSON.parse(rows[0]!.detail)).toEqual({ from: BOARD, to: 'workspace' });
  });

  it('refuses narrowing, a malformed scope, and anyone but the uploader or an owner', async () => {
    const r = await upload([{ path: 'a.md', body: '# wide' }]);
    const narrow = await scope(r.body.itemId, { scope: BOARD });
    expect(narrow.status).toBe(400);
    expect(await narrow.json()).toMatchObject({ error: 'invalid' });
    expect((await scope(r.body.itemId, { scope: 'everyone' })).status).toBe(400);
    expect((await scope(r.body.itemId, {})).status).toBe(400);
    expect((await scope(r.body.itemId, { scope: 'workspace' }, devHeaders(HUMAN_2))).status).toBe(403);
    expect((await env.DB.prepare(`SELECT scope FROM items WHERE id = ?`).bind(r.body.itemId).first<{ scope: string }>())!.scope).toBe('workspace');

    const b = await upload([{ path: 'a.md', body: '# board 2' }], { scope: BOARD });
    expect((await scope(b.body.itemId, { scope: 'board:brd_00000000000000b2' })).status).toBe(400);
    expect((await scope(b.body.itemId, { scope: 'workspace' }, devHeaders(HUMAN_2))).status).toBe(404);
    expect((await env.DB.prepare(`SELECT scope FROM items WHERE id = ?`).bind(b.body.itemId).first<{ scope: string }>())!.scope).toBe(BOARD);
    expect((await auditRows('item.scope_changed', b.body.itemId)).results).toHaveLength(0);
  });

  it('an owner may widen a member’s workspace-visible item; a revoked item is gone', async () => {
    const org = 'org_00000000000000000a78';
    const owner = devHeaders('prn_000000000000000000c1', org);
    const member = devHeaders('prn_000000000000000000c2', org);
    await SELF.fetch(`${API}/api/v1/me`, { headers: owner });
    const r = await upload([{ path: 'a.md', body: '# owner widens' }], { headers: member });
    expect((await scope(r.body.itemId, { scope: 'workspace' }, owner)).status).toBe(200);
    await post(`/api/v1/items/${r.body.itemId}/revoke`, {}, member);
    expect((await scope(r.body.itemId, { scope: 'workspace' }, owner)).status).toBe(410);
  });
});
