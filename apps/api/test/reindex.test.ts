// apps/api/test/reindex.test.ts
import { SELF, createMessageBatch, env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IndexMessage } from '@superlibrary/contract';
import { indexBatch, indexItem } from '../src/indexing/consumer';
import { reindexPage, startReindex } from '../src/indexing/reindex';
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
});
