// apps/api/test/backfill.test.ts
import { SELF, env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ORG, card, fakePipeline, type FakeState } from './helpers/fake-pipeline';
import { BACKFILL_PAGE, backfillBoard, syncCard } from '../src/ingest/consumer';
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
  it('a record whose card left the board is deleted by the backfill', async () => {
    const ws = await ensureWorkspace(env.DB, ORG);
    await syncCard(env, { workspaceId: ws, boardId: B, cardId: 'card_00000000000000e2' });
    state.boards.get(B)!.cards.delete('card_00000000000000e2');
    const sent: any[] = [];
    const spy = vi.spyOn(env.INGEST, 'sendBatch').mockImplementation((async (msgs: any) => { sent.push(...msgs.map((m: any) => m.body)); }) as any);
    await backfillBoard(env, ws, B);
    spy.mockRestore();
    expect(sent).toContainEqual({ type: 'card.deleted', workspaceId: ws, boardId: B, cardId: 'card_00000000000000e2' });
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
      expect(await ok.json()).toEqual({ boards: 1 });
      expect(sendBatch.mock.calls[0]![0]).toEqual([{ body: { type: 'board.backfill', workspaceId: expect.any(String), boardId: B } }]);
    } finally { sendBatch.mockRestore(); delete bag.PUSH_SIGNING_KEY; }
  });
  it('a big board is enqueued in bounded pages that together cover every card once', async () => {
    const ws = await ensureWorkspace(env.DB, ORG);
    const cards = state.boards.get(B)!.cards;
    for (let i = 0; i < BACKFILL_PAGE + 30; i++) { const id = `card_${String(1000 + i).padStart(16, '0')}`; cards.set(id, { card: card(id), attempts: [], comments: [], links: [], gates: [], references: [] }); }
    const sent: any[] = [];
    const spy = vi.spyOn(env.INGEST, 'sendBatch').mockImplementation((async (msgs: any) => { expect(msgs.length).toBeLessThanOrEqual(100); sent.push(...msgs.map((m: any) => m.body)); }) as any);
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
  });
});
