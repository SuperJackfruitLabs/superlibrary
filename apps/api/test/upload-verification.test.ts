import { createExecutionContext, SELF, env } from 'cloudflare:test';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { UploadVerificationGrant } from '@superlibrary/contract';
import { AGENT, HUMAN_2, OTHER_ORG, planeToken, withOrgPlane } from './helpers/org-plane';
import { API, HUB_SVC, hubHeaders, upload } from './helpers/upload';
import { useSigningKey } from './helpers/signing';
import { deleteItem } from '../src/lifecycle/retention';
import contentWorker, { type Env as ContentEnv } from '../../content/src/index';
const bag = env as unknown as Record<string, unknown>;
const body = { schemaVersion: 'superlibrary-upload-verification/v1' };
const verify = (id: string, headers: Record<string, string>, data: unknown = body) => SELF.fetch(`${API}/api/v1/uploads/${id}/verification`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(data) });
const source = { station: 'stn_00000000000000a1', path: 'execution-manifest.json', board: 'brd_00000000000000a1' };
const send = (headers: Record<string, string>, commit = true) => upload([{ path: source.path, body: 'original manifest' }, { path: 'artifact.json', body: 'raw bytes' }], { headers, source, scope: `board:${source.board}`, commit });
let publicJwk: string;
beforeAll(async () => { publicJwk = JSON.stringify(await crypto.subtle.exportKey('jwk', await useSigningKey())); });
function contentGet(url: string) {
  const e: ContentEnv = { BLOBS: env.BLOBS, URL_SIGNING_PUBLIC_KEY: publicJwk, FRAME_ANCESTORS: API, CONTENT_DOMAIN: 'content.test', VIEWER: { fetch: async () => new Response('unused'), connect: () => { throw new Error('unused'); } } };
  return contentWorker.fetch(new Request(url) as Parameters<typeof contentWorker.fetch>[0], e, createExecutionContext());
}
function downloadUrl(url: string, path: string) { const u = new URL(url); return `${u.origin}/s/${u.searchParams.get('sig')}/${path.split('/').map(encodeURIComponent).join('/')}?download=1`; }
afterEach(() => { bag.HUB_SERVICE_PRINCIPAL = ''; });
describe('owned upload verification through real plane proof and upload handlers', () => {
  it('resumes exact original committed result; denies foreign owner/tenant and general embed', async () => withOrgPlane(async () => {
    bag.HUB_SERVICE_PRINCIPAL = HUB_SVC;
    const headers = await hubHeaders(AGENT), saved = await send(headers);
    expect(saved.status).toBe(201);
    const result = await verify(saved.uploadId, headers);
    expect(result.status).toBe(200);
    const grant = UploadVerificationGrant.parse(await result.json());
    expect(grant).toMatchObject({ ...body, uploadId: saved.uploadId, itemId: saved.body.itemId, version: 1, sha256: saved.body.sha256, bytes: saved.body.bytes });
    expect(grant.files.map(f => f.path)).toEqual(['artifact.json', source.path]);
    expect(await (await contentGet(downloadUrl(grant.url, 'artifact.json'))).text()).toBe('raw bytes');
    expect((await contentGet(downloadUrl(grant.url, 'not-uploaded.json'))).status).toBe(404);
    expect(await env.DB.prepare('SELECT 1 FROM members WHERE principal_id = ?').bind(AGENT).first()).toBeNull();
    vi.useFakeTimers();
    try { vi.setSystemTime(Date.parse(grant.expiresAt) + 1000); expect((await contentGet(downloadUrl(grant.url, 'artifact.json'))).status).toBe(403); }
    finally { vi.useRealTimers(); }
    expect(Date.parse(grant.expiresAt) - Date.now()).toBeLessThanOrEqual(60_000);
    const replay = await SELF.fetch(`${API}/api/v1/uploads/${saved.uploadId}/commit`, { method: 'POST', headers });
    expect(replay.status).toBe(200); expect(await replay.json()).toEqual(saved.body);
    expect((await verify(saved.uploadId, headers)).status).toBe(200);
    expect((await SELF.fetch(`${API}/api/v1/items/${saved.body.itemId}/embed`, { method: 'POST', headers })).status).toBe(403);
    expect((await verify(saved.uploadId, headers, { ...body, itemId: saved.body.itemId, version: 2 })).status).toBe(400);
    expect((await verify(saved.uploadId, headers, {})).status).toBe(400);
    const next = await send(headers); expect(next.body.version).toBe(2);
    expect((await (await verify(saved.uploadId, headers)).json<any>()).version).toBe(1);
    expect((await verify(saved.uploadId, await hubHeaders(HUMAN_2))).status).toBe(404);
    const foreign = await hubHeaders(AGENT);
    foreign.Authorization = `Bearer ${await planeToken({ sub: HUB_SVC, principalKind: 'service', org: OTHER_ORG })}`;
    foreign['X-On-Behalf-Token'] = await planeToken({ sub: AGENT, principalKind: 'agent', org: OTHER_ORG, act: { sub: HUB_SVC } });
    expect((await verify(saved.uploadId, foreign)).status).toBe(404);
  }));
  it('denies direct agents, other services, missing/mismatched/expired proofs and uncommitted sessions', async () => withOrgPlane(async () => {
    bag.HUB_SERVICE_PRINCIPAL = HUB_SVC;
    const headers = await hubHeaders(AGENT), saved = await send(headers, false);
    expect((await verify(saved.uploadId, headers)).status).toBe(409);
    expect((await verify(saved.uploadId, { Authorization: `Bearer ${await planeToken({ sub: AGENT, principalKind: 'agent' })}` })).status).toBe(403);
    const missing = { ...headers }; delete missing['X-On-Behalf-Token'];
    expect((await verify(saved.uploadId, missing)).status).toBe(403);
    expect((await verify(saved.uploadId, { Authorization: headers.Authorization! })).status).toBe(403);
    expect((await verify(saved.uploadId, { ...headers, 'X-On-Behalf-Kind': 'human' })).status).toBe(403);
    expect((await verify(saved.uploadId, { Authorization: `Bearer ${await planeToken({ sub: HUMAN_2, principalKind: 'human', act: { sub: HUB_SVC } })}` })).status).toBe(403);
    for (const proof of ['malformed', await planeToken({ sub: AGENT, principalKind: 'agent', org: OTHER_ORG, act: { sub: HUB_SVC } }), await planeToken({ sub: AGENT, principalKind: 'agent', act: { sub: HUMAN_2 } }), await planeToken({ sub: HUMAN_2, principalKind: 'agent', act: { sub: HUB_SVC } }), await planeToken({ sub: AGENT, principalKind: 'agent', act: { sub: HUB_SVC } }, { exp: '-1m' })])
      expect((await verify(saved.uploadId, { ...headers, 'X-On-Behalf-Token': proof })).status).toBe(403);
    expect((await verify(saved.uploadId, { ...headers, Authorization: `Bearer ${await planeToken({ sub: HUMAN_2, principalKind: 'service' })}` })).status).toBe(403);
  }));
  it('denies item expiry, item/version revocation and retention deletion', async () => withOrgPlane(async () => {
    bag.HUB_SERVICE_PRINCIPAL = HUB_SVC;
    const headers = await hubHeaders(AGENT);
    for (const mutation of ["UPDATE items SET expires_at = '2000-01-01T00:00:00Z' WHERE id = ?", "UPDATE items SET revoked_at = datetime('now') WHERE id = ?", "UPDATE versions SET revoked_at = datetime('now') WHERE item_id = ?", 'retention']) {
      const saved = await send(headers); expect(saved.status).toBe(201);
      if (mutation === 'retention') await deleteItem(env, saved.body.itemId, 'retention', 'test');
      else await env.DB.prepare(mutation).bind(saved.body.itemId).run();
      expect((await verify(saved.uploadId, headers)).status).toBe(410);
    }
  }));
});
