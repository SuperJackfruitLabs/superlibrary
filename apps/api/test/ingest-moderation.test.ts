import { env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ORG, card, fakePipeline, type FakeState } from './helpers/fake-pipeline';
import { syncCard } from '../src/ingest/consumer';
import { ensureWorkspace } from '../src/auth/caller';
import { __resetServiceTokensForTests } from '../src/clients/plane';
import { loadItem } from '../src/items/visibility';
import { AGENT, HUMAN_2, devHeaders, planeToken, withOrgPlane } from './helpers/org-plane';
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
    expect((await call(`/api/v1/items/${mine}/remove`, { method: 'POST', body: { reason: 'not mine' }, headers: devHeaders(HUMAN_2) })).status).toBe(403);
  });
});
