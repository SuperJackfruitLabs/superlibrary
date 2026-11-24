import { SELF } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { checkExchange, takeMismatches, treatyHttpChecked } from './helpers/treaty-http';
import { AGENT, devHeaders } from './helpers/org-plane';
import { useSigningKey } from './helpers/signing';
import { API, upload } from './helpers/upload';

const JSON_TYPE = 'application/json';
const noBody = { contentType: null, text: '' };
const json = { 'content-type': JSON_TYPE };
const post = (path: string, body: unknown, headers = devHeaders()) =>
  SELF.fetch(`${API}${path}`, { method: 'POST', headers: { ...headers, ...json }, body: JSON.stringify(body) });

describe("the contract hook (treaty's superlibrary.api)", () => {
  beforeAll(async () => { await useSigningKey(); });

  it('records a response the contract refuses, and a refusal without the fields its code carries', () => {
    checkExchange('GET', `${API}/api/v1/me`, noBody, 200, JSON_TYPE, JSON.stringify({ nobody: true }));
    checkExchange('POST', `${API}/api/v1/uploads/upl_x/commit`, noBody, 422, JSON_TYPE, JSON.stringify({ error: 'secret_found' }));
    checkExchange('POST', `${API}/api/v1/uploads`, noBody, 413, JSON_TYPE, JSON.stringify({ error: 'quota_exceeded', limit: 10 }));
    const found = takeMismatches();
    expect(found).toHaveLength(3);
    expect(found[1]).toContain('findings');
    expect(found[2]).toContain('used');
  });

  it('records a status the contract does not name, and a request it refuses that was accepted', () => {
    checkExchange('GET', `${API}/api/v1/me`, noBody, 418, JSON_TYPE, JSON.stringify({ error: 'invalid' }));
    checkExchange('POST', `${API}/api/v1/related`, { contentType: JSON_TYPE, text: '{"limit":"many"}' }, 200, JSON_TYPE, JSON.stringify({ items: [] }));
    expect(takeMismatches()).toHaveLength(2);
  });

  it("lets a work record's known differences through, and nothing beside them", () => {
    const item = { id: 'itm_00000000000000a1', kind: 'work-record', title: 'A card', scope: 'workspace', outcome: 'completed', createdBy: 'source:superpipeline', createdAt: '2026-11-01T00:00:00Z', latestVersion: 0, expiresAt: null, revokedAt: null };
    checkExchange('GET', `${API}/api/v1/items/${item.id}`, noBody, 200, JSON_TYPE, JSON.stringify({ item, versions: [] }));
    expect(takeMismatches()).toEqual([]);
    checkExchange('GET', `${API}/api/v1/items/${item.id}`, noBody, 200, JSON_TYPE, JSON.stringify({ item: { ...item, scope: 7 }, versions: [] }));
    expect(takeMismatches()).toHaveLength(1);
  });

  it('ignores a route the contract does not describe', () => {
    checkExchange('GET', `${API}/api/v1/browse`, noBody, 200, JSON_TYPE, 'not json');
    expect(takeMismatches()).toEqual([]);
  });

  it('checks all ten contracted routes as the Worker answers them, refusals with their fields included', async () => {
    expect((await SELF.fetch(`${API}/api/v1/me`, { headers: devHeaders() })).status).toBe(200);
    // Refusals that carry fields beside `error`: path_refused (path, reason), size_mismatch (path),
    // incomplete (missing).
    expect((await upload([{ path: '../a.txt', body: 'x' }])).status).toBe(400);
    const declared = await post('/api/v1/uploads', { title: 'Two files', files: [{ path: 'a.txt', bytes: 1, sha256: '0'.repeat(64) }, { path: 'b.txt', bytes: 1, sha256: '0'.repeat(64) }] });
    expect(declared.status).toBe(201);
    const { uploadId } = await declared.json<{ uploadId: string }>();
    expect((await SELF.fetch(`${API}/api/v1/uploads/${uploadId}/files?path=a.txt`, { method: 'PUT', headers: devHeaders(), body: 'wrong size' })).status).toBe(400);
    const incomplete = await post(`/api/v1/uploads/${uploadId}/commit`, undefined);
    expect(incomplete.status).toBe(409);
    expect(await incomplete.json()).toMatchObject({ error: 'incomplete', missing: ['a.txt', 'b.txt'] });
    // A whole upload, then the item's routes.
    const saved = await upload([{ path: 'notes.md', body: '# Notes' }]);
    expect(saved.status).toBe(201);
    const itemId: string = saved.body.itemId;
    expect((await post(`/api/v1/uploads/${saved.uploadId}/verification`, { schemaVersion: 'superlibrary-upload-verification/v1' })).status).toBeLessThan(500);
    expect((await SELF.fetch(`${API}/api/v1/items/${itemId}`, { headers: devHeaders() })).status).toBe(200);
    expect((await post(`/api/v1/items/${itemId}/embed`, {})).status).toBe(200);
    expect((await post(`/api/v1/items/${itemId}/scope`, { scope: 'workspace' })).status).toBe(200);
    expect((await post('/api/v1/related', { itemId })).status).toBe(200);
    expect((await post('/api/v1/roster/invalidate', { principal: AGENT })).status).toBeLessThan(500);
    expect((await SELF.fetch(`${API}/api/v1/items/itm_ffffffffffffffff`, { headers: devHeaders() })).status).toBe(404);

    expect(Object.keys(treatyHttpChecked).toSorted()).toEqual(
      ['commitUpload', 'createUpload', 'embedItem', 'getItem', 'invalidateRoster', 'me', 'putUploadFile', 'relatedWork', 'verifyUpload', 'widenItemScope'],
    );
  });
});
