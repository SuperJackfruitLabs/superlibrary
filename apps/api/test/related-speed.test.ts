import { env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RelatedQuery } from '@superlibrary/contract';
import { indexItem } from '../src/indexing/consumer';
import { setIndexingForTests } from '../src/indexing/vector-index';
import { related } from '../src/search/related';
import type { Person } from '../src/auth/caller';
import { fakeEmbedder, fakeVectorize } from './helpers/fake-vectors';
import { seedRecord } from './helpers/records';
import { HUMAN, ORG } from './helpers/org-plane';
import { B1, call, knowBoard, workspaceOf } from './helpers/library';

let embedder: ReturnType<typeof fakeEmbedder>;
let vectors: ReturnType<typeof fakeVectorize>;
let me: Person;
beforeEach(async () => {
  embedder = fakeEmbedder(); vectors = fakeVectorize();
  setIndexingForTests({ embedders: { 'workers-ai/bge-m3': embedder }, bindings: { a: vectors } });
  const ws = await workspaceOf();
  me = { kind: 'human', principalId: HUMAN, org: ORG, workspaceId: ws, role: 'owner', act: null };
  await knowBoard(ws, B1);
  for (const [id, text] of [['itm_00000000000028a1', 'deploy the payments service'], ['itm_00000000000028a2', 'deploy the billing service'], ['itm_00000000000028a3', 'deploy the ledger service'],
    ['itm_00000000000028a4', 'deploy the search service'], ['itm_00000000000028a5', 'deploy the index service'], ['itm_00000000000028a6', 'deploy the upload service']] as const) {
    await seedRecord({ id, ws, text, title: text });
    await indexItem(env, id);
  }
});
// Storage lasts the whole file: the seeded records go after each test, so the next can seed them again.
afterEach(async () => {
  setIndexingForTests(null);
  const ids = `SELECT id FROM items WHERE id GLOB 'itm_00000000000028a*'`;
  await env.DB.batch(['chunks_fts', 'chunks', 'index_state', 'item_sources', 'work_records'].map((t) => env.DB.prepare(`DELETE FROM ${t} WHERE item_id IN (${ids})`)).concat(env.DB.prepare(`DELETE FROM items WHERE id IN (${ids})`)));
});

describe('related within the claim budget (gap S4)', () => {
  it("a card's related call reuses its record's stored vector: no embedding call", async () => {
    const before = embedder.calls.length;
    const items = await related(env, me, RelatedQuery.parse({ cardId: 'card_00000000000028a1' }));
    expect(embedder.calls.length).toBe(before);
    expect(items.map((x) => x.itemId)).toContain('itm_00000000000028a2');
  });
  it('a record not yet in the vector index falls back to embedding its text', async () => {
    for (const k of [...vectors.store.keys()]) if (k.startsWith('itm_00000000000028a1:')) vectors.store.delete(k);
    const before = embedder.calls.length;
    await related(env, me, RelatedQuery.parse({ cardId: 'card_00000000000028a1' }));
    expect(embedder.calls.length).toBe(before + 1);
  });
  it("related reads every hit's first chunk in one round trip", async () => {
    const rt = async (limit: number) => {
      const res = await call('/api/v1/related', { method: 'POST', body: { cardId: 'card_00000000000028a1', limit } });
      return Number(/d1rt;desc="(\d+)"/.exec(res.headers.get('Server-Timing') ?? '')![1]);
    };
    expect((await rt(5)) - (await rt(1))).toBeLessThanOrEqual(1);
  });
});
