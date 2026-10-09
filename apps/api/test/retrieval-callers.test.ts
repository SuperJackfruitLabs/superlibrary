import { SELF, env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setIndexingForTests } from '../src/indexing/vector-index';
import { fakeEmbedder, fakeVectorize } from './helpers/fake-vectors';
import { HUMAN, planeToken, withOrgPlane } from './helpers/org-plane';

// Operator ruling R-H1 (the hub never acts for a person), proven on every retrieval entry point:
// the shared resolver refuses a person's token that a service minted, and a person's own token works.
const HUB_SVC = 'prn_0000000000000000c0b1';
const DETAIL = 'a token minted for a person by a service is refused; sign in as yourself';
const MISSING_ITEM = 'itm_00000000000000ff';
const bag = env as unknown as Record<string, unknown>;

beforeEach(() => setIndexingForTests({ embedders: { 'workers-ai/bge-m3': fakeEmbedder() }, bindings: { a: fakeVectorize() } }));
afterEach(() => { setIndexingForTests(null); bag.HUB_SERVICE_PRINCIPAL = ''; });

type Route = { name: string; send: (token: string) => Promise<Response>; ownStatus: number };
const json = (path: string, token: string, body: unknown) =>
  SELF.fetch(`https://api.test${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });

const routes: Route[] = [
  { name: 'POST /api/v1/search', ownStatus: 200, send: (t) => json('/api/v1/search', t, { query: 'release notes' }) },
  { name: 'GET /api/v1/library/:itemId', ownStatus: 404, send: (t) => SELF.fetch(`https://api.test/api/v1/library/${MISSING_ITEM}`, { headers: { Authorization: `Bearer ${t}` } }) },
  { name: 'POST /api/v1/related', ownStatus: 200, send: (t) => json('/api/v1/related', t, { cardId: 'card_00000000000000d1' }) },
  {
    name: 'POST /mcp (tools/call library_search)',
    ownStatus: 200,
    send: (t) => SELF.fetch('https://api.test/mcp', {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'library_search', arguments: { query: 'release notes' } } }),
    }),
  },
];

const variants: Array<[string, Record<string, unknown>]> = [
  ['act names the hub', { act: { sub: HUB_SVC }, amr: ['pwd'] }],
  ['amr is assertion (no act)', { amr: ['assertion'] }],
];

describe.each(routes)('$name', (route) => {
  it.each(variants)("refuses a person's hub-minted token: %s", async (_label, claims) => {
    await withOrgPlane(async () => {
      const minted = await planeToken({ sub: HUMAN, principalKind: 'human', ...claims });
      const r = await route.send(minted);
      expect(r.status).toBe(403);
      expect(await r.json()).toEqual({ error: 'principal_not_supported', detail: DETAIL });
    });
  });

  it("accepts the same person's own token (no act, no assertion amr)", async () => {
    await withOrgPlane(async () => {
      const own = await planeToken({ sub: HUMAN, principalKind: 'human', amr: ['pwd'] });
      const r = await route.send(own);
      expect(r.status).toBe(route.ownStatus);
      expect(await r.text()).not.toContain(DETAIL);
    });
  });
});
