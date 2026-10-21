import { createExecutionContext, SELF, env } from 'cloudflare:test';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { contentLabel, encodePath, type Manifest } from '@superlibrary/contract';
import contentWorker, { type Env as ContentEnv } from '../../content/src/index';
import evidenceFixture from './fixtures/m23-execution-evidence.json';
import { API, sha256Hex, upload } from './helpers/upload';
import { HUMAN, HUMAN_2, OTHER_ORG, devHeaders, planeToken, withOrgPlane } from './helpers/org-plane';
import { useSigningKey } from './helpers/signing';

// Mirrored synthetic AgentPod packages/contract/src/fixtures/execution-artifacts-v1.json
// success[immutable-produced-bytes]. This is a consumer fixture, not a schema validator:
// Library stores arbitrary admitted bytes; AgentPod owns execution schema validation.
const ARTIFACT_ID = '33333333-3333-4333-8333-333333333333';
const ARTIFACT_PATH = `artifacts/${ARTIFACT_ID}.json`;
const ENTRY = 'execution-manifest.json';
const bytes = (s: string) => new TextEncoder().encode(s).length;
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
async function bundle(raw = canonical({ kind: 'workspace.patch', result: 'produced', patch: 'hello → नमस्ते\n' })) {
  const sha256 = await sha256Hex(raw);
  const evidence = structuredClone(evidenceFixture);
  evidence.artifacts[0]!.digest = sha256;
  evidence.artifacts[0]!.bytes = bytes(raw);
  const artifact = { artifact_id: ARTIFACT_ID, session_id: evidence.task.session_id, path: ARTIFACT_PATH, sha256, bytes: bytes(raw), disposition: 'produced' };
  return [
    { path: ENTRY, body: canonical({ schema_version: 'agentpod-execution-manifest/v1', evidence, artifact_files: [artifact] }) },
    { path: ARTIFACT_PATH, body: raw },
  ];
}
const commit = (id: string, headers = devHeaders()) => SELF.fetch(`${API}/api/v1/uploads/${id}/commit`, { method: 'POST', headers });
let publicJwk: string;
beforeAll(async () => { publicJwk = JSON.stringify(await crypto.subtle.exportKey('jwk', await useSigningKey())); });
function contentGet(url: string) {
  const e: ContentEnv = {
    BLOBS: env.BLOBS, URL_SIGNING_PUBLIC_KEY: publicJwk, FRAME_ANCESTORS: API, CONTENT_DOMAIN: 'content.test',
    VIEWER: { fetch: async () => new Response('unused static viewer'), connect: () => { throw new Error('static viewer must not open sockets'); } },
  };
  return contentWorker.fetch(new Request(url) as Parameters<typeof contentWorker.fetch>[0], e, createExecutionContext());
}
async function grant(itemId: string, version: number, headers = devHeaders()) {
  return SELF.fetch(`${API}/api/v1/items/${itemId}/embed`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ version }) });
}
function downloadUrl(viewerUrl: string, path: string) {
  const u = new URL(viewerUrl);
  return `${u.origin}/s/${u.searchParams.get('sig')}/${encodePath(path)}?download=1`;
}

describe('M23 AgentPod immutable execution bundle: real Library upload and signed content handlers', () => {
  it('preserves manifest and raw UTF-8 bytes, hashes the sorted path/hash list, and addresses files by item/version/path', async () => {
    const files = await bundle();
    // Reverse wire order: the bundle digest must not depend on upload order.
    const saved = await upload([...files].reverse(), { entry: ENTRY });
    expect(saved.status).toBe(201);
    const sortedPairs = await Promise.all([...files].sort((a, b) => a.path < b.path ? -1 : 1).map(async f => [f.path, await sha256Hex(f.body)]));
    expect(saved.body.sha256).toBe(await sha256Hex(JSON.stringify(sortedPairs)));
    expect(saved.body.bytes).toBe(files.reduce((n, f) => n + bytes(f.body), 0));
    expect(saved.body).not.toHaveProperty('fileId');
    const manifest = await (await env.BLOBS.get(`manifests/${saved.body.itemId}/1.json`))!.json<Manifest>();
    expect(manifest.entry).toBe(ENTRY);
    expect(Object.keys(manifest.files).sort()).toEqual(files.map(f => f.path).sort());
    const rows = await env.DB.prepare('SELECT item_id, version, path, sha256, bytes FROM version_files WHERE item_id = ? AND version = ?').bind(saved.body.itemId, 1).all<{ item_id: string; version: number; path: string; sha256: string; bytes: number }>();
    const g = await grant(saved.body.itemId, 1);
    expect(g.status).toBe(200);
    const { url, downloadUrl: singleDownload } = await g.json<{ url: string; downloadUrl: string | null }>();
    expect(singleDownload).toBeNull();
    for (const f of files) {
      const hash = await sha256Hex(f.body);
      expect(manifest.files[f.path]).toMatchObject({ sha256: hash, bytes: bytes(f.body) });
      expect(rows.results).toContainEqual({ item_id: saved.body.itemId, version: 1, path: f.path, sha256: hash, bytes: bytes(f.body) });
      const fetched = await contentGet(downloadUrl(url, f.path));
      expect(fetched.status).toBe(200);
      const raw = await fetched.text();
      expect(raw).toBe(f.body);
      expect(await sha256Hex(raw)).toBe(hash);
      expect(bytes(raw)).toBe(bytes(f.body));
    }
    expect((await contentGet(downloadUrl(url, 'artifacts/unadmitted.json'))).status).toBe(404);
    const changed = await upload(await bundle(canonical({ result: 'new version' })), { item: saved.body.itemId, entry: ENTRY });
    expect(changed.body.version).toBe(2);
    // The old version grant still retrieves its exact original bytes after a new version exists.
    expect(await (await contentGet(downloadUrl(url, ARTIFACT_PATH))).text()).toBe(files[1]!.body);
    const wrongItem = new URL(downloadUrl(url, ARTIFACT_PATH));
    wrongItem.hostname = `${contentLabel('itm_00000000000000ff')}.content.test`;
    expect((await contentGet(wrongItem.href)).status).toBe(403);
  });

  it('replays the saved upload after a lost response and repairs a partially published manifest without duplicating the version', async () => {
    const files = await bundle();
    const declared = await upload(files, { entry: ENTRY, commit: false });
    expect(declared.status).toBe(200);
    // The first commit completes but its response is lost to the producer.
    const first = await commit(declared.uploadId);
    expect(first.status).toBe(201);
    const result = await first.json<{ itemId: string; version: number }>();
    const key = `manifests/${result.itemId}/${result.version}.json`;
    await env.BLOBS.delete(key); // D1 committed; final R2 publication absent.
    const replay = await commit(declared.uploadId);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(result);
    expect(await env.BLOBS.head(key)).not.toBeNull();
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM versions WHERE item_id = ?').bind(result.itemId).first()).toEqual({ n: 1 });
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE item_id = ? AND action = 'version.created'").bind(result.itemId).first()).toEqual({ n: 1 });
    const { url } = await (await grant(result.itemId, result.version)).json<{ url: string }>();
    for (const f of files) expect(await (await contentGet(downloadUrl(url, f.path))).text()).toBe(f.body);
  });

  it('finishes publication on the same upload when the final manifest write fails after D1 commits', async () => {
    const files = await bundle();
    const pending = await upload(files, { entry: ENTRY, commit: false });
    const put = vi.spyOn(env.BLOBS, 'put').mockRejectedValueOnce(new Error('synthetic manifest publication failure'));
    try {
      expect((await commit(pending.uploadId)).status).toBe(500);
      expect(put).toHaveBeenCalledTimes(1);
      expect(put.mock.calls[0]![0]).toMatch(/^manifests\/itm_[0-9a-f]{16}\/1\.json$/);
    } finally {
      put.mockRestore();
    }
    const recorded = await env.DB.prepare('SELECT state, result_item_id, result_version FROM upload_sessions WHERE id = ?').bind(pending.uploadId).first<{ state: string; result_item_id: string; result_version: number }>();
    expect(recorded).toMatchObject({ state: 'committed', result_version: 1 });
    expect(await env.BLOBS.head(`manifests/${recorded!.result_item_id}/1.json`)).toBeNull();
    const replay = await commit(pending.uploadId);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({ itemId: recorded!.result_item_id, version: 1 });
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM versions WHERE item_id = ?').bind(recorded!.result_item_id).first()).toEqual({ n: 1 });
    const { url } = await (await grant(recorded!.result_item_id, 1)).json<{ url: string }>();
    for (const f of files) expect(await (await contentGet(downloadUrl(url, f.path))).text()).toBe(f.body);
  });

  it('protects declare/PUT/commit and grants by authenticated tenant and principal; body evidence conveys no authority', async () => {
    await withOrgPlane(async () => {
      const owner = { Authorization: `Bearer ${await planeToken()}` };
      const otherPerson = { Authorization: `Bearer ${await planeToken({ sub: HUMAN_2 })}` };
      const otherTenant = { Authorization: `Bearer ${await planeToken({ org: OTHER_ORG })}` };
      const files = await bundle(); // Fixture binding deliberately names a different principal and org.
      const pending = await upload(files, { headers: owner, scope: 'board:brd_00000000000000b1', entry: ENTRY, commit: false });
      expect(pending.status).toBe(200);
      for (const headers of [otherPerson, otherTenant]) {
        expect((await SELF.fetch(`${API}/api/v1/uploads/${pending.uploadId}/files?path=${encodeURIComponent(ARTIFACT_PATH)}`, { method: 'PUT', headers, body: files[1]!.body })).status).toBe(404);
        expect((await commit(pending.uploadId, headers)).status).toBe(404);
      }
      const saved = await commit(pending.uploadId, owner);
      expect(saved.status).toBe(201);
      const { itemId } = await saved.json<{ itemId: string }>();
      const row = await env.DB.prepare('SELECT created_by FROM items WHERE id = ?').bind(itemId).first();
      expect(row).toEqual({ created_by: HUMAN });
      for (const headers of [otherPerson, otherTenant]) {
        expect((await grant(itemId, 1, headers)).status).toBe(404);
        const denied = await upload(files, { headers, item: itemId, entry: ENTRY });
        expect(denied.status).toBe(404);
      }
      expect((await grant(itemId, 1, owner)).status).toBe(200);
      expect((await SELF.fetch(`${API}/api/v1/items/${itemId}/embed`, { method: 'POST' })).status).toBe(401);
    });
  });

  it('scans selected raw artifact bytes and refuses publication with exact artifact path, without a base64 wrapper', async () => {
    // Synthetic recognisable token, assembled so repository scanners do not mistake it for a key.
    const synthetic = 'gh' + 'p_' + 'aB3xQ9zK7mP2wR5t'.repeat(3);
    const files = await bundle(canonical({ patch: `const token = "${synthetic}";` }));
    const refused = await upload(files, { entry: ENTRY });
    expect(refused.status).toBe(422);
    expect(refused.body).toEqual({ error: 'secret_found', findings: [{ path: ARTIFACT_PATH, line: 1, rule: 'github-token' }] });
    const hash = await sha256Hex(files[1]!.body);
    expect(await env.BLOBS.head(`blobs/${hash}`)).toBeNull();
    expect(await env.BLOBS.head(`quarantine/${refused.uploadId}/${hash}`)).not.toBeNull();
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM version_files WHERE sha256 = ?').bind(hash).first()).toEqual({ n: 0 });
    expect(files[1]!.body).toContain(synthetic);
    expect(files[0]!.body).not.toContain(synthetic);
  });
});
