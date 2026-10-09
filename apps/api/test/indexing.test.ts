import { createExecutionContext, createMessageBatch, env, getQueueResult } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IndexMessage } from '@superlibrary/contract';
import worker from '../src/index';
import { indexBatch, indexItem, reconcile } from '../src/indexing/consumer';
import { setIndexingForTests } from '../src/indexing/vector-index';
import { fakeEmbedder, fakeVectorize } from './helpers/fake-vectors';
import { upload } from './helpers/upload';
import { devHeaders } from './helpers/org-plane';
import { seedRecord } from './helpers/records';
import { deleteItem } from '../src/lifecycle/retention';

let vec: ReturnType<typeof fakeVectorize>;
beforeEach(() => { vec = fakeVectorize(); setIndexingForTests({ embedders: { 'workers-ai/bge-m3': fakeEmbedder() }, bindings: { a: vec } }); });
afterEach(() => setIndexingForTests(null));

describe('indexItem', () => {
  it('indexes a work record into chunks, FTS rows and vectors with visibility metadata', async () => {
    await seedRecord({ id: 'itm_00000000000000b1', text: 'Launch plan for the marketing site' });
    expect(await indexItem(env, 'itm_00000000000000b1')).toBe('indexed');
    const fts = await env.DB.prepare(`SELECT chunk_id FROM chunks_fts WHERE chunks_fts MATCH '"marketing"'`).all();
    expect(fts.results).toEqual([{ chunk_id: 'itm_00000000000000b1:0:0' }]);
    const v = vec.store.get('itm_00000000000000b1:0:0')!;
    expect(v.namespace).toBe('wsp_00000000000000f1');
    expect(v.metadata).toEqual({ itemId: 'itm_00000000000000b1', scope: 'board:brd_00000000000000b1', kind: 'work-record', outcome: 'completed', embedder: 'workers-ai/bge-m3', dims: 1024, version: 0, position: 0 });
  });
  it('indexes a phase-1 upload (Markdown) by its text', async () => {
    const r = await upload([{ path: 'notes.md', body: '# Notes\n\nThe deploy runbook lives here.' }], { headers: devHeaders(), scope: 'workspace' });
    await indexItem(env, r.body.itemId);
    const fts = await env.DB.prepare(`SELECT item_id FROM chunks_fts WHERE chunks_fts MATCH '"runbook"'`).all();
    expect(fts.results).toEqual([{ item_id: r.body.itemId }]);
  });
  it('indexes an image by its title only', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52]);
    const r = await upload([{ path: 'hero.png', body: png }], { headers: devHeaders(), scope: 'workspace', title: 'Hero banner mockup' });
    await indexItem(env, r.body.itemId);
    const c = await env.DB.prepare(`SELECT text FROM chunks WHERE item_id = ?`).bind(r.body.itemId).all<{ text: string }>();
    expect(c.results.map((x) => x.text)).toEqual(['Hero banner mockup\nhero.png']);
  });
  it('a duplicate message changes nothing', async () => {
    await seedRecord({ id: 'itm_00000000000000b2', text: 'same text' });
    await indexItem(env, 'itm_00000000000000b2');
    expect(await indexItem(env, 'itm_00000000000000b2')).toBe('unchanged');
  });
  it('an outcome change re-indexes with the new metadata and drops the old chunks', async () => {
    await seedRecord({ id: 'itm_00000000000000b3', text: 'first words' });
    await indexItem(env, 'itm_00000000000000b3');
    await env.DB.prepare(`UPDATE items SET outcome = 'rejected' WHERE id = 'itm_00000000000000b3'`).run();
    expect(await indexItem(env, 'itm_00000000000000b3')).toBe('indexed');
    expect(vec.store.get('itm_00000000000000b3:0:0')!.metadata!.outcome).toBe('rejected');
    expect((await env.DB.prepare(`SELECT COUNT(*) AS n FROM chunks_fts WHERE item_id = 'itm_00000000000000b3'`).first<{ n: number }>())!.n).toBe(1);
  });
  it('changed text drops the old FTS rows', async () => {
    await seedRecord({ id: 'itm_00000000000000c3', text: 'zebra words' });
    await indexItem(env, 'itm_00000000000000c3');
    await env.DB.prepare(`UPDATE work_records SET text = 'other words entirely' WHERE item_id = 'itm_00000000000000c3'`).run();
    expect(await indexItem(env, 'itm_00000000000000c3')).toBe('indexed');
    expect((await env.DB.prepare(`SELECT COUNT(*) AS n FROM chunks_fts WHERE chunks_fts MATCH '"zebra"'`).first<{ n: number }>())!.n).toBe(0);
  });
  it("a deleted item's chunks, FTS rows and vectors are removed", async () => {
    await seedRecord({ id: 'itm_00000000000000b4', text: 'to be deleted' });
    await indexItem(env, 'itm_00000000000000b4');
    await deleteItem(env, 'itm_00000000000000b4', 'test', 'test');
    const batch = createMessageBatch<IndexMessage>('superlibrary-index', [{ id: 'm', timestamp: new Date(), attempts: 1, body: { type: 'item.changed', itemId: 'itm_00000000000000b4', workspaceId: 'wsp_00000000000000f1', change: 'deleted', at: 't' } }]);
    const ctx = createExecutionContext();
    await indexBatch(batch, env);
    expect((await getQueueResult(batch, ctx)).explicitAcks).toEqual(['m']);
    expect(vec.store.has('itm_00000000000000b4:0:0')).toBe(false);
    for (const t of ['chunks', 'index_state']) expect((await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE item_id = 'itm_00000000000000b4'`).first<{ n: number }>())!.n).toBe(0);
    expect((await env.DB.prepare(`SELECT COUNT(*) AS n FROM chunks_fts WHERE item_id = 'itm_00000000000000b4'`).first<{ n: number }>())!.n).toBe(0);
  });
  it('a revoked item is removed from the index', async () => {
    await seedRecord({ id: 'itm_00000000000000b5', text: 'revoke me' });
    await indexItem(env, 'itm_00000000000000b5');
    await env.DB.prepare(`UPDATE items SET revoked_at = datetime('now') WHERE id = 'itm_00000000000000b5'`).run();
    expect(await indexItem(env, 'itm_00000000000000b5')).toBe('removed');
    expect(vec.store.size).toBe(0);
  });
  it('writes to a building slot as well as the active one', async () => {
    const b = fakeVectorize();
    setIndexingForTests({ embedders: { 'workers-ai/bge-m3': fakeEmbedder(), 'test/other': fakeEmbedder('test/other', 1024) }, bindings: { a: vec, b } });
    await env.DB.prepare(`UPDATE vector_slots SET embedder_id = 'test/other', dims = 1024, state = 'building' WHERE slot = 'b'`).run();
    try {
      await seedRecord({ id: 'itm_00000000000000b6', text: 'both slots' });
      await indexItem(env, 'itm_00000000000000b6');
      expect(vec.store.has('itm_00000000000000b6:0:0')).toBe(true);
      expect(b.store.get('itm_00000000000000b6:0:0')!.metadata!.embedder).toBe('test/other');
    } finally {
      await env.DB.prepare(`UPDATE vector_slots SET embedder_id = NULL, dims = NULL, state = 'idle' WHERE slot = 'b'`).run();
    }
  });
});

describe('reconcile', () => {
  it('queues live items with no index state, and deletions for orphaned state', async () => {
    await seedRecord({ id: 'itm_00000000000000b7', text: 'never indexed' });
    await env.DB.prepare(`INSERT INTO index_state (item_id, digest, chunk_ids, slots, indexed_at) VALUES ('itm_00000000000000dead', 'd', '[]', '{}', 't')`).run();
    const send = vi.fn();
    const r = await reconcile({ ...env, INDEX: { sendBatch: send } as unknown as Queue<IndexMessage> });
    expect(r.queued).toBeGreaterThanOrEqual(1);
    expect(r.orphans).toBe(1);
    const bodies = send.mock.calls.flatMap((c) => c[0] as Array<{ body: any }>).map((m) => m.body);
    expect(bodies).toContainEqual(expect.objectContaining({ itemId: 'itm_00000000000000b7', change: 'upserted' }));
    expect(bodies).toContainEqual(expect.objectContaining({ itemId: 'itm_00000000000000dead', change: 'deleted' }));
    await env.DB.prepare(`DELETE FROM index_state WHERE item_id = 'itm_00000000000000dead'`).run();
  });
  it('re-queues a revoked or expired item that still holds index state', async () => {
    await seedRecord({ id: 'itm_00000000000000b8', text: 'revoked but indexed' });
    await seedRecord({ id: 'itm_00000000000000b9', text: 'expired but indexed' });
    await indexItem(env, 'itm_00000000000000b8');
    await indexItem(env, 'itm_00000000000000b9');
    await env.DB.prepare(`UPDATE items SET revoked_at = datetime('now') WHERE id = 'itm_00000000000000b8'`).run();
    await env.DB.prepare(`UPDATE items SET expires_at = '2020-01-01T00:00:00.000Z' WHERE id = 'itm_00000000000000b9'`).run();
    const send = vi.fn();
    await reconcile({ ...env, INDEX: { sendBatch: send } as unknown as Queue<IndexMessage> });
    const ids = send.mock.calls.flatMap((c) => c[0] as Array<{ body: any }>).filter((m) => m.body.change === 'upserted').map((m) => m.body.itemId);
    expect(ids).toContain('itm_00000000000000b8');
    expect(ids).toContain('itm_00000000000000b9');
  });
  it('the daily cron runs the reconcile', async () => {
    const send = vi.fn();
    const waits: Promise<unknown>[] = [];
    const ctx = { waitUntil: (p: Promise<unknown>) => { waits.push(p); }, passThroughOnException() {} } as unknown as ExecutionContext;
    await worker.scheduled!({ cron: '30 3 * * *', scheduledTime: Date.UTC(2026, 9, 9, 3, 30), noRetry() {} } as ScheduledController, { ...env, INDEX: { sendBatch: send } as unknown as Queue<IndexMessage> }, ctx);
    await Promise.all(waits);
    expect(waits).toHaveLength(1);
  });
  it('the admin route is for operators only', async () => {
    const { SELF } = await import('cloudflare:test');
    const res = await SELF.fetch('https://api.test/api/v1/admin/index/reconcile', { method: 'POST', headers: devHeaders() });
    expect(res.status).toBe(403);
  });
});
