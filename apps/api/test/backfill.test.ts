// apps/api/test/backfill.test.ts
import { SELF, createExecutionContext, createMessageBatch, env, getQueueResult } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ORG, card, fakePipeline, type FakeState } from './helpers/fake-pipeline';
import { BACKFILL_PAGE, backfillBoard, ingestBatch, syncCard } from '../src/ingest/consumer';
import { ensureWorkspace } from '../src/auth/caller';
import { __resetServiceTokensForTests } from '../src/clients/plane';
import { AGENT, HUMAN, devHeaders } from './helpers/org-plane';

const B = 'brd_00000000000000b1';
let state: FakeState;
let restore: () => void;
const bag = env as unknown as Record<string, unknown>;

beforeEach(() => {
  state = { boards: new Map(), pushConfigs: [], calls: [] };
  const cards = new Map();
  const shapes: Array<[string, Partial<ReturnType<typeof card>>, any]> = [
    ['card_00000000000000e1', { state: 'completed' }, { gates: [{ id: 'gate_1', cardId: 'card_00000000000000e1', stageKey: 'review', status: 'resolved', decision: 'approve', resolvedAt: 't' }] }],
    ['card_00000000000000e2', { state: 'rejected' }, {}],
    ['card_00000000000000e3', { state: 'working', archivedAt: '2026-09-01T00:00:00Z' }, {}],
    ['card_00000000000000e4', { state: 'input-required', needsHuman: { reason: 'repeated-failure' } }, {}],
    ['card_00000000000000e5', { state: 'completed' }, { links: [{ fromCardId: 'card_00000000000000e1', toCardId: 'card_00000000000000e5', kind: 'supersedes' }] }],
  ];
  for (const [id, over, extra] of shapes) cards.set(id, { card: card(id, over), attempts: [], comments: [], links: [], gates: [], references: [], ...extra });
  state.boards.set(B, { id: B, name: 'Build', cards });
  restore = fakePipeline(state);
});
afterEach(() => { restore(); __resetServiceTokensForTests(); bag.OPERATORS = ''; });

const snapshotRecords = async (ws: string) =>
  (await env.DB.prepare(`SELECT w.card_id, w.digest, w.body, w.text, i.outcome, i.scope, i.title FROM work_records w JOIN items i ON i.id = w.item_id WHERE w.workspace_id = ? ORDER BY w.card_id`).bind(ws).all()).results;

describe('backfill', () => {
  it('backfill produces exactly the records live events produced', async () => {
    const ws = await ensureWorkspace(env.DB, ORG);
    for (const id of state.boards.get(B)!.cards.keys()) await syncCard(env, { workspaceId: ws, boardId: B, cardId: id });
    const live = await snapshotRecords(ws);
    await env.DB.prepare(`DELETE FROM item_sources WHERE item_id IN (SELECT item_id FROM work_records WHERE workspace_id = ?)`).bind(ws).run();
    const ids = (await env.DB.prepare(`SELECT item_id FROM work_records WHERE workspace_id = ?`).bind(ws).all<{ item_id: string }>()).results.map((r) => r.item_id);
    await env.DB.prepare(`DELETE FROM work_records WHERE workspace_id = ?`).bind(ws).run();
    for (const id of ids) await env.DB.prepare(`DELETE FROM items WHERE id = ?`).bind(id).run();

    const sent: any[] = [];
    const spy = vi.spyOn(env.INGEST, 'sendBatch').mockImplementation((async (msgs: any) => { sent.push(...msgs.map((m: any) => m.body)); }) as any);
    await backfillBoard(env, ws, B);
    spy.mockRestore();
    expect(sent.map((m) => m.cardId).sort()).toEqual([...state.boards.get(B)!.cards.keys()].sort());
    for (const m of sent) await syncCard(env, m);
    expect(await snapshotRecords(ws)).toEqual(live);
    expect(live.map((r: any) => r.outcome)).toEqual(['approved', 'rejected', 'abandoned', 'failed', 'superseded']);
  });
  const run = async (bodies: any[]) => {
    const batch = createMessageBatch<any>('superlibrary-ingest', bodies.map((body, i) => ({ id: `m${i}`, timestamp: new Date(), attempts: 1, body })));
    await ingestBatch(batch, env);
    return getQueueResult(batch, createExecutionContext());
  };
  const recordFor = (ws: string, cardId: string) => env.DB.prepare(`SELECT item_id FROM work_records WHERE workspace_id = ? AND card_id = ?`).bind(ws, cardId).first<{ item_id: string }>();
  const capture = () => {
    const sent: any[] = [];
    const spy = vi.spyOn(env.INGEST, 'sendBatch').mockImplementation((async (msgs: any) => { sent.push(...msgs.map((m: any) => m.body)); }) as any);
    return { sent, done: () => spy.mockRestore() };
  };
  it('a record whose card left the board is deleted by the backfill', async () => {
    const ws = await ensureWorkspace(env.DB, ORG);
    await syncCard(env, { workspaceId: ws, boardId: B, cardId: 'card_00000000000000e2' });
    const itemId = (await recordFor(ws, 'card_00000000000000e2'))!.item_id;
    state.boards.get(B)!.cards.delete('card_00000000000000e2');
    const { sent, done } = capture();
    await backfillBoard(env, ws, B);
    done();
    const del = { type: 'card.deleted', workspaceId: ws, boardId: B, cardId: 'card_00000000000000e2' };
    expect(sent).toContainEqual(del);
    expect((await run([del])).explicitAcks).toEqual(['m0']);
    expect(await recordFor(ws, 'card_00000000000000e2')).toBeNull();
    expect(await env.DB.prepare(`SELECT 1 FROM items WHERE id = ?`).bind(itemId).first()).toBeNull();
  });
  it('a board snapshot that fails enqueues no deletion; the backfill retries and the record survives', async () => {
    const ws = await ensureWorkspace(env.DB, ORG);
    await syncCard(env, { workspaceId: ws, boardId: B, cardId: 'card_00000000000000e2' });
    const fake = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const u = new URL(new Request(input as RequestInfo, init).url);
      if (u.origin === 'https://pipeline.test' && u.pathname === `/v1/boards/${B}`) return new Response('boom', { status: 500 });
      return fake(input as RequestInfo, init);
    }) as typeof fetch;
    const { sent, done } = capture();
    try {
      await expect(backfillBoard(env, ws, B)).rejects.toThrow();
      expect(sent).toEqual([]);
      const r = await run([{ type: 'board.backfill', workspaceId: ws, boardId: B }]);
      expect(r.explicitAcks).toEqual([]);
      expect(r.retryMessages.map((m: any) => m.msgId)).toEqual(['m0']);
    } finally { globalThis.fetch = fake; done(); }
    expect(await recordFor(ws, 'card_00000000000000e2')).not.toBeNull();
  });
  it('only an operator may start it', async () => {
    const sendBatch = vi.spyOn(env.INGEST, 'sendBatch').mockImplementation((async () => {}) as any);
    bag.PUSH_SIGNING_KEY = 'k'.repeat(32);
    try {
      const url = 'https://api.test/api/v1/sources/superpipeline/backfill';
      const r = await SELF.fetch(url, { method: 'POST', headers: devHeaders(HUMAN, ORG) });
      expect(r.status).toBe(403);
      expect(sendBatch).not.toHaveBeenCalled();
      bag.OPERATORS = HUMAN;
      expect((await SELF.fetch(url, { method: 'POST', headers: devHeaders(AGENT, ORG) })).status).toBe(403);
      expect(sendBatch).not.toHaveBeenCalled();
      const ok = await SELF.fetch(url, { method: 'POST', headers: devHeaders(HUMAN, ORG) });
      expect(ok.status).toBe(202);
      expect(await ok.json()).toEqual({ boards: 1, registered: 1, failed: 0 });
      expect(sendBatch.mock.calls[0]![0]).toEqual([{ body: { type: 'board.backfill', workspaceId: expect.any(String), boardId: B } }]);
    } finally { sendBatch.mockRestore(); delete bag.PUSH_SIGNING_KEY; }
  });
  it('a Superpipeline outage answers 502, not an unhandled 500', async () => {
    const sendBatch = vi.spyOn(env.INGEST, 'sendBatch').mockImplementation((async () => {}) as any);
    bag.PUSH_SIGNING_KEY = 'k'.repeat(32);
    bag.OPERATORS = HUMAN;
    const fake = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const u = new URL(new Request(input as RequestInfo, init).url);
      if (u.origin === 'https://pipeline.test' && u.pathname === '/v1/boards') return new Response('boom', { status: 500 });
      return fake(input as RequestInfo, init);
    }) as typeof fetch;
    try {
      const r = await SELF.fetch('https://api.test/api/v1/sources/superpipeline/backfill', { method: 'POST', headers: devHeaders(HUMAN, ORG) });
      expect(r.status).toBe(502);
      expect(sendBatch).not.toHaveBeenCalled();
    } finally { globalThis.fetch = fake; sendBatch.mockRestore(); delete bag.PUSH_SIGNING_KEY; }
  });
  it('a big board is enqueued in bounded pages that together cover every card once', async () => {
    const ws = await ensureWorkspace(env.DB, ORG);
    const cards = state.boards.get(B)!.cards;
    for (let i = 0; i < BACKFILL_PAGE + 30; i++) { const id = `card_${String(1000 + i).padStart(16, '0')}`; cards.set(id, { card: card(id), attempts: [], comments: [], links: [], gates: [], references: [] }); }
    const sent: any[] = [];
    const spy = vi.spyOn(env.INGEST, 'sendBatch').mockImplementation((async (msgs: any) => { expect(msgs.length).toBeLessThanOrEqual(100); sent.push(...msgs.map((m: any) => m.body)); }) as any);
    // A recorded card that left the board and sorts after the cursor must still be reached on page 2.
    const goneId = 'card_9999999999999999';
    await env.DB.prepare(`INSERT INTO items (id, workspace_id, kind, title, scope, outcome, created_by, latest_version) VALUES ('itm_gone', ?, 'work-record', 't', ?, 'in-progress', 'x', 0)`).bind(ws, `board:${B}`).run();
    await env.DB.prepare(`INSERT INTO work_records (item_id, workspace_id, board_id, card_id, digest, body, text, redacted, source_updated_at) VALUES ('itm_gone', ?, ?, ?, 'd', '{}', '', 0, 't')`).bind(ws, B, goneId).run();
    await backfillBoard(env, ws, B);
    const first = sent.splice(0);
    const next = first.find((m) => m.type === 'board.backfill');
    expect(first.filter((m) => m.type === 'card.sync').length).toBe(BACKFILL_PAGE);
    expect(next).toBeDefined();
    await backfillBoard(env, ws, B, next.after);
    spy.mockRestore();
    expect(sent.some((m) => m.type === 'board.backfill')).toBe(false);
    const ids = [...first, ...sent].filter((m) => m.type === 'card.sync').map((m) => m.cardId).sort();
    expect(ids).toEqual([...cards.keys()].sort());
    expect([...first, ...sent]).toContainEqual({ type: 'card.deleted', workspaceId: ws, boardId: B, cardId: goneId });
  });
});
