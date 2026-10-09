import { SELF, env } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { itemChanged } from '../src/events';
import { deleteItem } from '../src/lifecycle/retention';
import { devHeaders } from './helpers/org-plane';
import { API, upload } from './helpers/upload';

// A failed assertion skips a test's own mockRestore; never let a mocked queue leak into the next test.
afterEach(() => { vi.restoreAllMocks(); });

describe('item.changed (the seam)', () => {
  it('sends one message naming the item and the change', async () => {
    const send = vi.spyOn(env.INDEX, 'send');
    await itemChanged(env, 'itm_00000000000000a1', 'wsp_00000000000000f1', 'upserted');
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'item.changed', itemId: 'itm_00000000000000a1', workspaceId: 'wsp_00000000000000f1', change: 'upserted' }));
    send.mockRestore();
  });
  it('never fails the caller when the queue refuses', async () => {
    const send = vi.spyOn(env.INDEX, 'send').mockRejectedValue(new Error('queue down'));
    await expect(itemChanged(env, 'itm_00000000000000a1', 'wsp_00000000000000f1', 'deleted')).resolves.toBeUndefined();
    send.mockRestore();
  });
  it('deleteItem removes provenance and work-record rows and says so on the queue', async () => {
    const ws = 'wsp_00000000000000f2';
    await env.DB.prepare(`INSERT OR IGNORE INTO workspaces (id, external_source, external_id) VALUES (?, 'org-plane', 'org_00000000000000000f02')`).bind(ws).run();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO items (id, workspace_id, kind, title, scope, outcome, created_by) VALUES ('itm_00000000000000a9', ?, 'work-record', 't', 'board:brd_00000000000000b1', 'completed', 'source:superpipeline')`).bind(ws),
      env.DB.prepare(`INSERT INTO item_sources (item_id, source, board_id, card_id) VALUES ('itm_00000000000000a9', 'superpipeline', 'brd_00000000000000b1', 'card_00000000000000c9')`),
      env.DB.prepare(`INSERT INTO work_records (item_id, workspace_id, board_id, card_id, digest, body, text) VALUES ('itm_00000000000000a9', ?, 'brd_00000000000000b1', 'card_00000000000000c9', 'd', '{}', '')`).bind(ws),
    ]);
    const send = vi.spyOn(env.INDEX, 'send');
    await deleteItem(env, 'itm_00000000000000a9', 'source:superpipeline', 'card deleted');
    for (const t of ['items', 'item_sources', 'work_records']) {
      const col = t === 'items' ? 'id' : 'item_id';
      expect((await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE ${col} = 'itm_00000000000000a9'`).first<{ n: number }>())!.n).toBe(0);
    }
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ itemId: 'itm_00000000000000a9', change: 'deleted' }));
    send.mockRestore();
  });
  it('revoking an item or a version, and widening scope, each say so on the queue', async () => {
    const headers = { ...devHeaders(), 'content-type': 'application/json' };
    const post = (path: string, body: unknown) => SELF.fetch(`${API}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
    const a = await upload([{ path: 'a.txt', body: 'emits on scope' }], { scope: 'board:brd_00000000000000b1' });
    expect(a.status).toBe(201);
    const send = vi.spyOn(env.INDEX, 'send');
    expect((await post(`/api/v1/items/${a.body.itemId}/scope`, { scope: 'workspace' })).status).toBe(200);
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ itemId: a.body.itemId, change: 'upserted' }));
    send.mockClear();
    expect((await post(`/api/v1/items/${a.body.itemId}/versions/1/revoke`, {})).status).toBe(200);
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ itemId: a.body.itemId, change: 'upserted' }));
    send.mockClear();
    expect((await post(`/api/v1/items/${a.body.itemId}/revoke`, {})).status).toBe(200);
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ itemId: a.body.itemId, change: 'upserted' }));
    send.mockRestore();
  });
});
