// apps/api/test/search.test.ts
import { SELF, env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { indexItem } from '../src/indexing/consumer';
import { setIndexingForTests } from '../src/indexing/vector-index';
import { ftsQuery, search } from '../src/search/search';
import { fakeEmbedder, fakeVectorize } from './helpers/fake-vectors';
import { seedRecord } from './helpers/records';
import type { AgentViewer, Person } from '../src/auth/caller';

const WS = 'wsp_00000000000000f1';
const ORG = 'org_00000000000000000f01';
const agent: AgentViewer = { kind: 'agent', principalId: 'prn_000000000000000000a2', org: ORG, workspaceId: WS, act: null, via: null };
const person: Person = { kind: 'human', principalId: 'prn_000000000000000000a1', org: ORG, workspaceId: WS, role: 'member', act: null };
let vec: ReturnType<typeof fakeVectorize>;
const bag = env as unknown as Record<string, unknown>;
const realFetch = globalThis.fetch;

function roster(boards: string[]) {
  bag.ORG_PLANE_URL = 'https://accounts.test';
  bag.SERVICE_CREDENTIALS = JSON.stringify({ [ORG]: 'svc:x' });
  globalThis.fetch = (async (i: RequestInfo | URL) => (String(i).endsWith('/api/token/service') ? Response.json({ access_token: 't', expires_in: 300 }) : Response.json({ boards }))) as typeof fetch;
}
async function seed(id: string, text: string, o: { board?: string; outcome?: string; title?: string } = {}) {
  await seedRecord({ id, text, ws: WS, ...o });
  await indexItem(env, id);
}

beforeEach(async () => {
  vec = fakeVectorize();
  setIndexingForTests({ embedders: { 'workers-ai/bge-m3': fakeEmbedder() }, bindings: { a: vec } });
  await env.DB.prepare(`DELETE FROM roster_cache`).run();
});
afterEach(() => { setIndexingForTests(null); globalThis.fetch = realFetch; bag.ORG_PLANE_URL = ''; bag.SERVICE_CREDENTIALS = ''; });

describe('visibility before ranking (spec §4, §15)', () => {
  it("an agent never sees an unrostered board's item, even as a snippet", async () => {
    await seed('itm_00000000000000d1', 'deploy checklist for the payments service, rostered', { board: 'brd_00000000000000b1' });
    await seed('itm_00000000000000d2', 'deploy checklist for the payments service, HIDDENMARKER', { board: 'brd_00000000000000b2' });
    roster(['brd_00000000000000b1']);
    const r = await search(env, agent, { query: 'deploy checklist payments', limit: 10 });
    expect(r.map((x) => x.itemId)).toEqual(['itm_00000000000000d1']);
    expect(JSON.stringify(r)).not.toContain('HIDDENMARKER');
    // The vector query itself was filtered: the hidden board never reached the index's answer.
    expect(vec.queries.at(-1)).toMatchObject({ namespace: WS, filter: { scope: { $in: ['workspace', 'board:brd_00000000000000b1'] } } });
  });
  it('a board filter outside the viewer\'s scopes answers nothing', async () => {
    await seed('itm_00000000000000d3', 'board two notes', { board: 'brd_00000000000000b2' });
    roster(['brd_00000000000000b1']);
    expect(await search(env, agent, { query: 'notes', board: 'brd_00000000000000b2', limit: 10 })).toEqual([]);
  });
  it('another workspace never appears', async () => {
    await seedRecord({ id: 'itm_00000000000000d4', ws: 'wsp_00000000000000f9', text: 'shared words across workspaces', board: 'brd_00000000000000b1' });
    await indexItem(env, 'itm_00000000000000d4');
    roster(['brd_00000000000000b1']);
    expect((await search(env, agent, { query: 'shared words across workspaces', limit: 10 })).map((x) => x.itemId)).not.toContain('itm_00000000000000d4');
  });
});

describe('re-authorisation of vector hits', () => {
  it('a stale-scope vector hit is dropped by the SQL re-check', async () => {
    await seed('itm_00000000000000c1', 'quarterly budget forecast STALEMARKER', { board: 'brd_00000000000000b1' });
    // Re-scoped in D1 while the index still carries the old scope metadata; full-text rows removed so only the vector can find it.
    await env.DB.prepare(`UPDATE items SET scope = 'board:brd_00000000000000b2' WHERE id = 'itm_00000000000000c1'`).run();
    await env.DB.prepare(`DELETE FROM chunks_fts WHERE item_id = 'itm_00000000000000c1'`).run();
    roster(['brd_00000000000000b1']);
    const r = await search(env, agent, { query: 'quarterly budget forecast', limit: 10 });
    // The index did return it (the stale metadata admitted it); only the SQL re-check removed it.
    expect(vec.queries.at(-1)).toMatchObject({ filter: { scope: { $in: ['workspace', 'board:brd_00000000000000b1'] } } });
    expect(r.map((x) => x.itemId)).not.toContain('itm_00000000000000c1');
    expect(JSON.stringify(r)).not.toContain('STALEMARKER');
  });
});

describe('board filter', () => {
  const addBoards = () => env.DB.prepare(`INSERT OR REPLACE INTO source_boards (workspace_id, board_id, name, last_seen_at) VALUES (?, 'brd_00000000000000b1', 'B', 't'), (?, 'brd_00000000000000b2', 'B', 't')`).bind(WS, WS).run();
  async function own(id: string, text: string, board: string) {
    await seed(id, text, { board });
    await env.DB.prepare(`UPDATE items SET created_by = ? WHERE id = ?`).bind(person.principalId, id).run();
  }
  it("a person's board filter excludes their own items on other boards", async () => {
    await addBoards();
    await own('itm_00000000000000c2', 'launch plan alpha', 'brd_00000000000000b1');
    await own('itm_00000000000000c3', 'launch plan alpha', 'brd_00000000000000b2');
    const r = await search(env, person, { query: 'launch plan alpha', board: 'brd_00000000000000b1', limit: 10 });
    expect(r.map((x) => x.itemId)).toEqual(['itm_00000000000000c2']);
    expect(vec.queries.at(-1)).toMatchObject({ filter: { scope: { $in: ['board:brd_00000000000000b1'] } } });
  });
  it('a person finds their own item on a board they cannot list, and no vector query carries it', async () => {
    await own('itm_00000000000000c4', 'orphan board notes', 'brd_00000000000000b3');
    vec.queries.length = 0;
    const r = await search(env, person, { query: 'orphan board notes', board: 'brd_00000000000000b3', limit: 10 });
    expect(r.map((x) => x.itemId)).toEqual(['itm_00000000000000c4']);
    expect(vec.queries).toEqual([]);
  });
});

describe('board filter on stale vector hits', () => {
  it("the hydrate step also holds a person's own re-scoped item to the filtered board", async () => {
    await env.DB.prepare(`INSERT OR REPLACE INTO source_boards (workspace_id, board_id, name, last_seen_at) VALUES (?, 'brd_00000000000000b1', 'B', 't')`).bind(WS).run();
    await seed('itm_00000000000000c7', 'vendor contract renewal', { board: 'brd_00000000000000b1' });
    await env.DB.prepare(`UPDATE items SET created_by = ?, scope = 'board:brd_00000000000000b2' WHERE id = 'itm_00000000000000c7'`).bind(person.principalId).run();
    await env.DB.prepare(`DELETE FROM chunks_fts WHERE item_id = 'itm_00000000000000c7'`).run();
    expect(await search(env, person, { query: 'vendor contract renewal', board: 'brd_00000000000000b1', limit: 10 })).toEqual([]);
  });
});

describe('supersededBy visibility', () => {
  it('does not name a replacement the viewer cannot see', async () => {
    await seed('itm_00000000000000c5', 'handbook draft one', { board: 'brd_00000000000000b1', outcome: 'superseded' });
    await seed('itm_00000000000000c6', 'handbook draft two', { board: 'brd_00000000000000b2', outcome: 'approved' });
    await env.DB.prepare(`UPDATE work_records SET superseded_by_card = 'card_00000000000000c6' WHERE item_id = 'itm_00000000000000c5'`).run();
    roster(['brd_00000000000000b1']);
    const r = await search(env, agent, { query: 'handbook draft', limit: 10 });
    expect(r.map((x) => x.itemId)).toEqual(['itm_00000000000000c5']);
    expect(r[0]!.supersededBy).toBeNull();
  });
});

describe('ranking (spec §7)', () => {
  it('outcome weights reorder equal matches', async () => {
    await env.DB.prepare(`INSERT OR REPLACE INTO source_boards (workspace_id, board_id, name, last_seen_at) VALUES (?, 'brd_00000000000000b1', 'B', 't')`).bind(WS).run();
    await seed('itm_00000000000000e1', 'onboarding flow redesign', { outcome: 'rejected' });
    await seed('itm_00000000000000e2', 'onboarding flow redesign', { outcome: 'approved' });
    await seed('itm_00000000000000e3', 'onboarding flow redesign', { outcome: 'in-progress' });
    await seed('itm_00000000000000e4', 'onboarding flow redesign', { outcome: 'superseded' });
    const r = await search(env, person, { query: 'onboarding flow redesign', limit: 10 });
    expect(r.map((x) => x.outcome)).toEqual(['approved', 'in-progress', 'superseded', 'rejected']);
    expect(r.every((x) => x.provenance.sourceKind === 'superpipeline')).toBe(true);
  });
  it('results carry supersededBy', async () => {
    await env.DB.prepare(`INSERT OR REPLACE INTO source_boards (workspace_id, board_id, name, last_seen_at) VALUES (?, 'brd_00000000000000b1', 'B', 't')`).bind(WS).run();
    await seed('itm_00000000000000e5', 'pricing page v1', { outcome: 'superseded' });
    await seed('itm_00000000000000e6', 'pricing page v2', { outcome: 'approved' });
    await env.DB.prepare(`UPDATE work_records SET superseded_by_card = 'card_00000000000000e6' WHERE item_id = 'itm_00000000000000e5'`).run();
    const r = await search(env, person, { query: 'pricing page', limit: 10 });
    expect(r.find((x) => x.itemId === 'itm_00000000000000e5')!.supersededBy).toBe('itm_00000000000000e6');
  });
});

describe('queries people type', () => {
  it('query syntax is treated as words', async () => {
    for (const q of ['"unbalanced', 'foo*', '-x', 'NEAR(', 'a:b', 'AND', 'OR OR', '()', "it's"]) {
      await expect(search(env, person, { query: q, limit: 5 })).resolves.toBeInstanceOf(Array);
    }
    expect(ftsQuery('"hello" world*')).toBe('"hello" OR "world"');
    expect(ftsQuery('-- ()')).toBeNull();
  });
  it('diacritics fold and non-Latin words match', async () => {
    await env.DB.prepare(`INSERT OR REPLACE INTO source_boards (workspace_id, board_id, name, last_seen_at) VALUES (?, 'brd_00000000000000b1', 'B', 't')`).bind(WS).run();
    await seed('itm_00000000000000f1', 'Réunion au café du matin');
    await seed('itm_00000000000000f2', 'नमस्ते दुनिया योजना');
    expect((await search(env, person, { query: 'cafe reunion', limit: 5 }))[0]!.itemId).toBe('itm_00000000000000f1');
    expect((await search(env, person, { query: 'दुनिया', limit: 5 }))[0]!.itemId).toBe('itm_00000000000000f2');
  });
  it('still answers from full-text search when the vector index is down', async () => {
    await env.DB.prepare(`INSERT OR REPLACE INTO source_boards (workspace_id, board_id, name, last_seen_at) VALUES (?, 'brd_00000000000000b1', 'B', 't')`).bind(WS).run();
    await seed('itm_00000000000000f3', 'incident review for the outage');
    vec.query = (async () => { throw new Error('vectorize down'); }) as typeof vec.query;
    expect((await search(env, person, { query: 'incident outage', limit: 5 })).map((x) => x.itemId)).toEqual(['itm_00000000000000f3']);
  });
});

describe('POST /api/v1/search', () => {
  it('answers a person, audits the call without storing the query', async () => {
    const r = await SELF.fetch('https://api.test/api/v1/search', { method: 'POST', headers: { 'X-Dev-Principal': person.principalId, 'X-Dev-Org': ORG, 'content-type': 'application/json' }, body: JSON.stringify({ query: 'secret ghp_abc', limit: 3 }) });
    expect(r.status).toBe(200);
    const a = await env.DB.prepare(`SELECT detail FROM audit_events WHERE action = 'items.searched' ORDER BY at DESC LIMIT 1`).first<{ detail: string }>();
    expect(a!.detail).not.toContain('ghp_abc');
    expect(JSON.parse(a!.detail)).toEqual({ count: 0, queryLength: 14 });
  });
  it('answers 400 to a bad body', async () => {
    const r = await SELF.fetch('https://api.test/api/v1/search', { method: 'POST', headers: { 'X-Dev-Principal': person.principalId, 'X-Dev-Org': ORG, 'content-type': 'application/json' }, body: JSON.stringify({ query: '', extra: 1 }) });
    expect(r.status).toBe(400);
  });
});
