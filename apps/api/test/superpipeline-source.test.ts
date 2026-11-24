// apps/api/test/superpipeline-source.test.ts
import { SELF, createExecutionContext, createScheduledController, env, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ORG, card, fakePipeline, type FakeState } from './helpers/fake-pipeline';
import { SIGNATURE_HEADER, signDelivery } from '@superjackfruitlabs/treaty-cloudevents';
import recordSchema from '@superjackfruitlabs/treaty-event-schemas/superpipeline/record.v1.json';
import { RECORD_EVENT_NAMES, SUBSCRIBE_CRON, pushSecret, subscribeAll, subscribeWorkspace } from '../src/sources/subscribe';
import { pipelineFor } from '../src/sources/superpipeline';
import wranglerRaw from '../wrangler.jsonc?raw';
import worker from '../src/index';
import { ensureWorkspace } from '../src/auth/caller';
import { __resetServiceTokensForTests } from '../src/clients/plane';

let state: FakeState;
let restore: () => void;
let WS = '';
const evUrl = (board: string, ws = WS) => `https://api.test/api/v1/sources/superpipeline/events?board=${board}&ws=${ws}`;
beforeEach(async () => {
  WS = await ensureWorkspace(env.DB, ORG);
  state = { boards: new Map(), pushConfigs: [], calls: [] };
  state.boards.set('brd_00000000000000b1', { id: 'brd_00000000000000b1', name: 'Build', cards: new Map([['card_00000000000000c1', { card: card('card_00000000000000c1'), attempts: [], comments: [], links: [], gates: [], references: [] }]]) });
  restore = fakePipeline(state);
});
afterEach(() => { restore(); __resetServiceTokensForTests(); });

/** The ingest queue's sendBatch, spied on and answering as a queue does. */
const spySend = () => vi.spyOn(env.INGEST, 'sendBatch').mockResolvedValue({ metadata: {} } as never);

/** A push on treaty's envelope: CloudEvents binary-mode headers for a card.moved, and its signature. */
const envelope = (id: string, signature: string) => ({
  'ce-specversion': '1.0', 'ce-id': id, 'ce-source': '/superpipeline/boards/brd_00000000000000b1',
  'ce-type': 'com.superjackfruit.superpipeline.card.moved.v1', 'content-type': 'application/json', [SIGNATURE_HEADER]: signature,
});

/** Treaty's delivery headers for a push: `ce-id` and `x-treaty-signature` over it, under the board's secret. */
async function signed(boardId: string, body: string, wsOverride?: string) {
  const id = `${boardId}:1`;
  const secret = await pushSecret(env, wsOverride ?? WS, boardId);
  return { 'ce-id': id, [SIGNATURE_HEADER]: await signDelivery(secret, id, new TextEncoder().encode(body)) };
}

/** SuperPipeline's old push signature, `sha256=<HMAC of the body>`, which is no longer accepted. */
async function legacySign(boardId: string, body: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(await pushSecret(env, WS, boardId)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
  return 'sha256=' + [...mac].map((x) => x.toString(16).padStart(2, '0')).join('');
}

describe('subscriptions (spec §5)', () => {
  it('registers one push config per board for the record events, with a per-board secret, idempotently', async () => {
    const ws = await ensureWorkspace(env.DB, ORG);
    await subscribeWorkspace(env, ws, ORG);
    await subscribeWorkspace(env, ws, ORG);
    expect(state.pushConfigs).toHaveLength(2);   // Superpipeline upserts on (agent, url); we may call it again
    const cfg = state.pushConfigs[0];
    expect(cfg.url).toBe(`https://api.test/api/v1/sources/superpipeline/events?board=brd_00000000000000b1&ws=${ws}`);
    expect(cfg.token).toBe(await pushSecret(env, ws, 'brd_00000000000000b1'));
    expect(cfg.events).toContain('card.completed');
    expect(cfg.events).toContain('link.added');
    const row = await env.DB.prepare(`SELECT name, push_config_id FROM source_boards WHERE workspace_id = ? AND board_id = 'brd_00000000000000b1'`).bind(ws).first();
    expect(row).toMatchObject({ name: 'Build', push_config_id: expect.stringMatching(/^push_/) });
  });
  it('two boards get two different secrets', async () => {
    const ws = WS;
    expect(await pushSecret(env, ws, 'brd_00000000000000b1')).not.toBe(await pushSecret(env, ws, 'brd_00000000000000b2'));
  });
});

describe('the push receiver', () => {
  it('turns a signed record event into one card.sync per card', async () => {
    const ws = await ensureWorkspace(env.DB, ORG);
    await subscribeWorkspace(env, ws, ORG);
    const send = spySend();
    const body = JSON.stringify({ event: 'link.added', boardId: 'brd_00000000000000b1', seq: 7, ts: '2026-10-10T00:00:00Z', cardIds: ['card_00000000000000c2', 'card_00000000000000c1'] });
    const r = await SELF.fetch(evUrl('brd_00000000000000b1'), { method: 'POST', headers: { ...await signed('brd_00000000000000b1', body), 'content-type': 'application/json' }, body });
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
    const send = spySend();
    const body = JSON.stringify({ event: 'card.deleted', boardId: 'brd_00000000000000b1', seq: 8, ts: '2026-11-23T09:30:00.000Z', cardIds: ['card_00000000000000c1'] });
    await SELF.fetch(evUrl('brd_00000000000000b1'), { method: 'POST', headers: { ...await signed('brd_00000000000000b1', body) }, body });
    expect(send).toHaveBeenCalledWith([{ body: { type: 'card.deleted', workspaceId: ws, boardId: 'brd_00000000000000b1', cardId: 'card_00000000000000c1' } }]);
    send.mockRestore();
  });
  it('refuses a bad signature, a signature for another board, and an unknown board', async () => {
    const ws = await ensureWorkspace(env.DB, ORG);
    await subscribeWorkspace(env, ws, ORG);
    const body = JSON.stringify({ event: 'card.updated', boardId: 'brd_00000000000000b1', seq: 1, ts: '2026-11-23T09:30:00.000Z', cardIds: ['card_00000000000000c1'] });
    const url = evUrl('brd_00000000000000b1');
    expect((await SELF.fetch(url, { method: 'POST', headers: { [SIGNATURE_HEADER]: `t=${Math.floor(Date.now() / 1000)},v1=${'0'.repeat(64)}`, 'ce-id': 'brd_00000000000000b1:1' }, body })).status).toBe(401);
    expect((await SELF.fetch(url, { method: 'POST', headers: { ...await signed('brd_00000000000000b2', body) }, body })).status).toBe(401);
  });
  it('refuses a push signed only with the old X-Superpipeline-Signature, however valid', async () => {
    const ws = await ensureWorkspace(env.DB, ORG);
    await subscribeWorkspace(env, ws, ORG);
    const send = spySend();
    const body = JSON.stringify({ event: 'card.updated', boardId: 'brd_00000000000000b1', seq: 1, ts: '2026-11-23T09:30:00.000Z', cardIds: ['card_00000000000000c1'] });
    const r = await SELF.fetch(evUrl('brd_00000000000000b1'), { method: 'POST', headers: { 'X-Superpipeline-Signature': await legacySign('brd_00000000000000b1', body) }, body });
    const queued = send.mock.calls.length;
    send.mockRestore();
    expect(r.status).toBe(401);
    expect(queued).toBe(0);
  });
  it('a board not mapped yet is 503, so the sender tries again; a malformed board is 404', async () => {
    const ws = await ensureWorkspace(env.DB, ORG);
    await subscribeWorkspace(env, ws, ORG);
    const body = JSON.stringify({ event: 'card.updated', boardId: 'brd_00000000000000b9', seq: 1, ts: '2026-11-23T09:30:00.000Z', cardIds: ['card_00000000000000c1'] });
    const unmapped = await SELF.fetch(evUrl('brd_00000000000000b9'), { method: 'POST', headers: { ...await signed('brd_00000000000000b9', body) }, body });
    expect(unmapped.status).toBe(503);
    expect(await unmapped.json()).toMatchObject({ error: 'board_not_mapped' });
    expect((await SELF.fetch(evUrl('brd_nope'), { method: 'POST', body })).status).toBe(404);
  });
  it("takes a delivery on treaty's envelope, signed with x-treaty-signature over its id", async () => {
    const ws = await ensureWorkspace(env.DB, ORG);
    await subscribeWorkspace(env, ws, ORG);
    const send = spySend();
    const body = JSON.stringify({ event: 'card.moved', boardId: 'brd_00000000000000b1', seq: 9, ts: '2026-11-23T09:30:00.000Z', cardIds: ['card_00000000000000c1'] });
    const bytes = new TextEncoder().encode(body);
    const secret = await pushSecret(env, ws, 'brd_00000000000000b1');
    const id = 'brd_00000000000000b1:9';
    const ok = await SELF.fetch(evUrl('brd_00000000000000b1'), { method: 'POST', headers: envelope(id, await signDelivery(secret, id, bytes)), body });
    expect(ok.status).toBe(202);
    expect(send).toHaveBeenCalledTimes(1);
    // Under another id, stale, or signed for another board: refused, and the old header does not rescue it.
    for (const signature of [
      await signDelivery(secret, 'brd_00000000000000b1:10', bytes),
      await signDelivery(secret, id, bytes, Date.now() - 301_000),
      await signDelivery(await pushSecret(env, ws, 'brd_00000000000000b2'), id, bytes),
    ]) {
      const r = await SELF.fetch(evUrl('brd_00000000000000b1'), { method: 'POST', headers: { ...envelope(id, signature), 'X-Superpipeline-Signature': await legacySign('brd_00000000000000b1', body) }, body });
      expect(r.status).toBe(401);
    }
    expect(send).toHaveBeenCalledTimes(1);
    send.mockRestore();
  });
  it('refuses a record event that is not record.v1, before queueing', async () => {
    const ws = await ensureWorkspace(env.DB, ORG);
    await subscribeWorkspace(env, ws, ORG);
    const send = spySend();
    const good = { event: 'card.updated', boardId: 'brd_00000000000000b1', seq: 1, ts: '2026-11-23T09:30:00.000Z', cardIds: ['card_00000000000000c1'] };
    const { seq: _seq, ...noSeq } = good;
    for (const bad of [noSeq, { ...good, ts: 'yesterday' }, { ...good, cardIds: ['card_00000000000000c1', 7] }]) {
      const body = JSON.stringify(bad);
      const r = await SELF.fetch(evUrl('brd_00000000000000b1'), { method: 'POST', headers: { ...await signed('brd_00000000000000b1', body) }, body });
      expect(r.status).toBe(400);
    }
    expect(send).not.toHaveBeenCalled();
    send.mockRestore();
  });
  it('refuses a body whose board differs from the URL', async () => {
    const ws = await ensureWorkspace(env.DB, ORG);
    await subscribeWorkspace(env, ws, ORG);
    const body = JSON.stringify({ event: 'card.updated', boardId: 'brd_00000000000000b2', seq: 1, ts: '2026-11-23T09:30:00.000Z', cardIds: ['card_00000000000000c1'] });
    const r = await SELF.fetch(evUrl('brd_00000000000000b1'), { method: 'POST', headers: { ...await signed('brd_00000000000000b1', body) }, body });
    expect(r.status).toBe(400);
  });
});



describe('the event list (ruling RA4)', () => {
  it("is exactly treaty's record.v1 events, read from the schema rather than copied", () => {
    expect([...RECORD_EVENT_NAMES]).toEqual(recordSchema.properties.event.enum);
    expect(RECORD_EVENT_NAMES).toContain('card.completed');
    expect(RECORD_EVENT_NAMES).toContain('link.removed');
  });
});

describe('the receiver guards', () => {
  it('ignores an event that is not a record event, without queueing', async () => {
    const ws = await ensureWorkspace(env.DB, ORG);
    await subscribeWorkspace(env, ws, ORG);
    const send = spySend();
    const body = JSON.stringify({ event: 'work.available', boardId: 'brd_00000000000000b1', seq: 1, ts: '2026-11-23T09:30:00.000Z', cardIds: ['card_00000000000000c1'] });
    const r = await SELF.fetch(evUrl('brd_00000000000000b1'), { method: 'POST', headers: { ...await signed('brd_00000000000000b1', body) }, body });
    expect(r.status).toBe(202);
    expect(send).not.toHaveBeenCalled();
    send.mockRestore();
  });
  it('drops card ids that are not card ids', async () => {
    const ws = await ensureWorkspace(env.DB, ORG);
    await subscribeWorkspace(env, ws, ORG);
    const send = spySend();
    const body = JSON.stringify({ event: 'card.updated', boardId: 'brd_00000000000000b1', seq: 1, ts: '2026-11-23T09:30:00.000Z', cardIds: ['../x', 'card_00000000000000c1'] });
    await SELF.fetch(evUrl('brd_00000000000000b1'), { method: 'POST', headers: { ...await signed('brd_00000000000000b1', body) }, body });
    expect(send).toHaveBeenCalledWith([{ body: { type: 'card.sync', workspaceId: ws, boardId: 'brd_00000000000000b1', cardId: 'card_00000000000000c1', reason: 'card.updated' } }]);
    send.mockRestore();
  });
  it('queues under the workspace that owns the board, not another one', async () => {
    const other = await ensureWorkspace(env.DB, 'org_00000000000000000a02');
    const ws = await ensureWorkspace(env.DB, ORG);
    await subscribeWorkspace(env, ws, ORG);
    const send = spySend();
    const body = JSON.stringify({ event: 'card.updated', boardId: 'brd_00000000000000b1', seq: 1, ts: '2026-11-23T09:30:00.000Z', cardIds: ['card_00000000000000c1'] });
    await SELF.fetch(evUrl('brd_00000000000000b1'), { method: 'POST', headers: { ...await signed('brd_00000000000000b1', body) }, body });
    const sent = send.mock.calls[0][0] as Array<{ body: { workspaceId: string } }>;
    expect(sent[0].body.workspaceId).toBe(ws);
    expect(sent[0].body.workspaceId).not.toBe(other);
    send.mockRestore();
  });
});

describe('the client', () => {
  it('reads a card bundle with its links, and answers null for a card that is gone', async () => {
    const b = state.boards.get('brd_00000000000000b1')!;
    b.cards.get('card_00000000000000c1')!.links = [{ fromCardId: 'card_00000000000000c1', toCardId: 'card_00000000000000c2', kind: 'supersedes' }];
    const sp = pipelineFor(env, ORG);
    const bundle = await sp.cardBundle('brd_00000000000000b1', 'card_00000000000000c1');
    expect(bundle?.links).toMatchObject([{ fromCardId: 'card_00000000000000c1', toCardId: 'card_00000000000000c2', kind: 'supersedes' }]);
    expect(await sp.cardBundle('brd_00000000000000b1', 'card_000000000000ffff')).toBeNull();
    expect(await sp.cardBundle('brd_00000000000000b9', 'card_00000000000000c1')).toBeNull();
  });
  it('lists boards and snapshots one', async () => {
    const sp = pipelineFor(env, ORG);
    expect(await sp.boards()).toMatchObject([{ id: 'brd_00000000000000b1', name: 'Build' }]);
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
    await worker.scheduled(createScheduledController({ scheduledTime: Date.UTC(2026, 9, 10, 5), cron: '0 * * * *' }), { ...env, RETENTION: { send } as never }, ctx);
    await waitOnExecutionContext(ctx);
    expect(send).not.toHaveBeenCalled();
    expect(state.pushConfigs.length).toBeGreaterThan(0);
  });
});

describe('fail closed and bounds', () => {
  const B1 = 'brd_00000000000000b1';
  const withKey = async (key: string | undefined, fn: () => Promise<void>) => {
    const bag = env as unknown as Record<string, unknown>;
    const was = bag.PUSH_SIGNING_KEY;
    if (key === undefined) delete bag.PUSH_SIGNING_KEY; else bag.PUSH_SIGNING_KEY = key;
    try { await fn(); } finally { bag.PUSH_SIGNING_KEY = was; }
  };
  it('with no signing key the receiver answers 503 and queues nothing', async () => {
    await subscribeWorkspace(env, WS, ORG);
    const body = JSON.stringify({ event: 'card.updated', boardId: B1, seq: 1, ts: '2026-11-23T09:30:00.000Z', cardIds: ['card_00000000000000c1'] });
    const sig = await signed(B1, body);
    const send = spySend();
    for (const key of [undefined, '', 'short']) {
      await withKey(key, async () => {
        expect((await SELF.fetch(evUrl(B1), { method: 'POST', headers: sig, body })).status).toBe(503);
      });
    }
    expect(send).not.toHaveBeenCalled();
    send.mockRestore();
  });
  it('with no signing key, subscribing registers nothing and pushSecret throws', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await withKey(undefined, async () => {
      expect(await subscribeWorkspace(env, WS, ORG)).toEqual({ boards: 0, registered: 0, failed: 0 });
      await expect(pushSecret(env, WS, B1)).rejects.toThrow();
    });
    await withKey('x'.repeat(31), async () => { await expect(pushSecret(env, WS, B1)).rejects.toThrow(); });
    err.mockRestore();
    expect(state.pushConfigs).toHaveLength(0);
  });
  it('the same board id in two workspaces: a push signed for one cannot enqueue for the other', async () => {
    const other = await ensureWorkspace(env.DB, 'org_00000000000000000a02');
    await subscribeWorkspace(env, WS, ORG);
    await env.DB.prepare(`INSERT OR IGNORE INTO source_boards (workspace_id, board_id, name, last_seen_at) VALUES (?, ?, 'Other', 't')`).bind(other, B1).run();
    const send = spySend();
    const body = JSON.stringify({ event: 'card.updated', boardId: B1, seq: 1, ts: '2026-11-23T09:30:00.000Z', cardIds: ['card_00000000000000c1'] });
    const forOther = await SELF.fetch(evUrl(B1, other), { method: 'POST', headers: { ...await signed(B1, body, WS) }, body });
    expect(forOther.status).toBe(401);
    expect(send).not.toHaveBeenCalled();
    const ok = await SELF.fetch(evUrl(B1, WS), { method: 'POST', headers: { ...await signed(B1, body, WS) }, body });
    expect(ok.status).toBe(202);
    expect((send.mock.calls[0][0] as Array<{ body: { workspaceId: string } }>)[0].body.workspaceId).toBe(WS);
    expect((await SELF.fetch(`https://api.test/api/v1/sources/superpipeline/events?board=${B1}`, { method: 'POST', body })).status).toBe(404);
    send.mockRestore();
  });
  it('a body over 64 KB is refused before the signature is computed', async () => {
    await subscribeWorkspace(env, WS, ORG);
    const body = JSON.stringify({ event: 'card.updated', boardId: B1, seq: 1, ts: '2026-11-23T09:30:00.000Z', cardIds: [], pad: 'x'.repeat(70 * 1024) });
    const r = await SELF.fetch(evUrl(B1), { method: 'POST', headers: { ...await signed(B1, body) }, body });
    expect(r.status).toBe(413);
  });
  it('a streamed body over 64 KB (no declared length) is refused too', async () => {
    await subscribeWorkspace(env, WS, ORG);
    const big = new TextEncoder().encode('x'.repeat(70 * 1024));
    const stream = new ReadableStream({ start(c) { c.enqueue(big); c.close(); } });
    const r = await SELF.fetch(evUrl(B1), { method: 'POST', headers: { [SIGNATURE_HEADER]: `t=${Math.floor(Date.now() / 1000)},v1=${'0'.repeat(64)}`, 'ce-id': 'brd_00000000000000b1:1' }, body: stream, duplex: 'half' } as RequestInit);
    expect(r.status).toBe(413);
  });
  it('one failing board does not stop the rest, and failures are counted', async () => {
    state.boards.set('brd_00000000000000b2', { id: 'brd_00000000000000b2', name: 'Second', cards: new Map() });
    const real = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = new Request(input, init);
      if (req.method === 'POST' && req.url.includes('/brd_00000000000000b1/push-configs')) return new Response(null, { status: 500 });
      return real(input, init);
    });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(await subscribeWorkspace(env, WS, ORG)).toEqual({ boards: 2, registered: 1, failed: 1 });
    } finally { globalThis.fetch = real; err.mockRestore(); }
    expect(state.pushConfigs.map((c) => c.boardId)).toEqual(['brd_00000000000000b2']);
  });
});

describe('wrangler', () => {
  it('declares the hourly subscription cron', async () => {
    const raw = wranglerRaw;
    const jsonc = raw.replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (_, x: string | undefined) => x ?? '').replace(/,(\s*[}\]])/g, '$1');
    expect((JSON.parse(jsonc) as { triggers: { crons: string[] } }).triggers.crons).toContain(SUBSCRIBE_CRON);
  });
});
