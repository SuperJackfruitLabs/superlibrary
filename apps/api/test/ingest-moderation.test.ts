import { env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ORG, card, fakePipeline, type FakeState } from './helpers/fake-pipeline';
import { syncCard } from '../src/ingest/consumer';
import { ensureWorkspace } from '../src/auth/caller';
import { __resetServiceTokensForTests } from '../src/clients/plane';
import { deleteItem, sweep } from '../src/lifecycle/retention';
import { loadItem } from '../src/items/visibility';
import { AGENT, HUMAN_2, planeToken, withOrgPlane } from './helpers/org-plane';
import { upload } from './helpers/upload';
import { call, knowBoard, workspaceOf } from './helpers/library';

const B = 'brd_00000000000000b1';
const C = 'card_00000000000000c7';
let state: FakeState;
let restore: () => void;
let ws: string;
const recordId = async () => (await env.DB.prepare(`SELECT item_id FROM work_records WHERE workspace_id = ? AND card_id = ?`).bind(ws, C).first<{ item_id: string }>())?.item_id ?? null;
const touch = (over: Parameters<typeof card>[1]) => { state.boards.get(B)!.cards.get(C)!.card = card(C, { updatedAt: new Date().toISOString(), ...over }); };

beforeEach(async () => {
  state = { boards: new Map(), pushConfigs: [], calls: [] };
  state.boards.set(B, { id: B, name: 'Build', cards: new Map([[C, { card: card(C), attempts: [], comments: [], links: [], gates: [], references: [] }]]) });
  restore = fakePipeline(state);
  ws = await ensureWorkspace(env.DB, ORG);
  expect(await workspaceOf()).toBe(ws);   // the dev person is in the same workspace, and its owner
  await knowBoard(ws, B, 'Build');
  await env.DB.prepare(`DELETE FROM removed_cards WHERE workspace_id = ? AND card_id = ?`).bind(ws, C).run();   // a tombstone is permanent; each test starts without one
  await syncCard(env, { workspaceId: ws, boardId: B, cardId: C });
});
afterEach(() => { restore(); __resetServiceTokensForTests(); });

describe("a person's acts survive the card's re-sync (gap G1)", () => {
  it('a removed record stays removed when its card changes again', async () => {
    const id = (await recordId())!;
    const res = await call(`/api/v1/items/${id}/remove`, { method: 'POST', body: { reason: 'duplicate of another card' } });
    expect(res.status).toBe(200);
    expect(await recordId()).toBeNull();
    touch({ title: 'Edited after removal' });
    expect(await syncCard(env, { workspaceId: ws, boardId: B, cardId: C })).toBe('unchanged');
    expect(await recordId()).toBeNull();
  });
  it('a record widened to the workspace stays widened after its card changes', async () => {
    const id = (await recordId())!;
    expect((await call(`/api/v1/items/${id}/scope`, { method: 'POST', body: { scope: 'workspace' } })).status).toBe(200);
    touch({ title: 'Edited after widening' });
    expect(await syncCard(env, { workspaceId: ws, boardId: B, cardId: C })).toBe('updated');
    expect(await loadItem(env, id)).toMatchObject({ scope: 'workspace', title: 'Edited after widening' });
  });
  it("a person-set replacement survives a sync, and clearing restores the card's own outcome", async () => {
    const id = (await recordId())!;
    const next = (await upload([{ path: 'n.md', body: '# n' }], { title: 'Next' })).body.itemId as string;
    expect((await call(`/api/v1/items/${id}/supersede`, { method: 'POST', body: { by: next } })).status).toBe(200);
    touch({ state: 'completed' });
    await syncCard(env, { workspaceId: ws, boardId: B, cardId: C });
    expect(await loadItem(env, id)).toMatchObject({ outcome: 'superseded', superseded_by: next, superseded_prior: 'completed' });
    const cleared = await call(`/api/v1/items/${id}/supersede`, { method: 'POST', body: { by: null } });
    expect((await cleared.json<{ item: { outcome: string } }>()).item.outcome).toBe('completed');
  });
});

describe('remove from memory (spec §11, §12)', () => {
  it('remove: a reason is required and recorded; an agent cannot', async () => {
    const a = (await upload([{ path: 'gone.md', body: '# gone' }], { title: 'Gone' })).body.itemId as string;
    expect((await call(`/api/v1/items/${a}/remove`, { method: 'POST', body: {} })).status).toBe(400);
    await withOrgPlane(async () => {
      const t = await planeToken({ sub: AGENT, principalKind: 'agent' });
      expect((await call(`/api/v1/items/${a}/remove`, { method: 'POST', body: { reason: 'agent try' }, headers: { Authorization: `Bearer ${t}` } })).status).toBe(403);
    });
    const send = vi.spyOn(env.INDEX, 'send');
    expect((await call(`/api/v1/items/${a}/remove`, { method: 'POST', body: { reason: 'posted by mistake' } })).status).toBe(200);
    expect(await loadItem(env, a)).toBeNull();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ itemId: a, change: 'deleted' }));   // vectors and FTS rows go too
    const row = await env.DB.prepare(`SELECT actor, detail FROM audit_events WHERE item_id = ? AND action = 'item.deleted'`).bind(a).first<{ actor: string; detail: string }>();
    expect(row!.actor).toBe('prn_000000000000000000a1');
    expect(JSON.parse(row!.detail)).toEqual({ reason: 'posted by mistake' });
    send.mockRestore();
  });
  it('a member cannot remove a work record or another person\'s artifact (decision O1)', async () => {
    const id = (await recordId())!;
    expect((await call(`/api/v1/items/${id}/remove`, { method: 'POST', body: { reason: 'not mine' }, principal: HUMAN_2 })).status).toBe(403);
    const mine = (await upload([{ path: 'o.md', body: '# o' }], { title: 'Owner file' })).body.itemId as string;
    expect((await call(`/api/v1/items/${mine}/remove`, { method: 'POST', body: { reason: 'not mine' }, principal: HUMAN_2 })).status).toBe(403);
  });
});

/** Runs `hook` once, when the sync first asks the pipeline for the card: the sync is then past its reads. */
const duringFetch = (cardId: string, hook: () => Promise<unknown>) => {
  const inner = globalThis.fetch;
  let armed = true;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (armed && new URL(new Request(input as RequestInfo).url).pathname.endsWith(`/cards/${cardId}`)) { armed = false; await hook(); }
    return inner(input as RequestInfo, init);
  }) as typeof fetch;
};
const refsOf = (itemId: string) => env.DB.prepare(`SELECT 1 FROM item_references WHERE item_id = ?`).bind(itemId).first();

describe('a removal that lands mid-sync (decision O5, spec §12)', () => {
  it('a tombstone that appears after the sync read its state aborts the write', async () => {
    const C2 = 'card_00000000000000c8';
    state.boards.get(B)!.cards.set(C2, { card: card(C2), attempts: [], comments: [], links: [], gates: [], references: [] });
    await env.DB.prepare(`DELETE FROM removed_cards WHERE card_id = ?`).bind(C2).run();
    duringFetch(C2, () => env.DB.prepare(`INSERT INTO removed_cards (workspace_id, card_id, item_id, reason, removed_by) VALUES (?, ?, 'itm_00000000000009f9', 'raced', 'prn_000000000000000000a1')`).bind(ws, C2).run());
    await syncCard(env, { workspaceId: ws, boardId: B, cardId: C2 }).catch(() => 'retry');
    expect(await env.DB.prepare(`SELECT 1 FROM work_records WHERE card_id = ?`).bind(C2).first()).toBeNull();
    expect(await syncCard(env, { workspaceId: ws, boardId: B, cardId: C2 })).toBe('unchanged');
  });
  it('removing a record during its own sync leaves it gone and no reference keeping an artifact', async () => {
    const art = (await upload([{ path: 'k.md', body: '# k' }], { title: 'Kept' })).body.itemId as string;
    state.boards.get(B)!.cards.get(C)!.references = [{ cardId: C, url: `https://api.test/a/${art}`, title: null, provider: 'superlibrary', externalId: art }];
    touch({ title: 'Changed so the sync writes' });
    await syncCard(env, { workspaceId: ws, boardId: B, cardId: C });
    expect(await refsOf(art)).not.toBeNull();
    const id = (await recordId())!;
    touch({ title: 'Changed again' });
    duringFetch(C, async () => { expect((await call(`/api/v1/items/${id}/remove`, { method: 'POST', body: { reason: 'raced removal' } })).status).toBe(200); });
    await syncCard(env, { workspaceId: ws, boardId: B, cardId: C }).catch(() => 'retry');
    expect(await recordId()).toBeNull();
    expect(await refsOf(art)).toBeNull();
    expect(await syncCard(env, { workspaceId: ws, boardId: B, cardId: C })).toBe('unchanged');
  });
  it('a record deleted by other means mid-sync gets no references either', async () => {
    const art = (await upload([{ path: 'j.md', body: '# j' }], { title: 'Kept too' })).body.itemId as string;
    state.boards.get(B)!.cards.get(C)!.references = [{ cardId: C, url: `https://api.test/a/${art}`, title: null, provider: 'superlibrary', externalId: art }];
    const id = (await recordId())!;
    touch({ title: 'Changed' });
    duringFetch(C, () => deleteItem(env, id, 'prn_000000000000000000a1', 'gone'));
    await syncCard(env, { workspaceId: ws, boardId: B, cardId: C });
    expect(await refsOf(art)).toBeNull();
  });
  it("removing a work record frees the artifacts it referenced for the retention sweep", async () => {
    const art = (await upload([{ path: 'free.md', body: '# free' }], { title: 'Free' })).body.itemId as string;
    state.boards.get(B)!.cards.get(C)!.references = [{ cardId: C, url: `https://api.test/a/${art}`, title: null, provider: 'superlibrary', externalId: art }];
    touch({ title: 'References one' });
    await syncCard(env, { workspaceId: ws, boardId: B, cardId: C });
    expect(await refsOf(art)).not.toBeNull();
    const id = (await recordId())!;
    expect((await call(`/api/v1/items/${id}/remove`, { method: 'POST', body: { reason: 'cleanup' } })).status).toBe(200);
    expect((await sweep(env, Date.now() + 31 * 86_400_000)).unreferenced).toContain(art);
  });
});
