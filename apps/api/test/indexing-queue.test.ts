// apps/api/test/indexing-queue.test.ts
// What the indexing queue does end to end, through indexBatch only: an item change indexes or
// removes the item, and a re-index page re-embeds every item on it into the building slot before
// the swap. Also the exports of the two indexing entry files, which the Worker, the routes and the
// tests import. Pinned before the indexing files were reorganised, so the move cannot change them.
import { createExecutionContext, createMessageBatch, env, getQueueResult } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IndexMessage } from '@superlibrary/contract';
import * as consumer from '../src/indexing/consumer';
import * as reindex from '../src/indexing/reindex';
import { readSlots, setIndexingForTests } from '../src/indexing/vector-index';
import { fakeEmbedder, fakeVectorize } from './helpers/fake-vectors';
import { seedRecord } from './helpers/records';

const WS = 'wsp_00000000000000f2';
const at = new Date().toISOString();
const batch = (bodies: IndexMessage[]) =>
  createMessageBatch<IndexMessage>('superlibrary-index', bodies.map((body, i) => ({ id: `m${i}`, timestamp: new Date(), attempts: 1, body })));
const result = (b: MessageBatch<IndexMessage>) => getQueueResult(b, createExecutionContext());
const changed = (itemId: string, change: 'upserted' | 'deleted'): IndexMessage => ({ type: 'item.changed', itemId, workspaceId: WS, change, at });

let a: ReturnType<typeof fakeVectorize>;
let b: ReturnType<typeof fakeVectorize>;
beforeEach(() => {
  a = fakeVectorize(); b = fakeVectorize();
  setIndexingForTests({ embedders: { 'workers-ai/bge-m3': fakeEmbedder(), 'test/next': fakeEmbedder('test/next', 1024) }, bindings: { a, b } });
});
afterEach(async () => {
  setIndexingForTests(null);
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM index_state`),
    env.DB.prepare(`DELETE FROM chunks_fts`),
    env.DB.prepare(`DELETE FROM chunks`),
    env.DB.prepare(`DELETE FROM item_sources`),
    env.DB.prepare(`DELETE FROM work_records`),
    env.DB.prepare(`DELETE FROM items`),
    env.DB.prepare(`UPDATE vector_slots SET state = 'idle' WHERE slot = 'b'`),
    env.DB.prepare(`UPDATE vector_slots SET state = 'active', embedder_id = 'workers-ai/bge-m3', dims = 1024 WHERE slot = 'a'`),
    env.DB.prepare(`UPDATE vector_slots SET embedder_id = NULL, dims = NULL, cursor = NULL WHERE slot = 'b'`),
  ]);
});

describe('the indexing entry files', () => {
  it('export the same names', () => {
    expect(Object.keys(consumer).sort()).toEqual(['RECONCILE_CRON', 'indexBatch', 'indexItem', 'reconcile', 'unindexItem']);
    expect(Object.keys(reindex).sort()).toEqual(['cancelReindex', 'reindexPage', 'resumeReindex', 'startReindex']);
    expect(consumer.RECONCILE_CRON).toBe('30 3 * * *');
  });
});

describe('indexBatch', () => {
  it('indexes an upserted item and removes a deleted one, acking each message', async () => {
    await seedRecord({ id: 'itm_00000000000000d1', ws: WS, text: 'harbour crane schedule' });
    const up = batch([changed('itm_00000000000000d1', 'upserted')]);
    await consumer.indexBatch(up, env);
    expect(await result(up)).toMatchObject({ ackAll: false, explicitAcks: ['m0'], retryMessages: [] });
    expect([...a.store.keys()]).toEqual(['itm_00000000000000d1:0:0']);
    expect((await env.DB.prepare(`SELECT digest FROM index_state WHERE item_id = ?`).bind('itm_00000000000000d1').first<{ digest: string }>())?.digest).not.toMatch(/^pending:/);

    const del = batch([changed('itm_00000000000000d1', 'deleted')]);
    await consumer.indexBatch(del, env);
    expect((await result(del)).explicitAcks).toEqual(['m0']);
    expect(a.store.size).toBe(0);
    expect(await env.DB.prepare(`SELECT 1 FROM index_state WHERE item_id = ?`).bind('itm_00000000000000d1').first()).toBeNull();
  });

  it('a re-index page re-embeds each item on it into the building slot, then swaps', async () => {
    for (let i = 1; i <= 3; i++) await seedRecord({ id: `itm_00000000000000e${i}`, ws: WS, text: `tide table ${i}` });
    await consumer.indexBatch(batch([1, 2, 3].map((i) => changed(`itm_00000000000000e${i}`, 'upserted'))), env);
    const send = vi.spyOn(env.INDEX, 'send').mockResolvedValue(undefined as never);
    try {
      await reindex.startReindex(env, 'test/next');
      const first = send.mock.calls[0][0] as Extract<IndexMessage, { type: 'reindex' }>;
      const page = batch([first]);
      await consumer.indexBatch(page, env);
      expect((await result(page)).explicitAcks).toEqual(['m0']);
    } finally {
      send.mockRestore();
    }
    expect([...b.store.keys()].sort()).toEqual(['itm_00000000000000e1:0:0', 'itm_00000000000000e2:0:0', 'itm_00000000000000e3:0:0']);
    expect([...b.store.values()].every((v) => v.metadata!.embedder === 'test/next')).toBe(true);
    expect((await readSlots(env)).active).toMatchObject({ slot: 'b', embedder_id: 'test/next' });
  });

  it('retries a message whose indexing throws', async () => {
    await seedRecord({ id: 'itm_00000000000000d2', ws: WS, text: 'lighthouse log' });
    setIndexingForTests({ embedders: { 'workers-ai/bge-m3': { id: 'workers-ai/bge-m3', dims: 1024, embed: async () => { throw new Error('embedder down'); } } }, bindings: { a } });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const m = batch([changed('itm_00000000000000d2', 'upserted')]);
    try {
      await consumer.indexBatch(m, env);
    } finally {
      error.mockRestore();
    }
    expect(await result(m)).toMatchObject({ explicitAcks: [], retryMessages: [{ msgId: 'm0' }] });
  });
});

