import { SELF, env } from 'cloudflare:test';
import { afterEach, describe, expect, it } from 'vitest';
import { canSee, viewerScopes, type ItemRow } from '../src/items/visibility';
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
