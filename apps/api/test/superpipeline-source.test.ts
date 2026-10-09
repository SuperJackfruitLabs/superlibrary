// apps/api/test/superpipeline-source.test.ts
import { SELF, createExecutionContext, createScheduledController, env, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ORG, card, fakePipeline, type FakeState } from './helpers/fake-pipeline';
import { RECORD_EVENT_NAMES, pushSecret, subscribeAll, subscribeWorkspace } from '../src/sources/subscribe';
import { pipelineFor } from '../src/sources/superpipeline';
import worker from '../src/index';
import { ensureWorkspace } from '../src/auth/caller';
import { __resetServiceTokensForTests } from '../src/clients/plane';

let state: FakeState;
let restore: () => void;
beforeEach(() => {
  state = { boards: new Map(), pushConfigs: [], calls: [] };
  state.boards.set('brd_00000000000000b1', { id: 'brd_00000000000000b1', name: 'Build', cards: new Map([['card_00000000000000c1', { card: card('card_00000000000000c1'), attempts: [], comments: [], links: [], gates: [], references: [] }]]) });
  restore = fakePipeline(state);
});
afterEach(() => { restore(); __resetServiceTokensForTests(); });

async function sign(boardId: string, body: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(await pushSecret(env, boardId)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
  return 'sha256=' + [...mac].map((x) => x.toString(16).padStart(2, '0')).join('');
}

describe('subscriptions (spec §5)', () => {
  it('registers one push config per board for the record events, with a per-board secret, idempotently', async () => {
    const ws = await ensureWorkspace(env.DB, ORG);
    await subscribeWorkspace(env, ws, ORG);
    await subscribeWorkspace(env, ws, ORG);
    expect(state.pushConfigs).toHaveLength(2);   // Superpipeline upserts on (agent, url); we may call it again
    const cfg = state.pushConfigs[0]!;
    expect(cfg.url).toBe('https://api.test/api/v1/sources/superpipeline/events?board=brd_00000000000000b1');
    expect(cfg.token).toBe(await pushSecret(env, 'brd_00000000000000b1'));
    expect(cfg.events).toContain('card.completed');
    expect(cfg.events).toContain('link.added');
    const row = await env.DB.prepare(`SELECT name, push_config_id FROM source_boards WHERE workspace_id = ? AND board_id = 'brd_00000000000000b1'`).bind(ws).first();
    expect(row).toMatchObject({ name: 'Build', push_config_id: expect.stringMatching(/^push_/) });
  });
  it('two boards get two different secrets', async () => {
    expect(await pushSecret(env, 'brd_00000000000000b1')).not.toBe(await pushSecret(env, 'brd_00000000000000b2'));
  });
});

describe('the push receiver', () => {
  it('turns a signed record event into one card.sync per card', async () => {
    const ws = await ensureWorkspace(env.DB, ORG);
    await subscribeWorkspace(env, ws, ORG);
    const send = vi.spyOn(env.INGEST, 'sendBatch').mockResolvedValue({ metadata: {} } as never);
    const body = JSON.stringify({ event: 'link.added', boardId: 'brd_00000000000000b1', seq: 7, ts: '2026-10-10T00:00:00Z', cardIds: ['card_00000000000000c2', 'card_00000000000000c1'] });
    const r = await SELF.fetch('https://api.test/api/v1/sources/superpipeline/events?board=brd_00000000000000b1', { method: 'POST', headers: { 'X-Superpipeline-Signature': await sign('brd_00000000000000b1', body), 'X-Superpipeline-Event': 'link.added', 'content-type': 'application/json' }, body });
    expect(r.status).toBe(202);
    expect(send).toHaveBeenCalledWith([
      { body: { type: 'card.sync', workspaceId: ws, boardId: 'brd_00000000000000b1', cardId: 'card_00000000000000c2', reason: 'link.added' } },
      { body: { type: 'card.sync', workspaceId: ws, boardId: 'brd_00000000000000b1', cardId: 'card_00000000000000c1', reason: 'link.added' } },
    ]);
    send.mockRestore();
  });
  it('card.deleted becomes a deletion', async () => {
    const ws = await ensureWorkspace(env.DB, ORG);
    await subscribeWorkspace(env, ws, ORG);
    const send = vi.spyOn(env.INGEST, 'sendBatch').mockResolvedValue({ metadata: {} } as never);
    const body = JSON.stringify({ event: 'card.deleted', boardId: 'brd_00000000000000b1', seq: 8, ts: 't', cardIds: ['card_00000000000000c1'] });
    await SELF.fetch('https://api.test/api/v1/sources/superpipeline/events?board=brd_00000000000000b1', { method: 'POST', headers: { 'X-Superpipeline-Signature': await sign('brd_00000000000000b1', body) }, body });
    expect(send).toHaveBeenCalledWith([{ body: { type: 'card.deleted', workspaceId: ws, boardId: 'brd_00000000000000b1', cardId: 'card_00000000000000c1' } }]);
    send.mockRestore();
  });
  it('refuses a bad signature, a signature for another board, and an unknown board', async () => {
    const ws = await ensureWorkspace(env.DB, ORG);
    await subscribeWorkspace(env, ws, ORG);
    const body = JSON.stringify({ event: 'card.updated', boardId: 'brd_00000000000000b1', seq: 1, ts: 't', cardIds: ['card_00000000000000c1'] });
    const url = 'https://api.test/api/v1/sources/superpipeline/events?board=brd_00000000000000b1';
    expect((await SELF.fetch(url, { method: 'POST', headers: { 'X-Superpipeline-Signature': 'sha256=00' }, body })).status).toBe(401);
    expect((await SELF.fetch(url, { method: 'POST', headers: { 'X-Superpipeline-Signature': await sign('brd_00000000000000b2', body) }, body })).status).toBe(401);
    expect((await SELF.fetch('https://api.test/api/v1/sources/superpipeline/events?board=brd_00000000000000b9', { method: 'POST', headers: { 'X-Superpipeline-Signature': await sign('brd_00000000000000b9', body) }, body })).status).toBe(404);
  });
  it('refuses a body whose board differs from the URL', async () => {
    const ws = await ensureWorkspace(env.DB, ORG);
    await subscribeWorkspace(env, ws, ORG);
    const body = JSON.stringify({ event: 'card.updated', boardId: 'brd_00000000000000b2', seq: 1, ts: 't', cardIds: ['card_00000000000000c1'] });
    const r = await SELF.fetch('https://api.test/api/v1/sources/superpipeline/events?board=brd_00000000000000b1', { method: 'POST', headers: { 'X-Superpipeline-Signature': await sign('brd_00000000000000b1', body) }, body });
    expect(r.status).toBe(400);
  });
});

const URL_B1 = 'https://api.test/api/v1/sources/superpipeline/events?board=brd_00000000000000b1';

describe('the event list (ruling RA4)', () => {
  it('is exactly Superpipeline\'s record events as built', () => {
    expect([...RECORD_EVENT_NAMES]).toEqual([
      'card.created', 'card.updated', 'card.moved', 'card.advanced', 'card.completed', 'card.rejected', 'card.failed',
      'card.blocked', 'card.deleted', 'card.resumed', 'card.comment.added', 'card.comment.deleted', 'gate.resolved',
      'link.added', 'link.removed',
    ]);
  });
});

describe('the receiver guards', () => {
  it('ignores an event that is not a record event, without queueing', async () => {
    const ws = await ensureWorkspace(env.DB, ORG);
    await subscribeWorkspace(env, ws, ORG);
    const send = vi.spyOn(env.INGEST, 'sendBatch').mockResolvedValue({ metadata: {} } as never);
    const body = JSON.stringify({ event: 'work.available', boardId: 'brd_00000000000000b1', seq: 1, ts: 't', cardIds: ['card_00000000000000c1'] });
    const r = await SELF.fetch(URL_B1, { method: 'POST', headers: { 'X-Superpipeline-Signature': await sign('brd_00000000000000b1', body) }, body });
    expect(r.status).toBe(202);
    expect(send).not.toHaveBeenCalled();
    send.mockRestore();
  });
  it('drops card ids that are not card ids', async () => {
    const ws = await ensureWorkspace(env.DB, ORG);
    await subscribeWorkspace(env, ws, ORG);
    const send = vi.spyOn(env.INGEST, 'sendBatch').mockResolvedValue({ metadata: {} } as never);
    const body = JSON.stringify({ event: 'card.updated', boardId: 'brd_00000000000000b1', seq: 1, ts: 't', cardIds: ['../x', 7, 'card_00000000000000c1'] });
    await SELF.fetch(URL_B1, { method: 'POST', headers: { 'X-Superpipeline-Signature': await sign('brd_00000000000000b1', body) }, body });
    expect(send).toHaveBeenCalledWith([{ body: { type: 'card.sync', workspaceId: ws, boardId: 'brd_00000000000000b1', cardId: 'card_00000000000000c1', reason: 'card.updated' } }]);
    send.mockRestore();
  });
  it('queues under the workspace that owns the board, not another one', async () => {
    const other = await ensureWorkspace(env.DB, 'org_00000000000000000a02');
    const ws = await ensureWorkspace(env.DB, ORG);
    await subscribeWorkspace(env, ws, ORG);
    const send = vi.spyOn(env.INGEST, 'sendBatch').mockResolvedValue({ metadata: {} } as never);
    const body = JSON.stringify({ event: 'card.updated', boardId: 'brd_00000000000000b1', seq: 1, ts: 't', cardIds: ['card_00000000000000c1'] });
    await SELF.fetch(URL_B1, { method: 'POST', headers: { 'X-Superpipeline-Signature': await sign('brd_00000000000000b1', body) }, body });
    const sent = send.mock.calls[0]![0] as Array<{ body: { workspaceId: string } }>;
    expect(sent[0]!.body.workspaceId).toBe(ws);
    expect(sent[0]!.body.workspaceId).not.toBe(other);
    send.mockRestore();
  });
});

describe('the client', () => {
  it('reads a card bundle with its links, and answers null for a card that is gone', async () => {
    const b = state.boards.get('brd_00000000000000b1')!;
    b.cards.get('card_00000000000000c1')!.links = [{ fromCardId: 'card_00000000000000c1', toCardId: 'card_00000000000000c2', kind: 'supersedes' }];
    const sp = pipelineFor(env, ORG);
    const bundle = await sp.cardBundle('brd_00000000000000b1', 'card_00000000000000c1');
    expect(bundle?.links).toEqual([{ fromCardId: 'card_00000000000000c1', toCardId: 'card_00000000000000c2', kind: 'supersedes' }]);
    expect(await sp.cardBundle('brd_00000000000000b1', 'card_000000000000ffff')).toBeNull();
    expect(await sp.cardBundle('brd_00000000000000b9', 'card_00000000000000c1')).toBeNull();
  });
  it('lists boards and snapshots one', async () => {
    const sp = pipelineFor(env, ORG);
    expect(await sp.boards()).toEqual([{ id: 'brd_00000000000000b1', name: 'Build' }]);
    expect((await sp.snapshot('brd_00000000000000b1')).cards.map((c) => c.id)).toEqual(['card_00000000000000c1']);
  });
});

describe('subscribeAll and the crons', () => {
  it('subscribes every org with a credential and survives one that fails', async () => {
    (env as unknown as Record<string, unknown>).SERVICE_CREDENTIALS = JSON.stringify({ 'org_00000000000000000a02': 'svc_x:secret', [ORG]: 'svc_lib:secret' });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await subscribeAll(env);
    err.mockRestore();
    const ws = await ensureWorkspace(env.DB, ORG);
    const row = await env.DB.prepare(`SELECT push_config_id FROM source_boards WHERE workspace_id = ?`).bind(ws).first<{ push_config_id: string }>();
    expect(row?.push_config_id).toMatch(/^push_/);
  });
  it('the hourly cron runs the subscription, not the retention sweep', async () => {
    const send = vi.fn();
    const ctx = createExecutionContext();
    await worker.scheduled!(createScheduledController({ scheduledTime: Date.UTC(2026, 9, 10, 5), cron: '0 * * * *' }), { ...env, RETENTION: { send } as never }, ctx);
    await waitOnExecutionContext(ctx);
    expect(send).not.toHaveBeenCalled();
    expect(state.pushConfigs.length).toBeGreaterThan(0);
  });
});
