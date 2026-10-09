import { env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RelatedQuery } from '@superlibrary/contract';
import { indexItem } from '../src/indexing/consumer';
import { setIndexingForTests } from '../src/indexing/vector-index';
import { related } from '../src/search/related';
import { __resetServiceTokensForTests } from '../src/clients/plane';
import type { AgentViewer, Person } from '../src/auth/caller';
import { fakeEmbedder, fakeVectorize } from './helpers/fake-vectors';
import { seedRecord } from './helpers/records';
import { HUMAN, ORG } from './helpers/org-plane';
import { B1, B2, knowBoard, workspaceOf } from './helpers/library';

const bag = env as unknown as Record<string, unknown>;
const realFetch = globalThis.fetch;
let ws: string;
let me: Person;
beforeEach(async () => {
  setIndexingForTests({ embedders: { 'workers-ai/bge-m3': fakeEmbedder() }, bindings: { a: fakeVectorize() } });
  ws = await workspaceOf();
  me = { kind: 'human', principalId: HUMAN, org: ORG, workspaceId: ws, role: 'owner', act: null };
  await knowBoard(ws, B1); await knowBoard(ws, B2, 'Other');
});
afterEach(async () => { setIndexingForTests(null); globalThis.fetch = realFetch; bag.ORG_PLANE_URL = ''; bag.SERVICE_CREDENTIALS = ''; __resetServiceTokensForTests(); await env.DB.prepare(`DELETE FROM roster_cache`).run(); });
const rec = async (id: string, text: string, board = B1) => { await seedRecord({ id, ws, board, text, title: text }); await indexItem(env, id); };
const ids = async (q: unknown, v: Person | AgentViewer = me) => (await related(env, v, RelatedQuery.parse(q))).map((r) => r.itemId);
const NEW_CARD = 'card_0000000000000fff';
const lastAudit = async () => JSON.parse((await env.DB.prepare(`SELECT detail FROM audit_events WHERE action = 'items.related' ORDER BY rowid DESC LIMIT 1`).first<{ detail: string }>())!.detail);

describe('related for a card with no record yet (gap S3)', () => {
  it('is related by the title and spec the hub sends', async () => {
    await rec('itm_00000000000027a1', 'rotate the signing keys quarterly');
    expect(await ids({ cardId: NEW_CARD, text: 'Rotate signing keys\n{"goal":"rotate the keys"}' })).toContain('itm_00000000000027a1');
    expect(await lastAudit()).toMatchObject({ basis: 'text' });
    expect(await ids({ cardId: NEW_CARD })).toEqual([]);   // no record and no text: nothing, as before
    expect(await lastAudit()).toMatchObject({ basis: 'none', count: 0 });
  });
  it('the record wins over the sent text once it exists', async () => {
    await rec('itm_00000000000027b1', 'disk usage report for the hosts');      // the card's own record
    await rec('itm_00000000000027b2', 'disk usage weekly summary');
    await rec('itm_00000000000027b3', 'rotate the signing keys quarterly');
    const got = await ids({ cardId: 'card_00000000000027b1', text: 'rotate signing keys' });
    expect(got).toContain('itm_00000000000027b2');
    expect(got).not.toContain('itm_00000000000027b3');
    expect(await lastAudit()).toMatchObject({ basis: 'record' });
  });
  it('a record the caller cannot see answers nothing, whatever text is sent', async () => {
    await rec('itm_00000000000027c1', 'disk usage on a hidden board', 'brd_00000000000000b9');   // a board Superlibrary does not know
    await rec('itm_00000000000027c2', 'disk usage weekly summary');
    expect(await ids({ cardId: 'card_00000000000027c1', text: 'disk usage' })).toEqual([]);
    expect(await lastAudit()).toMatchObject({ basis: 'none', count: 0 });
  });
  it('an agent sees, through a text basis, only what its roster lets it see', async () => {
    await rec('itm_00000000000027d1', 'release checklist for payments', B1);
    await rec('itm_00000000000027d2', 'release checklist for billing', B2);
    bag.ORG_PLANE_URL = 'https://accounts.test';
    bag.SERVICE_CREDENTIALS = JSON.stringify({ [ORG]: 'svc_lib:secret' });
    globalThis.fetch = (async (i: RequestInfo | URL) => String(i).endsWith('/api/token/service') ? Response.json({ access_token: 't', expires_in: 300 }) : Response.json({ boards: [B1] })) as typeof fetch;
    const agent: AgentViewer = { kind: 'agent', principalId: 'prn_000000000000000000a2', org: ORG, workspaceId: ws, act: null, via: null };
    const got = await ids({ cardId: NEW_CARD, text: 'release checklist' }, agent);
    expect(got).toContain('itm_00000000000027d1');
    expect(got).not.toContain('itm_00000000000027d2');
  });
  it('the text is never stored or audited: the audit names the basis only', async () => {
    await rec('itm_00000000000027e1', 'rotate the signing keys quarterly');
    await ids({ cardId: NEW_CARD, text: 'Zanzibar rotate signing keys' });
    const row = await env.DB.prepare(`SELECT detail FROM audit_events WHERE action = 'items.related' ORDER BY rowid DESC LIMIT 1`).first<{ detail: string }>();
    expect(JSON.parse(row!.detail)).toMatchObject({ basis: 'text' });
    expect(row!.detail).not.toContain('Zanzibar');
  });
});
