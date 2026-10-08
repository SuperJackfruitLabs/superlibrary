import { SELF, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { API, sha256Hex, upload } from './helpers/upload';
import { HUMAN_2, devHeaders } from './helpers/org-plane';

const SECRET = 'const t = "' + 'gh' + 'p_' + 'aB3xQ9zK7mP2wR5t'.repeat(3) + '";';

describe('commit', () => {
  it('creates an item and version 1, with spec §5 return shape, and a manifest in R2', async () => {
    const r = await upload([{ path: 'report.md', body: '# Report\n' }], { title: 'Weekly report' });
    expect(r.status).toBe(201);
    expect(r.body).toEqual({
      itemId: expect.stringMatching(/^itm_[0-9a-f]{16}$/), version: 1, url: `${API}/a/${r.body.itemId}`,
      sha256: await sha256Hex(new TextEncoder().encode('# Report\n')), mediaType: 'text/markdown; charset=utf-8', bytes: 9,
    });
    const manifest = await (await env.BLOBS.get(`manifests/${r.body.itemId}/1.json`))!.json();
    expect(manifest).toEqual({ itemId: r.body.itemId, version: 1, entry: 'report.md', expiresAt: null, files: { 'report.md': { sha256: r.body.sha256, bytes: 9, mediaType: 'text/markdown; charset=utf-8', view: 'markdown' } } });
    const audited = await env.DB.prepare(`SELECT action FROM audit_events WHERE item_id = ? ORDER BY at`).bind(r.body.itemId).all<{ action: string }>();
    expect(audited.results.map((a) => a.action)).toEqual(['item.created', 'version.created']);
  });

  it('a folder version is addressed by the hash of its sorted (path, sha256) list', async () => {
    const r = await upload([{ path: 'site/index.html', body: '<!doctype html><p>x' }, { path: 'site/app.js', body: 'console.log(1)' }]);
    const list = [['site/app.js', await sha256Hex(new TextEncoder().encode('console.log(1)'))], ['site/index.html', await sha256Hex(new TextEncoder().encode('<!doctype html><p>x'))]];
    expect(r.body.sha256).toBe(await sha256Hex(JSON.stringify(list)));
    expect(r.body.mediaType).toBe('text/html; charset=utf-8');
  });

  it('identical bytes are stored once; a new version of the same item is n+1', async () => {
    const first = await upload([{ path: 'a.txt', body: 'same' }]);
    const second = await upload([{ path: 'a.txt', body: 'same' }], { item: first.body.itemId });
    expect(second.body).toMatchObject({ itemId: first.body.itemId, version: 2, sha256: first.body.sha256 });
    const listed = await env.BLOBS.list({ prefix: `blobs/${first.body.sha256}` });
    expect(listed.objects).toHaveLength(1);
  });

  it('refuses a commit with files still missing', async () => {
    const created = await SELF.fetch(`${API}/api/v1/uploads`, { method: 'POST', headers: { ...devHeaders(), 'content-type': 'application/json' }, body: JSON.stringify({ title: 't', files: [{ path: 'a.txt', bytes: 1, sha256: 'a'.repeat(64) }] }) });
    const { uploadId } = await created.json<{ uploadId: string }>();
    const res = await SELF.fetch(`${API}/api/v1/uploads/${uploadId}/commit`, { method: 'POST', headers: devHeaders() });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'incomplete', missing: ['a.txt'] });
  });

  it('a secret is refused naming file and line; an override is recorded and lets it through', async () => {
    const refused = await upload([{ path: 'src/config.ts', body: `ok\n${SECRET}\n` }]);
    expect(refused.status).toBe(422);
    expect(refused.body).toEqual({ error: 'secret_found', findings: [{ path: 'src/config.ts', line: 2, rule: 'github-token' }] });

    const allowed = await upload([{ path: 'src/config.ts', body: `ok\n${SECRET}\n` }], { override: 'test fixture, revoked key' });
    expect(allowed.status).toBe(201);
    const v = await env.DB.prepare(`SELECT scan_override FROM versions WHERE item_id = ?`).bind(allowed.body.itemId).first<{ scan_override: number }>();
    expect(v?.scan_override).toBe(1);
    const rec = await env.DB.prepare(`SELECT actor, detail FROM audit_events WHERE action = 'scan.overridden' AND detail LIKE ?`).bind(`%${allowed.uploadId}%`).first<{ actor: string; detail: string }>();
    expect(rec?.actor).toBe('prn_000000000000000000a1');
    expect(JSON.parse(rec!.detail)).toEqual({ uploadId: allowed.uploadId, reason: 'test fixture, revoked key', findings: [{ path: 'src/config.ts', line: 2, rule: 'github-token' }] });
  });

  it('an override with nothing found is refused, and needs a reason', async () => {
    const r = await upload([{ path: 'a.txt', body: 'clean' }], { commit: false });
    const res = await SELF.fetch(`${API}/api/v1/uploads/${r.uploadId}/override`, { method: 'POST', headers: { ...devHeaders(), 'content-type': 'application/json' }, body: JSON.stringify({ reason: 'x' }) });
    expect(res.status).toBe(409);
    const s = await upload([{ path: 'a.ts', body: SECRET }], { commit: false });
    const empty = await SELF.fetch(`${API}/api/v1/uploads/${s.uploadId}/override`, { method: 'POST', headers: { ...devHeaders(), 'content-type': 'application/json' }, body: JSON.stringify({ reason: '' }) });
    expect(empty.status).toBe(400);
  });

  it('committing twice answers the same result, and repairs a missing manifest', async () => {
    const r = await upload([{ path: 'a.txt', body: 'twice' }]);
    await env.BLOBS.delete(`manifests/${r.body.itemId}/1.json`);
    const again = await SELF.fetch(`${API}/api/v1/uploads/${r.uploadId}/commit`, { method: 'POST', headers: devHeaders() });
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual(r.body);
    expect(await env.BLOBS.head(`manifests/${r.body.itemId}/1.json`)).not.toBeNull();
  });

  it('only the uploader or an owner may add a version to an item', async () => {
    const r = await upload([{ path: 'a.txt', body: 'mine' }]);
    const other = await upload([{ path: 'a.txt', body: 'theirs' }], { item: r.body.itemId, headers: devHeaders(HUMAN_2) });
    expect(other.status).toBe(404);
  });
});

const enc = (s: string) => new TextEncoder().encode(s);
const post = (path: string, body?: unknown, headers = devHeaders()) =>
  SELF.fetch(`${API}/api/v1/uploads${path ? `/${path}` : ''}`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

/**
 * A deterministic race: `outer` reads its state, then its D1 batch waits until `inner` has run to
 * completion, exactly as if the two requests had interleaved. The worker shares this `env`.
 */
async function whileFirstBatchWaits(inner: () => Promise<Response>, outer: () => Promise<Response>) {
  const db = env.DB as D1Database & { batch: D1Database['batch'] };
  const original = db.batch.bind(db);
  let innerRes: { status: number; body: unknown } | undefined;
  let held = false;
  db.batch = (async (statements: D1PreparedStatement[]) => {
    if (!held) {
      held = true;
      // Read here: a response body cannot leave the request context it was made in.
      const res = await inner();
      innerRes = { status: res.status, body: await res.json() };
    }
    return original(statements);
  }) as D1Database['batch'];
  try {
    const res = await outer();
    return { inner: innerRes!, outer: { status: res.status, body: await res.json() } };
  } finally {
    db.batch = original;
  }
}

describe('a refused commit adds nothing to the library (spec §8, ruling T7/T8)', () => {
  it('no item, no version, no manifest, nothing under blobs/; the same session commits after an override', async () => {
    const org = 'org_00000000000000000c01';
    const h = devHeaders(HUMAN_2, org);
    const body = `refused here\n${SECRET}\n`;
    const sha = await sha256Hex(enc(body));
    const refused = await upload([{ path: 'src/config.ts', body }, { path: 'README.md', body: '# fine\n' }], { headers: h });
    expect(refused.status).toBe(422);

    const ws = await env.DB.prepare(`SELECT id FROM workspaces WHERE external_id = ?`).bind(org).first<{ id: string }>();
    const items = await env.DB.prepare(`SELECT COUNT(*) AS n FROM items WHERE workspace_id = ?`).bind(ws!.id).first<{ n: number }>();
    expect(items?.n).toBe(0);
    const versions = await env.DB.prepare(`SELECT COUNT(*) AS n FROM version_files WHERE sha256 = ?`).bind(sha).first<{ n: number }>();
    expect(versions?.n).toBe(0);
    expect(await env.BLOBS.head(`blobs/${sha}`)).toBeNull();
    const created = await env.DB.prepare(`SELECT COUNT(*) AS n FROM audit_events WHERE workspace_id = ? AND action IN ('item.created', 'version.created')`).bind(ws!.id).first<{ n: number }>();
    expect(created?.n).toBe(0);
    // Still waiting, privately, for an override: no re-upload needed.
    expect(await env.BLOBS.head(`quarantine/${refused.uploadId}/${sha}`)).not.toBeNull();

    expect((await post(`${refused.uploadId}/override`, { reason: 'fixture' }, h)).status).toBe(200);
    const ok = await post(`${refused.uploadId}/commit`, undefined, h);
    expect(ok.status).toBe(201);
    const result = await ok.json<{ itemId: string }>();
    // Moved out of quarantine into the library, and only now in a manifest.
    expect(await (await env.BLOBS.get(`blobs/${sha}`))?.text()).toBe(body);
    expect((await env.BLOBS.list({ prefix: `quarantine/${refused.uploadId}/` })).objects).toHaveLength(0);
    const manifest = await (await env.BLOBS.get(`manifests/${result.itemId}/1.json`))!.json<{ entry: string; files: Record<string, { sha256: string }> }>();
    expect(manifest.entry).toBe('README.md');
    expect(manifest.files['src/config.ts']!.sha256).toBe(sha);
  });

  it('an override covers only the findings it saw: a new hit after it needs a new override', async () => {
    const other = 'const k = "' + 'gh' + 'p_' + 'Qw3eR5tY7uI9oP1a'.repeat(3) + '";\n';
    const files = [{ path: 'a.ts', body: SECRET }, { path: 'b.ts', body: other }];
    const declared = await Promise.all(files.map(async (f) => ({ path: f.path, bytes: enc(f.body).length, sha256: await sha256Hex(enc(f.body)) })));
    const { uploadId } = await (await post('', { title: 't', files: declared })).json<{ uploadId: string }>();
    const send = (f: { path: string; body: string }) => SELF.fetch(`${API}/api/v1/uploads/${uploadId}/files?path=${f.path}`, { method: 'PUT', headers: devHeaders(), body: f.body });
    await send(files[0]!);
    expect((await post(`${uploadId}/override`, { reason: 'the first one is a fixture' })).status).toBe(200);
    await send(files[1]!);
    const res = await post(`${uploadId}/commit`);
    expect(res.status).toBe(422);
    expect((await res.json<{ findings: unknown[] }>()).findings).toHaveLength(2);
  });

  it('an override on a committed upload is refused', async () => {
    // Its findings are still on record, so only the state check can refuse it.
    const r = await upload([{ path: 'late.ts', body: `late\n${SECRET}` }], { override: 'fixture' });
    expect(r.status).toBe(201);
    const late = await post(`${r.uploadId}/override`, { reason: 'late' });
    expect(late.status).toBe(409);
    expect(await late.json()).toEqual({ error: 'already_committed' });
  });
});

describe('the entry of a folder', () => {
  it('is the shallowest index.html, then the shallowest README.md, then the first path (ruling T8)', async () => {
    const f = (path: string) => ({ path, bytes: 1, sha256: 'f'.repeat(64) });
    const entry = async (paths: string[]) => (await (await post('', { title: 't', files: paths.map(f) })).json<{ entry: string }>()).entry;
    expect(await entry(['site/app.js', 'site/index.html'])).toBe('site/index.html');
    expect(await entry(['a/b/index.html', 'z/index.html', 'README.md'])).toBe('z/index.html');
    expect(await entry(['a/b/README.md', 'docs/README.md', 'a/x.txt'])).toBe('docs/README.md');
    expect(await entry(['b/c.txt', 'a/d.txt'])).toBe('a/d.txt');
  });
});

describe('commit re-checks the quota (ruling T8)', () => {
  it('counts what is committed plus this upload, so the first of two open uploads lands and the second is refused', async () => {
    const org = 'org_00000000000000000c02';
    const h = devHeaders(HUMAN_2, org);
    await SELF.fetch(`${API}/api/v1/me`, { headers: h });
    await env.DB.prepare(`UPDATE workspaces SET quota_bytes = 20 WHERE external_id = ?`).bind(org).run();
    const a = await upload([{ path: 'a.bin', body: 'aaaaaa' }], { headers: h, commit: false });
    const b = await upload([{ path: 'b.bin', body: 'bbbbbb' }], { headers: h, commit: false });
    await env.DB.prepare(`UPDATE workspaces SET quota_bytes = 10 WHERE external_id = ?`).bind(org).run();
    expect((await post(`${a.uploadId}/commit`, undefined, h)).status).toBe(201);
    const refused = await post(`${b.uploadId}/commit`, undefined, h);
    expect(refused.status).toBe(413);
    expect(await refused.json()).toEqual({ error: 'quota_exceeded', limit: 10, used: 6 });
  });
});

describe('commit against an item', () => {
  it('a new version that sets expiresAt sets the item expiry, and every version manifest carries it', async () => {
    const r = await upload([{ path: 'a.txt', body: 'v1 without expiry' }]);
    const at = new Date(Date.now() + 86_400_000).toISOString();
    const v2 = await upload([{ path: 'a.txt', body: 'v2 with expiry' }], { item: r.body.itemId, expiresAt: at });
    expect(v2.status).toBe(201);
    expect(await env.DB.prepare(`SELECT expires_at FROM items WHERE id = ?`).bind(r.body.itemId).first()).toEqual({ expires_at: at });
    for (const v of [1, 2]) {
      const m = await (await env.BLOBS.get(`manifests/${r.body.itemId}/${v}.json`))!.json<{ expiresAt: string | null }>();
      expect(m.expiresAt).toBe(at);
    }
    // A later version without expiresAt leaves it as it is.
    await upload([{ path: 'a.txt', body: 'v3 no expiry given' }], { item: r.body.itemId });
    expect(await env.DB.prepare(`SELECT expires_at FROM items WHERE id = ?`).bind(r.body.itemId).first()).toEqual({ expires_at: at });
  });

  it('a revoked item takes no new version', async () => {
    const r = await upload([{ path: 'a.txt', body: 'v1 of revoked' }]);
    const next = await upload([{ path: 'a.txt', body: 'v2 of revoked' }], { item: r.body.itemId, commit: false });
    await env.DB.prepare(`UPDATE items SET revoked_at = datetime('now') WHERE id = ?`).bind(r.body.itemId).run();
    const res = await post(`${next.uploadId}/commit`);
    expect(res.status).toBe(410);
    expect(await env.DB.prepare(`SELECT COUNT(*) AS n FROM versions WHERE item_id = ?`).bind(r.body.itemId).first<{ n: number }>()).toEqual({ n: 1 });
  });

  it('two uploads racing to the same next version: one lands, the other is told version_conflict and writes nothing', async () => {
    const r = await upload([{ path: 'a.txt', body: 'base' }]);
    const x = await upload([{ path: 'a.txt', body: 'x' }], { item: r.body.itemId, commit: false });
    const y = await upload([{ path: 'a.txt', body: 'y' }], { item: r.body.itemId, commit: false });
    const rival = await whileFirstBatchWaits(() => post(`${y.uploadId}/commit`), () => post(`${x.uploadId}/commit`));
    expect(rival.inner.status).toBe(201);
    expect(rival.outer.status).toBe(409);
    expect(rival.outer.body).toEqual({ error: 'version_conflict' });
    const versions = await env.DB.prepare(`SELECT version FROM versions WHERE item_id = ? ORDER BY version`).bind(r.body.itemId).all<{ version: number }>();
    expect(versions.results.map((v) => v.version)).toEqual([1, 2]);
    // The loser is still open and can simply retry, as version 3.
    expect((await post(`${x.uploadId}/commit`)).status).toBe(201);
  });

  it('the same upload committed twice at once makes one item, and both answer its result', async () => {
    const r = await upload([{ path: 'a.txt', body: 'once only' }], { commit: false });
    const twice = await whileFirstBatchWaits(() => post(`${r.uploadId}/commit`), () => post(`${r.uploadId}/commit`));
    expect([twice.inner.status, twice.outer.status]).toEqual([201, 200]);
    expect(twice.outer.body).toEqual(twice.inner.body);
    const sha = await sha256Hex(enc('once only'));
    expect(await env.DB.prepare(`SELECT COUNT(DISTINCT item_id) AS n FROM version_files WHERE sha256 = ?`).bind(sha).first<{ n: number }>()).toEqual({ n: 1 });
  });

  it('a retried commit never brings back the manifest of a revoked item', async () => {
    const r = await upload([{ path: 'a.txt', body: 'revoked then retried' }]);
    await env.DB.prepare(`UPDATE items SET revoked_at = datetime('now') WHERE id = ?`).bind(r.body.itemId).run();
    await env.BLOBS.delete(`manifests/${r.body.itemId}/1.json`);
    expect((await post(`${r.uploadId}/commit`)).status).toBe(200);
    expect(await env.BLOBS.head(`manifests/${r.body.itemId}/1.json`)).toBeNull();
  });

  it('a committed upload never changes state or result again', async () => {
    const r = await upload([{ path: 'a.txt', body: 'settled' }]);
    await expect(env.DB.prepare(`UPDATE upload_sessions SET state = 'committed', result_version = 9 WHERE id = ?`).bind(r.uploadId).run()).rejects.toThrow(/already committed/);
  });
});
