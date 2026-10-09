import { SELF, env } from 'cloudflare:test';
import { afterEach, describe, expect, it } from 'vitest';
import { canSee, viewerScopes, visibleBinds, visibleSql, type ItemRow } from '../src/items/visibility';
import { invalidateRoster, rosterBoards } from '../src/clients/roster';
import { __resetServiceTokensForTests } from '../src/clients/plane';
import type { AgentViewer, Person } from '../src/auth/caller';
import { planeToken, withOrgPlane } from './helpers/org-plane';

const WS = 'wsp_00000000000000f1';
const ORG = 'org_00000000000000000f01';
const HUB_SVC = 'prn_0000000000000000c0b1';
const person: Person = { kind: 'human', principalId: 'prn_000000000000000000a1', org: ORG, workspaceId: WS, role: 'member', act: null };
const agent: AgentViewer = { kind: 'agent', principalId: 'prn_000000000000000000a2', org: ORG, workspaceId: WS, act: null, via: null };
const bag = env as unknown as Record<string, unknown>;
const realFetch = globalThis.fetch;
afterEach(async () => { globalThis.fetch = realFetch; __resetServiceTokensForTests(); bag.SERVICE_CREDENTIALS = ''; bag.ORG_PLANE_URL = ''; bag.HUB_SERVICE_PRINCIPAL = ''; await env.DB.prepare(`DELETE FROM roster_cache`).run(); });

function hub(boards: string[] | 'down', seen: string[] = []) {
  bag.ORG_PLANE_URL = 'https://accounts.test';
  bag.SERVICE_CREDENTIALS = JSON.stringify({ [ORG]: 'svc_lib:secret' });
  globalThis.fetch = (async (i: RequestInfo | URL) => {
    const u = String(i);
    seen.push(u);
    if (u.endsWith('/api/token/service')) return Response.json({ access_token: 't', expires_in: 300 });
    if (boards === 'down') return new Response(null, { status: 503 });
    return Response.json({ boards });
  }) as typeof fetch;
  return seen;
}
const item = (scope: string, created_by = 'prn_000000000000000000a9'): ItemRow => ({ id: 'itm_00000000000000c1', workspace_id: WS, kind: 'artifact', title: 't', scope, outcome: 'completed', created_by, latest_version: 1, expires_at: null, revoked_at: null, created_at: 'x' });

describe('people (plan P4)', () => {
  it('see workspace items and items on every board Superlibrary knows for the workspace', async () => {
    await env.DB.prepare(`INSERT OR IGNORE INTO workspaces (id, external_source, external_id) VALUES (?, 'org-plane', ?)`).bind(WS, ORG).run();
    await env.DB.prepare(`INSERT OR REPLACE INTO source_boards (workspace_id, board_id, name, last_seen_at) VALUES (?, 'brd_00000000000000b1', 'B', 't')`).bind(WS).run();
    const scopes = await viewerScopes(env, person);
    expect(canSee(person, item('workspace'), scopes)).toBe(true);
    expect(canSee(person, item('board:brd_00000000000000b1'), scopes)).toBe(true);
    expect(canSee(person, item('board:brd_00000000000000b2'), scopes)).toBe(false);
    expect(canSee(person, item('board:brd_00000000000000b2', person.principalId), scopes)).toBe(true);   // their own upload
    expect(canSee(person, { ...item('workspace'), workspace_id: 'wsp_other' }, scopes)).toBe(false);
  });
});

describe('agents (spec §4)', () => {
  it('see workspace items and items on boards they are rostered on, nothing else', async () => {
    hub(['brd_00000000000000b1']);
    const scopes = await viewerScopes(env, agent);
    expect(scopes.sort()).toEqual(['board:brd_00000000000000b1', 'workspace']);
    expect(canSee(agent, item('board:brd_00000000000000b2', agent.principalId), scopes)).toBe(false);   // even its own, once unrostered
  });
  it('a workspace item is visible to every person and every agent', async () => {
    hub([]);
    expect(canSee(agent, item('workspace'), await viewerScopes(env, agent))).toBe(true);
    expect(canSee(person, item('workspace'), await viewerScopes(env, person))).toBe(true);
  });
  it('caches the roster for five minutes and drops it on invalidation', async () => {
    const seen = hub(['brd_00000000000000b1']);
    await rosterBoards(env, agent);
    await rosterBoards(env, agent);
    expect(seen.filter((u) => u.includes('/api/bridge/principals/')).length).toBe(1);
    await invalidateRoster(env, agent.principalId);
    await rosterBoards(env, agent);
    expect(seen.filter((u) => u.includes('/api/bridge/principals/')).length).toBe(2);
    expect(seen.find((u) => u.includes('/api/bridge/principals/'))).toBe(`https://hub.test/api/bridge/principals/${agent.principalId}/boards`);
  });
  it('fails closed: hub down and no cache means workspace items only', async () => {
    hub('down');
    expect(await viewerScopes(env, agent)).toEqual(['workspace']);
  });
  it('the invalidation route takes only a trusted service', async () => {
    const r = await SELF.fetch('https://api.test/api/v1/roster/invalidate', { method: 'POST', headers: { 'X-Dev-Principal': person.principalId, 'X-Dev-Org': ORG, 'content-type': 'application/json' }, body: JSON.stringify({ principal: agent.principalId }) });
    expect(r.status).toBe(403);
  });
  it('the hub gets 204 and the cached roster row is gone', async () => {
    bag.HUB_SERVICE_PRINCIPAL = HUB_SVC;
    await env.DB.prepare(`INSERT INTO roster_cache (principal_id, workspace_id, boards, fetched_at) VALUES (?, ?, '[]', ?)`).bind(agent.principalId, WS, Date.now()).run();
    await withOrgPlane(async () => {
      const t = await planeToken({ sub: HUB_SVC, principalKind: 'service' });
      const r = await SELF.fetch('https://api.test/api/v1/roster/invalidate', { method: 'POST', headers: { Authorization: `Bearer ${t}`, 'content-type': 'application/json' }, body: JSON.stringify({ principal: agent.principalId }) });
      expect(r.status).toBe(204);
    });
    const row = await env.DB.prepare(`SELECT 1 AS x FROM roster_cache WHERE principal_id = ?`).bind(agent.principalId).first();
    expect(row).toBeNull();
  });
});

const seedCache = (age: number, boards: string[], ws = WS) =>
  env.DB.prepare(`INSERT OR REPLACE INTO roster_cache (principal_id, workspace_id, boards, fetched_at) VALUES (?, ?, ?, ?)`).bind(agent.principalId, ws, JSON.stringify(boards), Date.now() - age).run();
const hubCalls = (seen: string[]) => seen.filter((u) => u.includes('/api/bridge/principals/')).length;

describe('roster cache ages and keys', () => {
  it('older than the TTL but under an hour: refetched when the hub answers, used when it is down', async () => {
    await seedCache(600_000, ['brd_00000000000000b1']);
    const seen = hub(['brd_00000000000000b2']);
    expect(await rosterBoards(env, agent)).toEqual(['brd_00000000000000b2']);
    expect(hubCalls(seen)).toBe(1);
    await seedCache(600_000, ['brd_00000000000000b1']);
    hub('down');
    expect(await rosterBoards(env, agent)).toEqual(['brd_00000000000000b1']);
  });
  it('older than an hour with the hub down: workspace items only', async () => {
    await seedCache(3_700_000, ['brd_00000000000000b1']);
    hub('down');
    expect(await viewerScopes(env, agent)).toEqual(['workspace']);
  });
  it('a row cached for another workspace is never served', async () => {
    await seedCache(1000, ['brd_00000000000000b1'], 'wsp_other');
    const seen = hub(['brd_00000000000000b2']);
    expect(await rosterBoards(env, agent)).toEqual(['brd_00000000000000b2']);
    expect(hubCalls(seen)).toBe(1);
  });
});

describe('a person\'s own item on an unknown board (B-R12)', () => {
  const OTHER = 'prn_000000000000000000a9';
  it('is visible to its creator, not another person’s item there', async () => {
    const scopes = await viewerScopes(env, person);
    expect(scopes).not.toContain('board:brd_00000000000000b2');
    expect(canSee(person, item('board:brd_00000000000000b2', person.principalId), scopes)).toBe(true);
    expect(canSee(person, item('board:brd_00000000000000b2', OTHER), scopes)).toBe(false);
  });
  it('and the list route agrees', async () => {
    await env.DB.prepare(`INSERT OR IGNORE INTO workspaces (id, external_source, external_id) VALUES (?, 'org-plane', ?)`).bind(WS, ORG).run();
    const ins = (id: string, by: string) => env.DB.prepare(`INSERT INTO items (id, workspace_id, kind, title, scope, outcome, created_by, latest_version) VALUES (?, ?, 'artifact', 't', 'board:brd_00000000000000b2', 'completed', ?, 1)`).bind(id, WS, by).run();
    await ins('itm_00000000000000d1', person.principalId);
    await ins('itm_00000000000000d2', OTHER);
    try {
      const r = await SELF.fetch('https://api.test/api/v1/items', { headers: { 'X-Dev-Principal': person.principalId, 'X-Dev-Org': ORG } });
      const ids = ((await r.json()) as { items: { id: string }[] }).items.map((i) => i.id);
      expect(ids).toContain('itm_00000000000000d1');
      expect(ids).not.toContain('itm_00000000000000d2');
    } finally {
      await env.DB.prepare(`DELETE FROM items WHERE id IN ('itm_00000000000000d1','itm_00000000000000d2')`).run();
    }
  });
});

describe('visibleSql and canSee agree', () => {
  it('for a person and an agent over the same seeded items', async () => {
    await env.DB.prepare(`INSERT OR IGNORE INTO workspaces (id, external_source, external_id) VALUES (?, 'org-plane', ?)`).bind(WS, ORG).run();
    await env.DB.prepare(`INSERT OR IGNORE INTO workspaces (id, external_source, external_id) VALUES ('wsp_other', 'org-plane', 'org_other')`).run();
    await env.DB.prepare(`INSERT OR REPLACE INTO source_boards (workspace_id, board_id, name, last_seen_at) VALUES (?, 'brd_00000000000000b1', 'B', 't')`).bind(WS).run();
    const OTHER = 'prn_000000000000000000a9';
    const rows: Array<[string, string, string, string]> = [
      ['itm_00000000000000e1', WS, 'workspace', OTHER],
      ['itm_00000000000000e2', WS, 'board:brd_00000000000000b1', OTHER],
      ['itm_00000000000000e3', WS, 'board:brd_00000000000000b2', person.principalId],
      ['itm_00000000000000e4', WS, 'board:brd_00000000000000b2', OTHER],
      ['itm_00000000000000e5', 'wsp_other', 'workspace', OTHER],
      ['itm_00000000000000e6', WS, 'board:brd_00000000000000b1', agent.principalId],
      ['itm_00000000000000e7', WS, 'board:brd_00000000000000b3', agent.principalId],
    ];
    for (const [id, ws, scope, by] of rows) await env.DB.prepare(`INSERT INTO items (id, workspace_id, kind, title, scope, outcome, created_by, latest_version) VALUES (?, ?, 'artifact', 't', ?, 'completed', ?, 1)`).bind(id, ws, scope, by).run();
    try {
      hub(['brd_00000000000000b1']);
      for (const v of [person, agent]) {
        const scopes = await viewerScopes(env, v);
        const viaSql = (await env.DB.prepare(`SELECT id FROM items i WHERE ${visibleSql('i')} AND i.id LIKE 'itm_00000000000000e%' ORDER BY id`).bind(...visibleBinds(v, scopes)).all<{ id: string }>()).results.map((r) => r.id);
        const viaCode = (await env.DB.prepare(`SELECT * FROM items WHERE id LIKE 'itm_00000000000000e%' ORDER BY id`).all<ItemRow>()).results.filter((i) => canSee(v, i, scopes)).map((i) => i.id);
        expect(viaSql).toEqual(viaCode);
        expect(viaSql.length).toBeGreaterThan(0);
      }
      // The agent's own items on an unrostered board (e7) are hidden: no own-item rule for agents.
      const a = await viewerScopes(env, agent);
      expect(canSee(agent, { ...item('board:brd_00000000000000b3', agent.principalId) }, a)).toBe(false);
    } finally {
      await env.DB.prepare(`DELETE FROM items WHERE id LIKE 'itm_00000000000000e%'`).run();
    }
  });
});
