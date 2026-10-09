// apps/api/test/reindex.test.ts
import { SELF, createMessageBatch, env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IndexMessage } from '@superlibrary/contract';
import { indexBatch, indexItem, reconcile } from '../src/indexing/consumer';
import { cancelReindex, reindexPage, resumeReindex, startReindex } from '../src/indexing/reindex';
import { readSlots, setIndexingForTests } from '../src/indexing/vector-index';
import { search } from '../src/search/search';
import { fakeEmbedder, fakeVectorize } from './helpers/fake-vectors';
import { seedRecord } from './helpers/records';
import type { Person } from '../src/auth/caller';

const WS = 'wsp_00000000000000f1';
const person: Person = { kind: 'human', principalId: 'prn_000000000000000000a1', org: 'org_00000000000000000f01', workspaceId: WS, role: 'member', act: null };
let a: ReturnType<typeof fakeVectorize>;
let b: ReturnType<typeof fakeVectorize>;
beforeEach(async () => {
  a = fakeVectorize(); b = fakeVectorize();
  setIndexingForTests({ embedders: { 'workers-ai/bge-m3': fakeEmbedder(), 'test/next': fakeEmbedder('test/next', 1024) }, bindings: { a, b } });
  await env.DB.prepare(`INSERT OR IGNORE INTO workspaces (id, external_source, external_id) VALUES (?, 'org-plane', 'org_00000000000000000f01')`).bind(WS).run();
  await env.DB.prepare(`INSERT OR REPLACE INTO source_boards (workspace_id, board_id, name, last_seen_at) VALUES (?, 'brd_00000000000000b1', 'B', 't')`).bind(WS).run();
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

describe('re-index (spec §7, §15)', () => {
  it('search answers before, during and after a swap', async () => {
    for (let i = 1; i <= 3; i++) { await seedRecord({ id: `itm_00000000000000a${i}`, ws: WS, text: `quarterly roadmap item ${i}` }); await indexItem(env, `itm_00000000000000a${i}`); }
    const ids = async () => (await search(env, person, { query: 'quarterly roadmap', limit: 10 })).map((r) => r.itemId).sort();
    expect(await ids()).toEqual(['itm_00000000000000a1', 'itm_00000000000000a2', 'itm_00000000000000a3']);

    const pages: IndexMessage[] = [];
    const send = vi.spyOn(env.INDEX, 'send').mockImplementation((async (m: IndexMessage) => { pages.push(m); }) as never);
    expect(await startReindex(env, 'test/next')).toEqual({ slot: 'b' });
    expect(await ids()).toHaveLength(3);                       // during: reads stay on slot a
    while (pages.length) {
      const m = pages.shift()! as Extract<IndexMessage, { type: 'reindex' }>;
      await reindexPage(env, m.slot, m.after);
      expect(await ids()).toHaveLength(3);                     // every page: still answering
    }
    send.mockRestore();
    const s = await readSlots(env);
    expect(s.active).toMatchObject({ slot: 'b', embedder_id: 'test/next' });
    expect(await ids()).toEqual(['itm_00000000000000a1', 'itm_00000000000000a2', 'itm_00000000000000a3']);   // after
    expect([...b.store.values()].every((v) => v.metadata!.embedder === 'test/next')).toBe(true);
    expect(b.queries.length).toBeGreaterThan(0);
  });
  it('does not fill the old slot until its items are drained (two embedders never mix)', async () => {
    for (let i = 1; i <= 2; i++) { await seedRecord({ id: `itm_00000000000000a${i}`, ws: WS, text: `quarterly roadmap item ${i}` }); await indexItem(env, `itm_00000000000000a${i}`); }
    const pages: IndexMessage[] = [];
    const send = vi.spyOn(env.INDEX, 'send').mockImplementation((async (m: IndexMessage) => { pages.push(m); }) as never);
    await startReindex(env, 'test/next');
    while (pages.length) { const m = pages.shift()! as Extract<IndexMessage, { type: 'reindex' }>; await reindexPage(env, m.slot, m.after); }
    expect((await readSlots(env)).active.slot).toBe('b');
    await expect(startReindex(env, 'workers-ai/bge-m3')).rejects.toThrow(/slot_not_drained/);
    const sent: Array<{ body: { itemId: string } }> = [];
    const r = await reconcile({ ...env, INDEX: { sendBatch: async (m: typeof sent) => { sent.push(...m); } } as unknown as Queue<IndexMessage> });
    expect(r.queued).toBe(2);
    expect(sent.map((x) => x.body.itemId).sort()).toEqual(['itm_00000000000000a1', 'itm_00000000000000a2']);
    expect(a.store.size).toBeGreaterThan(0);
    for (const x of sent) await indexItem(env, x.body.itemId);
    expect(a.store.size).toBe(0);
    expect(await startReindex(env, 'workers-ai/bge-m3')).toEqual({ slot: 'a' });
    send.mockRestore();
  });
  it('a page with a stale cursor neither advances nor swaps; a duplicate starts no second chain', async () => {
    await seedRecord({ id: 'itm_00000000000000c1', ws: WS, text: 'alpha' });
    const sent: IndexMessage[] = [];
    const send = vi.spyOn(env.INDEX, 'send').mockImplementation((async (m: IndexMessage) => { sent.push(m); }) as never);
    await startReindex(env, 'test/next');
    await reindexPage(env, 'b', 'itm_zzz');                       // stale 'after'
    expect((await readSlots(env)).active.slot).toBe('a');
    expect((await readSlots(env)).building!.cursor).toBeNull();
    sent.length = 0;
    await env.DB.prepare(`UPDATE items SET id = id`).run();
    await reindexPage(env, 'b', null);                            // the real (last) page swaps
    expect((await readSlots(env)).active.slot).toBe('b');
    await reindexPage(env, 'b', null);                            // a duplicate after the swap
    expect((await readSlots(env)).active.slot).toBe('b');
    expect(sent).toHaveLength(0);
    send.mockRestore();
  });
  it('startReindex is atomic: a lost race throws reindex_running and sends one page', async () => {
    const send = vi.spyOn(env.INDEX, 'send').mockResolvedValue(undefined as never);
    const rs = await Promise.allSettled([startReindex(env, 'test/next'), startReindex(env, 'test/next')]);
    expect(rs.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(send).toHaveBeenCalledTimes(1);
    send.mockRestore();
  });
  it('treats NULL idle dims as 1024 (B-R14)', async () => {
    setIndexingForTests({ embedders: { 'workers-ai/bge-m3': fakeEmbedder(), 'test/wide': fakeEmbedder('test/wide', 768) }, bindings: { a, b } });
    await expect(startReindex(env, 'test/wide')).rejects.toThrow(/dimension_mismatch/);
  });
  it('cancel moves building to idle, then drains; resume re-enqueues from the cursor', async () => {
    const send = vi.spyOn(env.INDEX, 'send').mockResolvedValue(undefined as never);
    await expect(cancelReindex(env)).rejects.toThrow(/no_reindex/);
    await expect(resumeReindex(env)).rejects.toThrow(/no_reindex/);
    await startReindex(env, 'test/next');
    await env.DB.prepare(`UPDATE vector_slots SET cursor = 'itm_00000000000000c9' WHERE slot = 'b'`).run();
    send.mockClear();
    expect(await resumeReindex(env)).toEqual({ slot: 'b', after: 'itm_00000000000000c9' });
    expect(send).toHaveBeenCalledWith({ type: 'reindex', slot: 'b', after: 'itm_00000000000000c9' });
    expect(await cancelReindex(env)).toEqual({ slot: 'b' });
    expect((await readSlots(env)).building).toBeNull();
    expect((await readSlots(env)).active.slot).toBe('a');
    await reindexPage(env, 'b', 'itm_00000000000000c9');          // a stale page after the cancel
    expect((await readSlots(env)).active.slot).toBe('a');
    send.mockRestore();
  });
  it('refuses a second re-index while one is building', async () => {
    const send = vi.spyOn(env.INDEX, 'send').mockResolvedValue(undefined as never);
    await startReindex(env, 'test/next');
    await expect(startReindex(env, 'test/next')).rejects.toThrow(/reindex_running/);
    send.mockRestore();
  });
  it('a reindex page is consumed from the queue', async () => {
    const send = vi.spyOn(env.INDEX, 'send').mockResolvedValue(undefined as never);
    await startReindex(env, 'test/next');
    await indexBatch(createMessageBatch<IndexMessage>('superlibrary-index', [{ id: 'p', timestamp: new Date(), attempts: 1, body: { type: 'reindex', slot: 'b', after: null } }]), env);
    send.mockRestore();
    expect((await readSlots(env)).active.slot).toBe('b');      // no items: one page, then the swap
  });
  it('refuses an embedder whose dimensions differ from the idle slot\'s recorded dimensions', async () => {
    await env.DB.prepare(`UPDATE vector_slots SET embedder_id = 'old/768', dims = 768 WHERE slot = 'b'`).run();
    const send = vi.spyOn(env.INDEX, 'send').mockResolvedValue(undefined as never);
    await expect(startReindex(env, 'test/next')).rejects.toThrow(/dimension_mismatch/);
    send.mockRestore();
    expect((await readSlots(env)).building).toBeNull();
  });
  it('a stale page for a slot that is not building does nothing', async () => {
    await reindexPage(env, 'b', null);
    expect((await readSlots(env)).active.slot).toBe('a');
  });
});

describe('POST /api/v1/admin/index/reindex', () => {
  const HUMAN = 'prn_000000000000000000a1';
  const call = (body: unknown, who = HUMAN) => SELF.fetch('https://api.test/api/v1/admin/index/reindex', { method: 'POST', headers: { 'X-Dev-Principal': who, 'X-Dev-Org': person.org, 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  afterEach(() => { (env as unknown as Record<string, unknown>).OPERATORS = ''; });
  it('is for operators only', async () => {
    expect((await call({ embedder: 'test/next' })).status).toBe(403);
  });
  it('rejects a bad body and an unknown embedder', async () => {
    (env as unknown as Record<string, unknown>).OPERATORS = HUMAN;
    expect((await call('not json')).status).toBe(400);
    expect((await call({})).status).toBe(400);
    const r = await call({ embedder: 'nope/none' });
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ error: 'unknown_embedder' });
  });
  it('answers 202 with the slot, then 409 while it runs', async () => {
    (env as unknown as Record<string, unknown>).OPERATORS = HUMAN;
    const r = await call({ embedder: 'test/next' });
    expect(r.status).toBe(202);
    expect(await r.json()).toEqual({ slot: 'b' });
    const again = await call({ embedder: 'test/next' });
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ error: 'reindex_running' });
  });
  it('cancel and resume are operators only and answer 404 with nothing building', async () => {
    const post = (path: string) => SELF.fetch(`https://api.test/api/v1/admin/index/reindex/${path}`, { method: 'POST', headers: { 'X-Dev-Principal': HUMAN, 'X-Dev-Org': person.org } });
    expect((await post('cancel')).status).toBe(403);
    (env as unknown as Record<string, unknown>).OPERATORS = HUMAN;
    expect((await post('cancel')).status).toBe(404);
    expect((await post('resume')).status).toBe(404);
    expect((await call({ embedder: 'test/next' })).status).toBe(202);
    expect((await post('cancel')).status).toBe(202);
    expect((await readSlots(env)).building).toBeNull();
  });
  it('resume answers 202 while building', async () => {
    (env as unknown as Record<string, unknown>).OPERATORS = HUMAN;
    expect((await call({ embedder: 'test/next' })).status).toBe(202);
    const r = await SELF.fetch('https://api.test/api/v1/admin/index/reindex/resume', { method: 'POST', headers: { 'X-Dev-Principal': HUMAN, 'X-Dev-Org': person.org } });
    expect(r.status).toBe(202);
  });
  it('answers 409 slot_not_drained while an item still records the idle slot', async () => {
    (env as unknown as Record<string, unknown>).OPERATORS = HUMAN;
    await env.DB.prepare(`INSERT INTO index_state (item_id, digest, chunk_ids, slots, indexed_at) VALUES ('itm_00000000000000e1', 'd', '[]', '{"b":"x"}', 't')`).run();
    try {
      const r = await call({ embedder: 'test/next' });
      expect(r.status).toBe(409);
      expect(await r.json()).toMatchObject({ error: 'slot_not_drained' });
    } finally { await env.DB.prepare(`DELETE FROM index_state WHERE item_id = 'itm_00000000000000e1'`).run(); }
  });
});
