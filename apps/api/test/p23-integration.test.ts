import { createMessageBatch, env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IndexMessage, IngestMessage } from '@superlibrary/contract';
import { ORG, card, fakePipeline, type FakeState } from './helpers/fake-pipeline';
import { fakeEmbedder, fakeVectorize } from './helpers/fake-vectors';
import { ingestBatch } from '../src/ingest/consumer';
import { indexBatch } from '../src/indexing/consumer';
import { setIndexingForTests } from '../src/indexing/vector-index';
import { search } from '../src/search/search';
import { ensureWorkspace, type AgentViewer } from '../src/auth/caller';
import { __resetServiceTokensForTests } from '../src/clients/plane';
import { AGENT, withOrgPlane } from './helpers/org-plane';
import { HUB_SVC, hubHeaders, upload } from './helpers/upload';

const B = 'brd_00000000000000b1';
const C = 'card_00000000000000c1';
// The database outlives a test, so each test that syncs a card uses its own: a repeat sync of an unchanged card emits nothing.
const C2 = 'card_00000000000000c2';
let state: FakeState, restore: () => void, vec: ReturnType<typeof fakeVectorize>, ws: string;
const bag = env as unknown as Record<string, unknown>;
const queued: IndexMessage[] = [];

/** Run the index queue to empty, as Cloudflare would. The suite does not register the consumer. */
async function drainIndex() {
  while (queued.length) await indexBatch(createMessageBatch<IndexMessage>('superlibrary-index', queued.splice(0).map((body, i) => ({ id: `m${i}`, timestamp: new Date(), attempts: 1, body }))), env);
}
const ingest = (body: IngestMessage) => ingestBatch(createMessageBatch<IngestMessage>('superlibrary-ingest', [{ id: 'e', timestamp: new Date(), attempts: 1, body }]), env);
const agentViewer = (principalId: string): AgentViewer => ({ kind: 'agent', principalId, org: ORG, workspaceId: ws, act: null, via: null });

beforeEach(async () => {
  queued.length = 0;
  state = { boards: new Map([[B, { id: B, name: 'Build', cards: new Map([C, C2].map((id) => [id, { card: card(id, { title: id === C ? 'Checkout redesign' : 'Payment ledger migration', state: 'completed' }), attempts: [], comments: [], links: [], gates: [], references: [] }] as const)) }]]), pushConfigs: [], calls: [] };
  restore = fakePipeline(state);
  vec = fakeVectorize();
  setIndexingForTests({ embedders: { 'workers-ai/bge-m3': fakeEmbedder() }, bindings: { a: vec } });
  vi.spyOn(env.INDEX, 'send').mockImplementation((async (m: IndexMessage) => { queued.push(m); }) as never);
  vi.spyOn(env.INDEX, 'sendBatch').mockImplementation((async (ms: Iterable<{ body: IndexMessage }>) => { queued.push(...[...ms].map((m) => m.body)); }) as never);
  ws = await ensureWorkspace(env.DB, ORG);
  await env.DB.prepare(`DELETE FROM roster_cache`).run();
});
afterEach(() => { vi.restoreAllMocks(); restore(); setIndexingForTests(null); __resetServiceTokensForTests(); bag.HUB_SERVICE_PRINCIPAL = ''; });

/** The hub's roster answer for any agent; everything else (pipeline, plane token) falls through to the fakes. */
const roster = (boards: string[]) => {
  const real = globalThis.fetch;
  globalThis.fetch = (async (i: RequestInfo | URL, init?: RequestInit) => (String(i).includes('/api/bridge/principals/') ? Response.json({ boards }) : real(i, init))) as typeof fetch;
};

describe('sources to retrieval, through the item.changed seam', () => {
  it('a card event becomes a searchable work record for a rostered agent', async () => {
    await ingest({ type: 'card.sync', workspaceId: ws, boardId: B, cardId: C, reason: 'card.completed' });
    await drainIndex();
    roster([B]);
    expect((await search(env, agentViewer(AGENT), { query: 'checkout redesign', limit: 5 })).map((r) => r.outcome)).toEqual(['completed']);
  });
  it('deleting the card removes its record and its vectors', async () => {
    await ingest({ type: 'card.sync', workspaceId: ws, boardId: B, cardId: C2, reason: 'card.created' });
    await drainIndex();
    const itemId = (await env.DB.prepare(`SELECT item_id FROM work_records WHERE card_id = ?`).bind(C2).first<{ item_id: string }>())!.item_id;
    expect(vec.store.size).toBeGreaterThan(0);
    // card.deleted is only a hint (plan P5): the record goes when the read-back finds the card gone from its board.
    state.boards.get(B)!.cards.delete(C2);
    await ingest({ type: 'card.deleted', workspaceId: ws, boardId: B, cardId: C2 });
    await drainIndex();
    expect(vec.store.size).toBe(0);
    expect((await env.DB.prepare(`SELECT COUNT(*) AS n FROM chunks_fts WHERE item_id = ?`).bind(itemId).first<{ n: number }>())!.n).toBe(0);
    expect(await env.DB.prepare(`SELECT 1 FROM work_records WHERE card_id = ?`).bind(C2).first()).toBeNull();
  });
  it("an agent's linked file is searchable by agents on its board, not by others", async () => {
    bag.HUB_SERVICE_PRINCIPAL = HUB_SVC;
    await withOrgPlane(async () => {
      const r = await upload([{ path: 'plan.md', body: '# Rollout plan for checkout' }], { headers: await hubHeaders(AGENT), scope: `board:${B}`, source: { station: 'stn_1', path: 'out/plan.md', board: B } });
      expect(r.status).toBe(201);
    });
    await drainIndex();
    roster(['brd_00000000000000b9']);
    const other = agentViewer('prn_000000000000000000a7');
    expect(await search(env, other, { query: 'rollout plan checkout', limit: 5 })).toEqual([]);
    // The same query, once the hub rosters that agent on the board, finds it: the empty answer above is visibility, not a failed index.
    await env.DB.prepare(`DELETE FROM roster_cache`).run();
    roster([B]);
    expect((await search(env, other, { query: 'rollout plan checkout', limit: 5 })).filter((r) => r.kind === 'artifact').length).toBe(1);
  });
});
