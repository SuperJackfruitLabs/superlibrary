import { env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CollectionDetail, CollectionSummary } from '@superlibrary/contract';
import { sweep } from '../src/lifecycle/retention';
import { AGENT, HUMAN_2, devHeaders, planeToken, withOrgPlane } from './helpers/org-plane';
import { upload } from './helpers/upload';
import { call, workspaceOf } from './helpers/library';

const bag = env as unknown as Record<string, unknown>;
let ws: string;
beforeEach(async () => { ws = await workspaceOf(); await workspaceOf(HUMAN_2); });
afterEach(() => { bag.RETENTION_MODE = 'report'; });

const create = async (name: string, principal?: string) => {
  const res = await call('/api/v1/collections', { method: 'POST', body: { name }, ...(principal ? { principal } : {}) });
  return { status: res.status, body: await res.json<CollectionSummary & { error?: string }>() };
};
const add = (col: string, itemId: string, principal?: string) => call(`/api/v1/collections/${col}/items`, { method: 'POST', body: { itemId }, ...(principal ? { principal } : {}) });
const detail = async (col: string) => (await call(`/api/v1/collections/${col}`)).json<CollectionDetail>();

describe('collections (spec §3, §11)', () => {
  it('create, list and add; the name is unique ignoring case', async () => {
    const c = await create('Building in public — week 41');
    expect(c.status).toBe(201);
    expect(c.body).toMatchObject({ name: 'Building in public — week 41', itemCount: 0, canEdit: true });
    expect((await create('building in public — WEEK 41')).status).toBe(409);
    const a = await upload([{ path: 'a.md', body: '# A' }], { title: 'A' });
    expect((await add(c.body.id, a.body.itemId)).status).toBe(201);
    expect((await add(c.body.id, a.body.itemId)).status).toBe(201);   // idempotent
    const list = await (await call('/api/v1/collections')).json<{ collections: CollectionSummary[] }>();
    expect(list.collections.find((x) => x.id === c.body.id)!.itemCount).toBe(1);
    const d = await detail(c.body.id);
    expect(d.entries.map((e) => e.item.id)).toEqual([a.body.itemId]);
    const audited = await env.DB.prepare(`SELECT COUNT(*) AS n FROM audit_events WHERE action = 'collection.item_added' AND item_id = ?`).bind(a.body.itemId).first<{ n: number }>();
    expect(audited!.n).toBeGreaterThanOrEqual(1);
  });
  it('an item the person cannot see is not found, and nothing is stored', async () => {
    const c = await create('Hidden test');
    const theirs = await upload([{ path: 'x.md', body: '# x' }], { title: 'X', scope: 'board:brd_00000000000000b9', headers: devHeaders(HUMAN_2) });
    expect((await add(c.body.id, theirs.body.itemId)).status).toBe(404);
    const row = await env.DB.prepare(`SELECT 1 FROM item_references WHERE item_id = ? AND from_kind = 'collection'`).bind(theirs.body.itemId).first();
    expect(row).toBeNull();
    await env.DB.prepare(`INSERT INTO collection_items (collection_id, item_id, added_by) VALUES (?, ?, 'prn_000000000000000000a5')`).bind(c.body.id, theirs.body.itemId).run();
    const listed = await (await call('/api/v1/collections')).json<{ collections: CollectionSummary[] }>();
    expect(listed.collections.find((x) => x.id === c.body.id)!.itemCount).toBe(0);
    expect((await detail(c.body.id)).entries).toEqual([]);
  });
  it('a collection hides an entry once its item is revoked, and never counts it', async () => {
    const c = await create('Revoked test');
    const a = await upload([{ path: 'r.md', body: '# r' }], { title: 'R' });
    await add(c.body.id, a.body.itemId);
    await call(`/api/v1/items/${a.body.itemId}/revoke`, { method: 'POST', body: {} });
    expect((await detail(c.body.id)).entries).toEqual([]);
    expect((await detail(c.body.id)).itemCount).toBe(0);
  });
  it('any member adds; only the creator or an owner renames or deletes (decision O2)', async () => {
    const c = await create('Owner made');                       // HUMAN is the owner
    const a = await upload([{ path: 'm.md', body: '# m' }], { title: 'M', headers: devHeaders(HUMAN_2) });
    expect((await add(c.body.id, a.body.itemId, HUMAN_2)).status).toBe(201);
    expect((await call(`/api/v1/collections/${c.body.id}`, { method: 'PATCH', body: { name: 'Renamed' }, principal: HUMAN_2 })).status).toBe(403);
    expect((await call(`/api/v1/collections/${c.body.id}`, { method: 'DELETE', principal: HUMAN_2 })).status).toBe(403);
    const theirs = await create('Member made', HUMAN_2);
    expect((await call(`/api/v1/collections/${theirs.body.id}`, { method: 'PATCH', body: { name: 'Renamed by owner' } })).status).toBe(200);
    expect((await call(`/api/v1/collections/${theirs.body.id}`, { method: 'DELETE' })).status).toBe(204);
    expect(await env.DB.prepare(`SELECT 1 FROM item_references WHERE from_kind = 'collection' AND from_id = ?`).bind(theirs.body.id).first()).toBeNull();
  });
  it('an agent is refused', async () => {
    await withOrgPlane(async () => {
      const t = await planeToken({ sub: AGENT, principalKind: 'agent' });
      expect((await call('/api/v1/collections', { headers: { Authorization: `Bearer ${t}` } })).status).toBe(403);
    });
  });
});

describe('retention (spec §12)', () => {
  it('collection membership counts as a reference for retention', async () => {
    const c = await create('Keep these');
    const a = await upload([{ path: 'keep.md', body: '# keep' }], { title: 'Keep' });
    await add(c.body.id, a.body.itemId);
    bag.RETENTION_MODE = 'enforce';
    const later = Date.now() + 31 * 86_400_000;
    await sweep(env, later);
    expect(await env.DB.prepare(`SELECT 1 FROM items WHERE id = ?`).bind(a.body.itemId).first()).not.toBeNull();
    expect((await call(`/api/v1/collections/${c.body.id}/items/${a.body.itemId}`, { method: 'DELETE' })).status).toBe(204);
    await sweep(env, later);
    expect(await env.DB.prepare(`SELECT 1 FROM items WHERE id = ?`).bind(a.body.itemId).first()).toBeNull();
  });
  it('leaving one collection keeps the references from a second collection and from a work record', async () => {
    const c1 = await create('Ref one');
    const c2 = await create('Ref two');
    const a = await upload([{ path: 'refs.md', body: '# refs' }], { title: 'Refs' });
    await add(c1.body.id, a.body.itemId);
    await add(c2.body.id, a.body.itemId);
    await env.DB.prepare(`INSERT INTO item_references (item_id, from_kind, from_id) VALUES (?, 'work-record', 'itm_00000000000004a1')`).bind(a.body.itemId).run();
    expect((await call(`/api/v1/collections/${c1.body.id}/items/${a.body.itemId}`, { method: 'DELETE' })).status).toBe(204);
    const left = (await env.DB.prepare(`SELECT from_kind, from_id FROM item_references WHERE item_id = ? ORDER BY from_kind`).bind(a.body.itemId).all<{ from_kind: string; from_id: string }>()).results;
    expect(left).toEqual([{ from_kind: 'collection', from_id: c2.body.id }, { from_kind: 'work-record', from_id: 'itm_00000000000004a1' }]);
  });
  it('deleting an item takes it out of every collection', async () => {
    const c = await create('Delete test');
    const a = await upload([{ path: 'd.md', body: '# d' }], { title: 'D', expiresAt: new Date(Date.now() + 86_400_000).toISOString() });
    await add(c.body.id, a.body.itemId);
    await sweep(env, Date.now() + 2 * 86_400_000);   // expired: deleted in every mode
    expect(await env.DB.prepare(`SELECT 1 FROM collection_items WHERE item_id = ?`).bind(a.body.itemId).first()).toBeNull();
    expect((await detail(c.body.id)).entries).toEqual([]);
  });
});
