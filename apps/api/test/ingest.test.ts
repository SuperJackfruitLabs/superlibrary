// apps/api/test/ingest.test.ts
import { createExecutionContext, createMessageBatch, env, getQueueResult } from 'cloudflare:test';
import wranglerRaw from '../wrangler.jsonc?raw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IngestMessage } from '@superlibrary/contract';
import { ORG, card, fakePipeline, type FakeState } from './helpers/fake-pipeline';
import { ingestBatch, syncCard } from '../src/ingest/consumer';
import { ensureWorkspace } from '../src/auth/caller';
import { __resetServiceTokensForTests } from '../src/clients/plane';
import { upload } from './helpers/upload';
import { devHeaders } from './helpers/org-plane';

const B = 'brd_00000000000000b1';
const C1 = 'card_00000000000000c1';
const C2 = 'card_00000000000000c2';
let state: FakeState;
let restore: () => void;
let ws: string;
const bundleOf = (id: string) => state.boards.get(B)!.cards.get(id)!;
const recordOf = (cardId: string) => env.DB.prepare(`SELECT w.*, i.outcome, i.title, i.scope, i.kind FROM work_records w JOIN items i ON i.id = w.item_id WHERE w.workspace_id = ? AND w.card_id = ?`).bind(ws, cardId).first<any>();

beforeEach(async () => {
  state = { boards: new Map(), pushConfigs: [], calls: [] };
  state.boards.set(B, { id: B, name: 'Build', cards: new Map([
    [C1, { card: card(C1), attempts: [], comments: [], links: [], gates: [], references: [] }],
    [C2, { card: card(C2), attempts: [], comments: [], links: [], gates: [], references: [] }],
  ]) });
  restore = fakePipeline(state);
  ws = await ensureWorkspace(env.DB, ORG);
});
afterEach(() => { restore(); __resetServiceTokensForTests(); });

describe('syncCard', () => {
  it('creates a board-scoped work record and emits item.changed', async () => {
    const send = vi.spyOn(env.INDEX, 'send');
    expect(await syncCard(env, { workspaceId: ws, boardId: B, cardId: C1 })).toBe('created');
    const r = await recordOf(C1);
    expect(r).toMatchObject({ kind: 'work-record', scope: `board:${B}`, outcome: 'in-progress', title: `Card ${C1}`, board_id: B });
    expect(JSON.parse(r.body)).toMatchObject({ schema: 'work-record/1', boardId: B, cardId: C1 });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ itemId: r.item_id, change: 'upserted' }));
    send.mockRestore();
  });
  it('late and duplicate deliveries leave the record equal to a fresh read', async () => {
    await syncCard(env, { workspaceId: ws, boardId: B, cardId: C1 });
    bundleOf(C1).card = card(C1, { state: 'completed', updatedAt: '2026-10-04T00:00:00.000Z' });
    await syncCard(env, { workspaceId: ws, boardId: B, cardId: C1 });   // card.completed
    const send = vi.spyOn(env.INDEX, 'send');
    expect(await syncCard(env, { workspaceId: ws, boardId: B, cardId: C1 })).toBe('unchanged');   // a late card.updated
    expect(await syncCard(env, { workspaceId: ws, boardId: B, cardId: C1 })).toBe('unchanged');   // a duplicate
    expect(send).not.toHaveBeenCalled();
    expect((await recordOf(C1)).outcome).toBe('completed');
    const n = await env.DB.prepare(`SELECT COUNT(*) AS n FROM work_records WHERE card_id = ?`).bind(C1).first<{ n: number }>();
    expect(n!.n).toBe(1);
    send.mockRestore();
  });
  it('card.deleted deletes the record', async () => {
    await syncCard(env, { workspaceId: ws, boardId: B, cardId: C1 });
    const itemId = (await recordOf(C1)).item_id;
    state.boards.get(B)!.cards.delete(C1);   // the read-back confirms it is gone
    const batch = createMessageBatch<IngestMessage>('superlibrary-ingest', [{ id: 'm1', timestamp: new Date(), attempts: 1, body: { type: 'card.deleted', workspaceId: ws, boardId: B, cardId: C1 } }]);
    const ctx = createExecutionContext();
    await ingestBatch(batch, env);
    expect((await getQueueResult(batch, ctx)).explicitAcks).toEqual(['m1']);
    expect(await recordOf(C1)).toBeNull();
    expect(await env.DB.prepare(`SELECT 1 FROM items WHERE id = ?`).bind(itemId).first()).toBeNull();
  });
  it('a forged card.deleted for a card that still exists deletes nothing and syncs it', async () => {
    await syncCard(env, { workspaceId: ws, boardId: B, cardId: C1 });
    const itemId = (await recordOf(C1)).item_id;
    bundleOf(C1).card = card(C1, { title: 'Renamed', updatedAt: '2026-10-05T00:00:00.000Z' });
    const batch = createMessageBatch<IngestMessage>('superlibrary-ingest', [{ id: 'f1', timestamp: new Date(), attempts: 1, body: { type: 'card.deleted', workspaceId: ws, boardId: B, cardId: C1 } }]);
    const ctx = createExecutionContext();
    await ingestBatch(batch, env);
    expect((await getQueueResult(batch, ctx)).explicitAcks).toEqual(['f1']);
    const r = await recordOf(C1);
    expect(r.item_id).toBe(itemId);
    expect(r.title).toBe('Renamed');
  });
  it('a forged card.deleted naming the wrong board cannot delete a card that exists', async () => {
    await syncCard(env, { workspaceId: ws, boardId: B, cardId: C1 });
    await syncCard(env, { workspaceId: ws, boardId: B, cardId: C2 });
    await ingestBatch(createMessageBatch<IngestMessage>('superlibrary-ingest', [{ id: 'g1', timestamp: new Date(), attempts: 1, body: { type: 'card.deleted', workspaceId: ws, boardId: 'brd_00000000000000ff', cardId: C1 } }]), env);
    expect(await recordOf(C1)).not.toBeNull();
  });
  it('emits item.changed deleted when the record goes', async () => {
    await syncCard(env, { workspaceId: ws, boardId: B, cardId: C1 });
    const itemId = (await recordOf(C1)).item_id;
    state.boards.get(B)!.cards.delete(C1);
    const send = vi.spyOn(env.INDEX, 'send');
    await syncCard(env, { workspaceId: ws, boardId: B, cardId: C1 });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ itemId, change: 'deleted' }));
    send.mockRestore();
  });
  it('a card that is gone when synced is deleted too', async () => {
    await syncCard(env, { workspaceId: ws, boardId: B, cardId: C1 });
    state.boards.get(B)!.cards.delete(C1);
    expect(await syncCard(env, { workspaceId: ws, boardId: B, cardId: C1 })).toBe('deleted');
  });
  it('a supersedes link marks the older record and names the newer', async () => {
    bundleOf(C1).card = card(C1, { state: 'completed' });
    bundleOf(C1).links = [{ fromCardId: C2, toCardId: C1, kind: 'supersedes' }];
    await syncCard(env, { workspaceId: ws, boardId: B, cardId: C1 });
    const r = await recordOf(C1);
    expect(r.outcome).toBe('superseded');
    expect(r.superseded_by_card).toBe(C2);
  });
  it('links the artifacts the card references, so retention keeps them (spec §12)', async () => {
    const art = await upload([{ path: 'mock.png', body: 'not really a png' }], { headers: devHeaders(undefined, ORG), scope: 'workspace' });
    bundleOf(C1).references = [{ cardId: C1, url: `https://api.test/a/${art.body.itemId}`, title: 'Mockup', provider: 'superlibrary', externalId: art.body.itemId }];
    await syncCard(env, { workspaceId: ws, boardId: B, cardId: C1 });
    const ref = await env.DB.prepare(`SELECT from_kind, from_id FROM item_references WHERE item_id = ?`).bind(art.body.itemId).first();
    expect(ref).toEqual({ from_kind: 'work-record', from_id: (await recordOf(C1)).item_id });
  });
  it('an artifact of another workspace is never linked', async () => {
    const other = await upload([{ path: 'x.md', body: 'x' }], { headers: devHeaders(undefined, 'org_00000000000000000b02'), scope: 'workspace' });
    bundleOf(C1).references = [{ cardId: C1, url: `https://api.test/a/${other.body.itemId}`, title: null, provider: 'superlibrary', externalId: other.body.itemId }];
    await syncCard(env, { workspaceId: ws, boardId: B, cardId: C1 });
    expect(await env.DB.prepare(`SELECT 1 FROM item_references WHERE item_id = ?`).bind(other.body.itemId).first()).toBeNull();
  });
  it('a record with a redacted secret is flagged', async () => {
    bundleOf(C1).comments = [{ id: 'cmt_1', author: { kind: 'agent', id: 'agt', name: null }, body: 'AKIAABCDEFGHIJKLMNOP', createdAt: 't', deletedAt: null }];
    await syncCard(env, { workspaceId: ws, boardId: B, cardId: C1 });
    const r = await recordOf(C1);
    expect(r.redacted).toBe(1);
    expect(r.body).not.toContain('AKIAABCDEFGHIJKLMNOP');
    expect(r.text).not.toContain('AKIAABCDEFGHIJKLMNOP');
  });
});

describe('ingestBatch', () => {
  it('reads each board snapshot once per batch', async () => {
    const batch = createMessageBatch<IngestMessage>('superlibrary-ingest', [
      { id: 'a', timestamp: new Date(), attempts: 1, body: { type: 'card.sync', workspaceId: ws, boardId: B, cardId: C1, reason: 'card.updated' } },
      { id: 'b', timestamp: new Date(), attempts: 1, body: { type: 'card.sync', workspaceId: ws, boardId: B, cardId: C2, reason: 'card.updated' } },
    ]);
    await ingestBatch(batch, env);
    expect(state.calls.filter((c) => c === `GET /v1/boards/${B}`)).toHaveLength(1);
  });
  it('retries a message when Superpipeline is down, and acks the rest', async () => {
    const real = globalThis.fetch;
    globalThis.fetch = (async (i: RequestInfo | URL, init?: RequestInit) => (String(i).includes(C2) ? new Response(null, { status: 503 }) : real(i, init))) as typeof fetch;
    const batch = createMessageBatch<IngestMessage>('superlibrary-ingest', [
      { id: 'a', timestamp: new Date(), attempts: 1, body: { type: 'card.sync', workspaceId: ws, boardId: B, cardId: C1, reason: 'card.updated' } },
      { id: 'b', timestamp: new Date(), attempts: 1, body: { type: 'card.sync', workspaceId: ws, boardId: B, cardId: C2, reason: 'card.updated' } },
    ]);
    const ctx = createExecutionContext();
    await ingestBatch(batch, env);
    const res = await getQueueResult(batch, ctx);
    expect(res.explicitAcks).toEqual(['a']);
    expect(res.retryMessages.map((m: { msgId: string }) => m.msgId)).toEqual(['b']);
    globalThis.fetch = real;
  });
  it('two messages for one card in a batch read it once', async () => {
    const batch = createMessageBatch<IngestMessage>('superlibrary-ingest', [
      { id: 'a', timestamp: new Date(), attempts: 1, body: { type: 'card.sync', workspaceId: ws, boardId: B, cardId: C1, reason: 'card.updated' } },
      { id: 'b', timestamp: new Date(), attempts: 1, body: { type: 'card.sync', workspaceId: ws, boardId: B, cardId: C1, reason: 'card.comment.added' } },
    ]);
    await ingestBatch(batch, env);
    expect(state.calls.filter((c) => c === `GET /v1/boards/${B}/cards/${C1}`)).toHaveLength(1);
  });
});

describe('deletion is confirmed against the board', () => {
  const sync = (cardId: string) => ({ id: 'z' + cardId, timestamp: new Date(), attempts: 1, body: { type: 'card.deleted' as const, workspaceId: ws, boardId: B, cardId } });
  it('a card 404 while the board is forbidden or missing deletes nothing and retries', async () => {
    await syncCard(env, { workspaceId: ws, boardId: B, cardId: C1 });
    const real = globalThis.fetch;
    globalThis.fetch = (async (i: RequestInfo | URL, init?: RequestInit) => {
      const u = new URL(String(i instanceof Request ? i.url : i));
      if (u.origin === 'https://pipeline.test' && u.pathname.includes(C1)) return new Response(null, { status: 404 });
      if (u.origin === 'https://pipeline.test' && u.pathname === `/v1/boards/${B}`) return new Response(null, { status: 403 });
      return real(i, init);
    }) as typeof fetch;
    try {
      const batch = createMessageBatch<IngestMessage>('superlibrary-ingest', [sync(C1)]);
      const ctx = createExecutionContext();
      await ingestBatch(batch, env);
      const res = await getQueueResult(batch, ctx);
      expect(res.retryMessages.map((m: { msgId: string }) => m.msgId)).toEqual(['z' + C1]);
      expect(await recordOf(C1)).not.toBeNull();
    } finally { globalThis.fetch = real; }
  });
  it('a card 404 while the board answers 404 deletes nothing', async () => {
    await syncCard(env, { workspaceId: ws, boardId: B, cardId: C1 });
    state.boards.delete(B);
    await expect(syncCard(env, { workspaceId: ws, boardId: B, cardId: C1 })).rejects.toThrow();
    expect(await recordOf(C1)).not.toBeNull();
  });
  it('a card 404 with the board listing it is not a delete', async () => {
    await syncCard(env, { workspaceId: ws, boardId: B, cardId: C1 });
    const real = globalThis.fetch;
    globalThis.fetch = (async (i: RequestInfo | URL, init?: RequestInit) => {
      const u = new URL(String(i instanceof Request ? i.url : i));
      return u.origin === 'https://pipeline.test' && u.pathname === `/v1/boards/${B}/cards/${C1}` ? new Response(null, { status: 404 }) : real(i, init);
    }) as typeof fetch;
    try { await expect(syncCard(env, { workspaceId: ws, boardId: B, cardId: C1 })).rejects.toThrow(); } finally { globalThis.fetch = real; }
    expect(await recordOf(C1)).not.toBeNull();
  });
});

describe('ingest operations', () => {
  it('a message for an unknown workspace is acked and dropped, not retried', async () => {
    const batch = createMessageBatch<IngestMessage>('superlibrary-ingest', [{ id: 'u', timestamp: new Date(), attempts: 1, body: { type: 'card.sync', workspaceId: 'wsp_nope', boardId: B, cardId: C1, reason: 'x' } }]);
    const ctx = createExecutionContext();
    await ingestBatch(batch, env);
    const res = await getQueueResult(batch, ctx);
    expect(res.explicitAcks).toEqual(['u']);
    expect(res.retryMessages).toEqual([]);
  });
  it('the ingest consumer runs one invocation at a time (an older read must not overwrite a newer one)', () => {
    const w = JSON.parse(wranglerRaw.replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (_: string, s?: string) => s ?? '').replace(/,(\s*[}\]])/g, '$1'));
    expect(w.queues.consumers.find((c: { queue: string }) => c.queue === 'superlibrary-ingest').max_concurrency).toBe(1);
  });
  it('a record is built with its board id inside the size cap', async () => {
    bundleOf(C1).card = card(C1, { title: 'T'.repeat(950_000) });
    await syncCard(env, { workspaceId: ws, boardId: B, cardId: C1 });
    expect(new TextEncoder().encode((await recordOf(C1)).body).length).toBeLessThanOrEqual(900_000);
  });
});
