// apps/api/test/related.test.ts
import { SELF, env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { estimateTokens } from '@superlibrary/contract';
import { indexItem } from '../src/indexing/consumer';
import { setIndexingForTests } from '../src/indexing/vector-index';
import { getForViewer, related } from '../src/search/related';
import { fakeEmbedder, fakeVectorize } from './helpers/fake-vectors';
import { seedRecord } from './helpers/records';
import type { AgentViewer } from '../src/auth/caller';

const WS = 'wsp_00000000000000f1';
const ORG = 'org_00000000000000000f01';
const agent: AgentViewer = { kind: 'agent', principalId: 'prn_000000000000000000a2', org: ORG, workspaceId: WS, act: null, via: null };
const bag = env as unknown as Record<string, unknown>;
const realFetch = globalThis.fetch;
beforeEach(async () => {
  setIndexingForTests({ embedders: { 'workers-ai/bge-m3': fakeEmbedder() }, bindings: { a: fakeVectorize() } });
  await env.DB.prepare(`DELETE FROM roster_cache`).run();
  bag.ORG_PLANE_URL = 'https://accounts.test';
  bag.SERVICE_CREDENTIALS = JSON.stringify({ [ORG]: 'svc:x' });
  globalThis.fetch = (async (i: RequestInfo | URL) => (String(i).endsWith('/api/token/service') ? Response.json({ access_token: 't', expires_in: 300 }) : Response.json({ boards: ['brd_00000000000000b1'] }))) as typeof fetch;
});
afterEach(() => { setIndexingForTests(null); globalThis.fetch = realFetch; bag.ORG_PLANE_URL = ''; bag.SERVICE_CREDENTIALS = ''; });

const seed = async (id: string, text: string, board = 'brd_00000000000000b1') => { await seedRecord({ id, text, ws: WS, board }); await indexItem(env, id); };

describe('library_get', () => {
  it('returns the whole work record, wrapped', async () => {
    await seed('itm_00000000000000a1', 'Retro: the migration stalled on locks');
    const g = await getForViewer(env, agent, 'itm_00000000000000a1');
    expect(g!.text).toContain('migration stalled');
    expect(g!.wrapped.startsWith('<library-item id="itm_00000000000000a1" kind="work-record" outcome="completed"')).toBe(true);
  });
  it('library_get of an unrostered item is 404', async () => {
    await seed('itm_00000000000000a2', 'other board', 'brd_00000000000000b2');
    expect(await getForViewer(env, agent, 'itm_00000000000000a2')).toBeNull();
    const r = await SELF.fetch('https://api.test/api/v1/library/itm_00000000000000a2', { headers: { 'X-Dev-Principal': 'prn_000000000000000000a1', 'X-Dev-Org': ORG } });
    expect(r.status).toBe(404);
  });
});

describe('library_related', () => {
  it('related never returns an unrostered item', async () => {
    await seed('itm_00000000000000b1', 'checkout redesign spec: fewer steps', 'brd_00000000000000b1');
    await seed('itm_00000000000000b2', 'checkout redesign attempt, rejected', 'brd_00000000000000b1');
    await seed('itm_00000000000000b3', 'checkout redesign SECRETBOARD notes', 'brd_00000000000000b2');
    const r = await related(env, agent, { cardId: 'card_00000000000000b1', limit: 5, maxTokens: 1500 });
    expect(r.map((x) => x.itemId)).toEqual(['itm_00000000000000b2']);
    expect(JSON.stringify(r)).not.toContain('SECRETBOARD');
  });
  it('holds at most the item and token caps', async () => {
    await seed('itm_00000000000000c0', 'growth experiment plan '.repeat(10));
    for (let i = 1; i <= 8; i++) await seed(`itm_00000000000000c${i}`, `growth experiment plan ${'detail '.repeat(700)} ${i}`);
    const r = await related(env, agent, { cardId: 'card_00000000000000c0', limit: 5, maxTokens: 1500 });
    expect(r.length).toBeGreaterThan(1); // the second block is trimmed to the room left, not dropped
    expect(r.length).toBeLessThanOrEqual(5);
    expect(r.reduce((n, x) => n + x.tokens, 0)).toBeLessThanOrEqual(1500);
    for (const x of r) expect(x.tokens).toBe(estimateTokens(x.wrapped));
  });
  it('a card with no record yet has no related work', async () => {
    expect(await related(env, agent, { cardId: 'card_0000000000000099', limit: 5, maxTokens: 1500 })).toEqual([]);
  });
  it('POST /api/v1/related answers the same shape', async () => {
    await seed('itm_00000000000000d1', 'search index tuning');
    const r = await SELF.fetch('https://api.test/api/v1/related', { method: 'POST', headers: { 'X-Dev-Principal': 'prn_000000000000000000a1', 'X-Dev-Org': ORG, 'content-type': 'application/json' }, body: JSON.stringify({ cardId: 'card_00000000000000d1' }) });
    expect(r.status).toBe(200);
    expect(await r.json()).toHaveProperty('items');
  });
});

describe('library_get edge cases', () => {
  it('revoked and expired items are null; a version on a work record is not found', async () => {
    await seed('itm_00000000000000e1', 'revoked one');
    await seed('itm_00000000000000e2', 'expired one');
    await seed('itm_00000000000000e3', 'live one');
    await env.DB.prepare(`UPDATE items SET revoked_at = '2026-01-01T00:00:00Z' WHERE id = 'itm_00000000000000e1'`).run();
    await env.DB.prepare(`UPDATE items SET expires_at = '2026-01-01T00:00:00Z' WHERE id = 'itm_00000000000000e2'`).run();
    expect(await getForViewer(env, agent, 'itm_00000000000000e1')).toBeNull();
    expect(await getForViewer(env, agent, 'itm_00000000000000e2')).toBeNull();
    expect(await getForViewer(env, agent, 'itm_00000000000000e3', 1)).toBeNull();
    expect(await getForViewer(env, agent, 'itm_00000000000000e3')).not.toBeNull();
  });
  it('never names a replacement the viewer cannot see, and audits the read', async () => {
    await seed('itm_00000000000000e4', 'old plan', 'brd_00000000000000b1');
    await seed('itm_00000000000000e5', 'new plan hidden', 'brd_00000000000000b2');
    await env.DB.prepare(`UPDATE work_records SET superseded_by_card = 'card_00000000000000e5' WHERE item_id = 'itm_00000000000000e4'`).run();
    const g = await getForViewer(env, agent, 'itm_00000000000000e4');
    expect(g!.result.supersededBy).toBeNull();
    const n = await env.DB.prepare(`SELECT COUNT(*) AS n FROM audit_events WHERE action = 'item.read' AND item_id = 'itm_00000000000000e4'`).first<{ n: number }>();
    expect(n!.n).toBe(1);
  });
});
