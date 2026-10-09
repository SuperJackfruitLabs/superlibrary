import { SELF, env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RELEVANCE, RelatedQuery, SearchQuery } from '@superlibrary/contract';
import { indexItem } from '../src/indexing/consumer';
import { setIndexingForTests } from '../src/indexing/vector-index';
import { ftsQuery, fuse, search, type ExplainRow } from '../src/search/search';
import { related } from '../src/search/related';
import type { Person } from '../src/auth/caller';
import { fakeEmbedder, fakeVectorize } from './helpers/fake-vectors';
import { API, upload } from './helpers/upload';
import { call, workspaceOf } from './helpers/library';
import { AGENT, HUMAN, ORG, planeToken, withOrgPlane } from './helpers/org-plane';

let me: Person;
beforeEach(async () => {
  setIndexingForTests({ embedders: { 'workers-ai/bge-m3': fakeEmbedder() }, bindings: { a: fakeVectorize() } });
  me = { kind: 'human', principalId: HUMAN, org: ORG, workspaceId: await workspaceOf(), role: 'owner', act: null };
});
afterEach(() => setIndexingForTests(null));
const art = async (title: string, body: string) => {
  const id = (await upload([{ path: `${title}.md`, body }], { title })).body.itemId as string;
  await indexItem(env, id);
  return id;
};
const found = async (query: string) => (await search(env, me, SearchQuery.parse({ query, limit: 25 }))).map((r) => r.itemId);
const big = (words: string, n: number) => Array.from({ length: n }, () => words).join('\n\n');

describe('the relevance floor (gap S2)', () => {
  it('a candidate found only by meaning, far below the best meaning match, is not returned', async () => {
    const a = await art('Ledger', 'ledger reconciliation runs nightly');
    const b = await art('Garden', big('garden tomato soil water compost', 400));   // many chunks, nothing in common
    const ids = await found('ledger reconciliation');
    expect(ids).toContain(a);
    expect(ids).not.toContain(b);
  });
  it('an exact-word match is never dropped by the floor, however weak its meaning (S3-R10/R13)', async () => {
    await art('Ledger', 'ledger reconciliation runs nightly');
    const c = await art('Mostly other', `${big('harbour ferry timetable winter schedule', 30)}\n\nledger`);
    expect(await found('ledger reconciliation')).toContain(c);
    // Far below the bar by meaning, yet still ranked by its meaning too: the floor never drops a word match's
    // meaning rank, so its ranking (fuse) is what it was before the floor.
    const explain: ExplainRow[] = [];
    const results = await search(env, me, SearchQuery.parse({ query: 'ledger reconciliation', limit: 25 }), undefined, { explain });
    const row = explain.find((r) => r.itemId === c)!;
    const best = Math.max(...explain.map((r) => r.vectorScore ?? Number.NEGATIVE_INFINITY));
    expect(row.vectorScore!).toBeLessThan(best - RELEVANCE.vectorGap);
    expect(row).toMatchObject({ fts: expect.any(Number), vector: expect.any(Number), kept: true });
    // More than its word rank alone would give: its meaning rank still counts.
    expect(results.find((r) => r.itemId === c)!.score).toBeGreaterThan(fuse({ fts: row.fts! }, 'completed'));
  });
  it('common words alone no longer make an item a word match', async () => {
    await art('Notes', 'ledger notes for the quarter');
    const d = await art('Road', 'on the road again');
    expect(ftsQuery('notes on the ledger')).toBe('"notes" OR "ledger"');
    expect(await found('notes on the ledger')).not.toContain(d);
  });
  it('a query of only common words still searches them', async () => {
    const e = await art('The', 'the of and to in');
    expect(ftsQuery('the of')).toBe('"the" OR "of"');
    expect(await found('the of')).toContain(e);
  });
  it('related never measures the floor against the item itself', async () => {
    const a = await art('Aaa', 'the of and to in alpha');
    const e = await art('Eee', 'the of and to in beta');   // no shared telling word: found only by meaning
    const items = await related(env, me, RelatedQuery.parse({ itemId: a }));
    expect(items.map((x) => x.itemId)).toContain(e);
    expect(items.map((x) => x.itemId)).not.toContain(a);
  });
  it('related on a basis of only common words still finds work that shares them', async () => {
    const a = await art('the', 'the of and to in');
    const e = await art('of', 'the of and to in gamma');
    const items = await related(env, me, RelatedQuery.parse({ itemId: a }));
    expect(items.map((x) => x.itemId)).toContain(e);
  });
});

describe('the explain route (gap S2, operators only)', () => {
  const bag = env as unknown as Record<string, unknown>;
  afterEach(() => { bag.OPERATORS = ''; });
  const explain = (init: { principal?: string; headers?: Record<string, string> } = {}) => call('/api/v1/admin/search/explain', { method: 'POST', body: { query: 'ledger reconciliation', limit: 10 }, ...init });

  it('answers operators only, as themselves, with how the floor treated each candidate', async () => {
    const a = await art('Ledger', 'ledger reconciliation runs nightly');
    const b = await art('Garden', big('garden tomato soil water compost', 400));
    expect((await explain()).status).toBe(403);   // a person not listed in OPERATORS
    bag.OPERATORS = HUMAN;
    const bad = await call('/api/v1/admin/search/explain', { method: 'POST', body: { query: '' } });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: 'invalid', issues: [{ path: 'query' }] });
    const r = await explain();
    expect(r.status).toBe(200);
    const body = await r.json<{ results: Array<{ itemId: string; title: string; outcome: string; score: number }>; candidates: ExplainRow[] }>();
    // Earlier tests' items share this workspace's words index, so only these two are asserted.
    expect(body.results.map((x) => x.itemId)).toContain(a);
    expect(body.results.map((x) => x.itemId)).not.toContain(b);
    expect(body.results.find((x) => x.itemId === a)).toEqual({ itemId: a, title: 'Ledger', outcome: expect.any(String), score: expect.any(Number) });
    expect(body.candidates.find((c) => c.itemId === a)).toMatchObject({ fts: expect.any(Number), kept: true });
    expect(body.candidates.find((c) => c.itemId === b)).toMatchObject({ fts: null, vector: expect.any(Number), vectorScore: expect.any(Number), kept: false });
    const row = await env.DB.prepare(`SELECT detail FROM audit_events WHERE action = 'items.searched' AND actor = ? ORDER BY rowid DESC LIMIT 1`).bind(HUMAN).first<{ detail: string }>();
    expect(JSON.parse(row!.detail)).toEqual({ count: body.results.length, queryLength: 'ledger reconciliation'.length, explain: true });
  });
  it('an agent is refused, even one listed in OPERATORS', async () => {
    bag.OPERATORS = AGENT;
    await withOrgPlane(async () => {
      const t = await planeToken({ sub: AGENT, principalKind: 'agent' });
      const r = await SELF.fetch(`${API}/api/v1/admin/search/explain`, { method: 'POST', headers: { Authorization: `Bearer ${t}`, 'content-type': 'application/json' }, body: JSON.stringify({ query: 'ledger' }) });
      expect(r.status).toBe(403);
      expect(await r.json()).toMatchObject({ error: 'principal_not_supported' });
    });
  });
});
