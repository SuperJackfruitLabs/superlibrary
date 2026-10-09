import { createExecutionContext, createMessageBatch, env, getQueueResult } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IngestMessage } from '@superlibrary/contract';
import { ORG, card, fakePipeline, type FakeState } from './helpers/fake-pipeline';
import { ensureWorkspace } from '../src/auth/caller';
import { __resetServiceTokensForTests } from '../src/clients/plane';
import { BOARD_DELETE_PAGE, ingestBatch, removeDeletedBoard, syncCard } from '../src/ingest/consumer';
import { subscribeWorkspace } from '../src/sources/subscribe';
import { seedRecord } from './helpers/records';

const B = 'brd_000000000000d001';
const KEEP = 'brd_000000000000d002';
const OTHER = 'brd_000000000000d003';
const bag = env as unknown as Record<string, unknown>;
let state: FakeState;
let restore: () => void;
let ws: string;
const T0 = new Date('2026-10-20T10:00:00.000Z');
const later = (min: number) => new Date(T0.getTime() + min * 60_000);
const board = (id: string, cards: string[]) => ({ id, name: id, cards: new Map(cards.map((c) => [c, { card: card(c), attempts: [], comments: [], links: [], gates: [], references: [] }])) });
const records = async (b: string) => (await env.DB.prepare(`SELECT COUNT(*) AS n FROM work_records WHERE workspace_id = ? AND board_id = ?`).bind(ws, b).first<{ n: number }>())!.n;
const missing = async (b: string) => (await env.DB.prepare(`SELECT missing_since FROM source_boards WHERE workspace_id = ? AND board_id = ?`).bind(ws, b).first<{ missing_since: string | null }>())?.missing_since;
const gone = (b: string) => { state.boards.delete(b); };
/** Two runs an hour apart with B gone: confirmed (the message is captured, not consumed). */
const confirmGone = async () => {
  gone(B);
  await subscribeWorkspace(env, ws, ORG, later(60));
  await subscribeWorkspace(env, ws, ORG, later(121));
};

beforeEach(async () => {
  bag.PUSH_SIGNING_KEY = 'k'.repeat(32);
  state = { boards: new Map([[B, board(B, ['card_000000000000d0a1', 'card_000000000000d0a2'])], [KEEP, board(KEEP, ['card_000000000000d0b1'])], [OTHER, board(OTHER, [])]]), pushConfigs: [], calls: [] };
  restore = fakePipeline(state);
  ws = await ensureWorkspace(env.DB, ORG);
  await subscribeWorkspace(env, ws, ORG, T0);
  for (const [b, c] of [[B, 'card_000000000000d0a1'], [B, 'card_000000000000d0a2'], [KEEP, 'card_000000000000d0b1']] as const) await syncCard(env, { workspaceId: ws, boardId: b, cardId: c });
});
afterEach(() => { restore(); __resetServiceTokensForTests(); bag.PUSH_SIGNING_KEY = ''; vi.restoreAllMocks(); });

describe("a deleted board's records (gap S5)", () => {
  it('a board gone from the list and answering 404 on two runs an hour apart loses its records and its row, and nothing else', async () => {
    const send = vi.spyOn(env.INGEST, 'send').mockResolvedValue(undefined as never);   // RA13: no real consumer
    gone(B);
    await subscribeWorkspace(env, ws, ORG, later(60));
    expect(await missing(B)).toBe(later(60).toISOString());
    expect(send).not.toHaveBeenCalled();
    await subscribeWorkspace(env, ws, ORG, later(121));
    expect(send).toHaveBeenCalledWith({ type: 'board.deleted', workspaceId: ws, boardId: B });
    await removeDeletedBoard(env, ws, B);
    expect(await records(B)).toBe(0);
    expect(await records(KEEP)).toBe(1);
    expect(await missing(B)).toBeUndefined();   // the row is gone
    const row = await env.DB.prepare(`SELECT detail FROM audit_events WHERE action = 'board.removed' ORDER BY rowid DESC LIMIT 1`).first<{ detail: string }>();
    expect(JSON.parse(row!.detail)).toEqual({ boardId: B, records: 2 });
  });
  it('a board that answers 401, 403, 429, 5xx or fails to answer is never marked or emptied', async () => {
    const send = vi.spyOn(env.INGEST, 'send').mockResolvedValue(undefined as never);
    for (const status of [401, 403, 429, 500, 503, 0]) {
      state.boards.delete(B);
      state.boardStatus = new Map([[B, status]]);
      await subscribeWorkspace(env, ws, ORG, later(60));
      await subscribeWorkspace(env, ws, ORG, later(200));
      expect(await missing(B)).toBeNull();
      expect(await records(B)).toBe(2);
    }
    expect(send).not.toHaveBeenCalled();
  });
  it('a board missing on one run keeps its records', async () => {
    const send = vi.spyOn(env.INGEST, 'send').mockResolvedValue(undefined as never);   // RA13: no real consumer
    gone(B);
    await subscribeWorkspace(env, ws, ORG, later(60));
    await subscribeWorkspace(env, ws, ORG, later(100));   // 40 minutes later: not yet an hour
    expect(send).not.toHaveBeenCalled();
    expect(await records(B)).toBe(2);
  });
  it('a board back on the list clears its mark', async () => {
    const saved = state.boards.get(B)!;
    gone(B);
    await subscribeWorkspace(env, ws, ORG, later(60));
    state.boards.set(B, saved);
    await subscribeWorkspace(env, ws, ORG, later(121));
    expect(await missing(B)).toBeNull();
  });
  it('when two or more and at least half of the known boards vanish at once, nothing is marked', async () => {
    gone(B); gone(OTHER);
    await subscribeWorkspace(env, ws, ORG, later(60));
    expect(await missing(B)).toBeNull();
    expect(await missing(OTHER)).toBeNull();
  });
  it('an error on the board list, or an empty list, confirms nothing', async () => {
    gone(B);
    state.listStatus = 503;
    await subscribeWorkspace(env, ws, ORG, later(60)).catch(() => {});
    expect(await missing(B)).toBeNull();
    state.listStatus = undefined;
    state.boards.clear();
    await subscribeWorkspace(env, ws, ORG, later(60));
    expect(await missing(B)).toBeNull();
  });
  it("a workspace's last board gone leaves an empty list, which is no evidence: its records stay (P4-C4)", async () => {
    const send = vi.spyOn(env.INGEST, 'send').mockResolvedValue(undefined as never);
    await env.DB.prepare(`DELETE FROM source_boards WHERE workspace_id = ? AND board_id IN (?, ?)`).bind(ws, KEEP, OTHER).run();
    state.boards.clear();   // the only known board is gone, and so is every other: the list is empty
    await subscribeWorkspace(env, ws, ORG, later(60));
    await subscribeWorkspace(env, ws, ORG, later(121));
    expect(await missing(B)).toBeNull();
    expect(send).not.toHaveBeenCalled();
    expect(await records(B)).toBe(2);
  });
  it('the delete re-checks the evidence: a board readable again keeps everything', async () => {
    const saved = state.boards.get(B)!;
    vi.spyOn(env.INGEST, 'send').mockResolvedValue(undefined as never);
    await confirmGone();
    state.boards.set(B, saved);
    await removeDeletedBoard(env, ws, B);
    expect(await records(B)).toBe(2);
    expect(await missing(B)).toBeNull();
  });
  it('at delete time, a read that is not exactly 404 deletes nothing and the message retries', async () => {
    vi.spyOn(env.INGEST, 'send').mockResolvedValue(undefined as never);
    await confirmGone();
    for (const status of [403, 503, 0]) {
      state.boardStatus = new Map([[B, status]]);
      await expect(removeDeletedBoard(env, ws, B)).rejects.toThrow();
      expect(await records(B)).toBe(2);
      expect(await missing(B)).toBe(later(60).toISOString());
    }
  });
  it('at delete time, the board list is read again: listed, empty or failing deletes nothing', async () => {
    vi.spyOn(env.INGEST, 'send').mockResolvedValue(undefined as never);
    await confirmGone();
    state.listStatus = 503;
    await expect(removeDeletedBoard(env, ws, B)).rejects.toThrow();
    state.listStatus = undefined;
    const keep = state.boards.get(KEEP)!; const other = state.boards.get(OTHER)!;
    state.boards.clear();   // an empty list is no evidence
    await removeDeletedBoard(env, ws, B);
    expect(await records(B)).toBe(2);
    expect(await missing(B)).toBe(later(60).toISOString());
    state.boards.set(KEEP, keep); state.boards.set(OTHER, other);
    state.boards.set(B, { id: B, name: B, cards: new Map() });
    state.boardStatus = new Map([[B, 404]]);   // listed again, though its own read still says 404
    await removeDeletedBoard(env, ws, B);
    expect(await records(B)).toBe(2);
    expect(await missing(B)).toBeNull();
  });
  it('a board.deleted for a board never marked missing deletes nothing (a forged or stale message)', async () => {
    gone(KEEP);   // even if it really is gone now: no two sightings, no deletion
    await removeDeletedBoard(env, ws, KEEP);
    expect(await records(KEEP)).toBe(1);
    expect(await missing(KEEP)).toBeNull();
  });
  it('a large board goes in pages of BOARD_DELETE_PAGE, each page re-sending the message, and the audit counts them all', async () => {
    const send = vi.spyOn(env.INGEST, 'send').mockResolvedValue(undefined as never);
    for (let i = 0; i < BOARD_DELETE_PAGE + 3; i++) await seedRecord({ id: `itm_0000000000d1${i.toString(16).padStart(4, '0')}`, ws, board: B, text: `r${i}` });
    await confirmGone();
    send.mockClear();
    await removeDeletedBoard(env, ws, B);
    expect(await records(B)).toBe(5);
    expect(send).toHaveBeenCalledWith({ type: 'board.deleted', workspaceId: ws, boardId: B, removed: BOARD_DELETE_PAGE });
    expect(await missing(B)).toBe(later(60).toISOString());
    await removeDeletedBoard(env, ws, B, BOARD_DELETE_PAGE);
    expect(await records(B)).toBe(0);
    const row = await env.DB.prepare(`SELECT detail FROM audit_events WHERE action = 'board.removed' ORDER BY rowid DESC LIMIT 1`).first<{ detail: string }>();
    expect(JSON.parse(row!.detail)).toEqual({ boardId: B, records: BOARD_DELETE_PAGE + 5 });
  });
  it("an artifact scoped to the deleted board is kept (P4-R17)", async () => {
    vi.spyOn(env.INGEST, 'send').mockResolvedValue(undefined as never);
    await env.DB.prepare(`INSERT INTO items (id, workspace_id, kind, title, scope, created_by) VALUES ('itm_00000000000029f1', ?, 'artifact', 'kept', ?, 'prn_000000000000000000a1')`).bind(ws, `board:${B}`).run();
    await confirmGone();
    await removeDeletedBoard(env, ws, B);
    expect(await records(B)).toBe(0);
    expect(await env.DB.prepare(`SELECT 1 FROM items WHERE id = 'itm_00000000000029f1'`).first()).not.toBeNull();
  });
  it('the ingest consumer runs board.deleted and acks it', async () => {
    vi.spyOn(env.INGEST, 'send').mockResolvedValue(undefined as never);
    await confirmGone();
    const batch = createMessageBatch<IngestMessage>('superlibrary-ingest', [{ id: 'd1', timestamp: new Date(), attempts: 1, body: { type: 'board.deleted', workspaceId: ws, boardId: B } }]);
    const ctx = createExecutionContext();
    await ingestBatch(batch, env);
    expect((await getQueueResult(batch, ctx)).explicitAcks).toEqual(['d1']);
    expect(await records(B)).toBe(0);
  });
});
