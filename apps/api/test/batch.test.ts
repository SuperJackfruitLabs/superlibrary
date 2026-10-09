import { SELF, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { LIMITS } from '@superlibrary/contract';
import { API, sha256Hex, upload } from './helpers/upload';
import { HUMAN_2, devHeaders } from './helpers/org-plane';

const enc = new TextEncoder();
const SECRET = 'const t = "' + 'gh' + 'p_' + 'qW3eR5tY7uI9oP1a'.repeat(3) + '";\n';

/** `Server-Timing` names what one request cost: D1 statements, D1 round trips, R2 operations. */
function cost(res: Response): { d1q: number; d1rt: number; r2: number } {
  const header = res.headers.get('server-timing') ?? '';
  const read = (name: string) => {
    const m = new RegExp(`${name};desc="?(\\d+)"?`).exec(header);
    if (!m) throw new Error(`no ${name} in Server-Timing: ${header}`);
    return Number(m[1]);
  };
  return { d1q: read('d1q'), d1rt: read('d1rt'), r2: read('r2') };
}

type Local = { path: string; body: Uint8Array };
const local = (path: string, body: string): Local => ({ path, body: enc.encode(body) });

async function create(files: Local[], headers = devHeaders(), extra: Record<string, unknown> = {}) {
  const declared = await Promise.all(files.map(async (f) => ({ path: f.path, bytes: f.body.length, sha256: await sha256Hex(f.body) })));
  const res = await SELF.fetch(`${API}/api/v1/uploads`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ title: 'batch', files: declared, ...extra }) });
  return res;
}

/** One multipart request: a `manifest` part naming every entry, then a `file` part per entry that carries bytes. */
function batch(uploadId: string, entries: Array<Local | { path: string; held: true }>, headers = devHeaders()) {
  const form = new FormData();
  form.append('manifest', JSON.stringify({ files: entries.map((e) => ('held' in e ? { path: e.path, held: true } : { path: e.path })) }));
  for (const e of entries) if (!('held' in e)) form.append('file', new Blob([e.body]), 'f');
  return SELF.fetch(`${API}/api/v1/uploads/${uploadId}/batch`, { method: 'POST', headers, body: form });
}

const commit = (uploadId: string, headers = devHeaders()) => SELF.fetch(`${API}/api/v1/uploads/${uploadId}/commit`, { method: 'POST', headers });

describe('a 500-file folder', () => {
  it('commits in a bounded number of requests and D1 statements (D1 caps statements per invocation)', async () => {
    const files = Array.from({ length: LIMITS.folderFiles }, (_, i) => local(`site/page-${String(i).padStart(3, '0')}.txt`, `page ${i} of a big folder\n`));
    let requests = 0;
    let statements = 0;
    const created = await create(files);
    requests++;
    expect(created.status).toBe(201);
    expect(cost(created).d1q).toBeLessThanOrEqual(12);
    statements += cost(created).d1q;
    const { uploadId } = await created.json<{ uploadId: string }>();

    for (let i = 0; i < files.length; i += LIMITS.batchFiles) {
      const res = await batch(uploadId, files.slice(i, i + LIMITS.batchFiles));
      requests++;
      expect(res.status).toBe(200);
      const c = cost(res);
      // Independent of how many files the batch carries: no statement per file.
      expect(c.d1q).toBeLessThanOrEqual(10);
      expect(c.d1rt).toBeLessThanOrEqual(5);
      statements += c.d1q;
    }
    const done = await commit(uploadId);
    requests++;
    expect(done.status).toBe(201);
    const c = cost(done);
    expect(c.d1q).toBeLessThanOrEqual(25);
    expect(c.d1rt).toBeLessThanOrEqual(15);
    statements += c.d1q;

    expect(requests).toBe(2 + LIMITS.folderFiles / LIMITS.batchFiles);
    expect(statements).toBeLessThan(150);
    const body = await done.json<{ itemId: string }>();
    const n = await env.DB.prepare(`SELECT COUNT(*) AS n FROM version_files WHERE item_id = ?`).bind(body.itemId).first<{ n: number }>();
    expect(n?.n).toBe(LIMITS.folderFiles);
    const manifest = await (await env.BLOBS.get(`manifests/${body.itemId}/1.json`))!.json<{ files: Record<string, unknown> }>();
    expect(Object.keys(manifest.files)).toHaveLength(LIMITS.folderFiles);
    const left = await env.DB.prepare(`SELECT COUNT(*) AS n FROM upload_files WHERE session_id = ?`).bind(uploadId).first<{ n: number }>();
    expect(left?.n).toBe(0);
  });
});

describe('sending files in a batch', () => {
  it('applies every check a single PUT does: sniff, scan into quarantine, sha256, declared paths, path rules', async () => {
    const files = [local('readme.md', '# hi\n'), local('leak.ts', SECRET)];
    const { uploadId } = await (await create(files)).json<{ uploadId: string }>();
    const res = await batch(uploadId, files);
    expect(res.status).toBe(200);
    const out = await res.json<{ files: Array<{ path: string; mediaType: string; view: string; findings: unknown[] }> }>();
    expect(out.files).toEqual([
      { path: 'readme.md', mediaType: 'text/markdown; charset=utf-8', view: 'markdown', findings: [] },
      { path: 'leak.ts', mediaType: expect.any(String), view: expect.any(String), findings: [{ line: 1, rule: 'github-token' }] },
    ]);
    const leakSha = await sha256Hex(files[1]!.body);
    expect(await env.BLOBS.head(`blobs/${leakSha}`)).toBeNull();
    expect(await env.BLOBS.head(`quarantine/${uploadId}/${leakSha}`)).not.toBeNull();
    const refused = await commit(uploadId);
    expect(refused.status).toBe(422);

    const other = [local('a.txt', 'aaa')];
    const s2 = (await (await create(other)).json<{ uploadId: string }>()).uploadId;
    const wrong = await batch(s2, [local('a.txt', 'bbb')]);
    expect(wrong.status).toBe(400);
    expect(await wrong.json()).toEqual({ error: 'sha256_mismatch', path: 'a.txt' });
    const undeclared = await batch(s2, [local('b.txt', 'aaa')]);
    expect(await undeclared.json()).toEqual({ error: 'not_declared', path: 'b.txt' });
    const outside = await batch(s2, [local('../a.txt', 'aaa')]);
    expect(await outside.json()).toEqual({ error: 'path_refused', path: '../a.txt', reason: 'parent' });
    // A refused batch records nothing.
    const row = await env.DB.prepare(`SELECT received FROM upload_files WHERE session_id = ?`).bind(s2).first<{ received: number }>();
    expect(row?.received).toBe(0);
  });

  it('refuses more files than LIMITS.batchFiles, or a body past LIMITS.batchBytes', async () => {
    const files = Array.from({ length: LIMITS.batchFiles + 1 }, (_, i) => local(`f${i}.txt`, `f${i}`));
    const { uploadId } = await (await create(files)).json<{ uploadId: string }>();
    const many = await batch(uploadId, files);
    expect(many.status).toBe(413);
    expect(await many.json()).toEqual({ error: 'batch_too_large', limit: LIMITS.batchFiles });
    const big = new Uint8Array(LIMITS.batchBytes + 1024 * 1024).fill(0x61);
    const s2 = (await (await create([{ path: 'big.txt', body: big }])).json<{ uploadId: string }>()).uploadId;
    const heavy = await batch(s2, [{ path: 'big.txt', body: big }]);
    expect(heavy.status).toBe(413);
  });

  it('renews the session while files arrive, never past its bounded lifetime', async () => {
    const files = [local('a.txt', 'renew me'), local('b.txt', 'and me')];
    const { uploadId } = await (await create(files)).json<{ uploadId: string }>();
    const soon = new Date(Date.now() + 60_000).toISOString();
    await env.DB.prepare(`UPDATE upload_sessions SET expires_at = ? WHERE id = ?`).bind(soon, uploadId).run();
    expect((await batch(uploadId, [files[0]!])).status).toBe(200);
    const s = await env.DB.prepare(`SELECT expires_at, created_at FROM upload_sessions WHERE id = ?`).bind(uploadId).first<{ expires_at: string; created_at: string }>();
    expect(Date.parse(s!.expires_at)).toBeGreaterThan(Date.now() + (LIMITS.uploadTtlHours * 3600_000) - 60_000);

    // A session already at its lifetime cap is not renewed further.
    const created = Date.now() - LIMITS.uploadMaxHours * 3600_000 + 120_000;
    await env.DB.prepare(`UPDATE upload_sessions SET created_at = ?, expires_at = ? WHERE id = ?`).bind(new Date(created).toISOString().replace('T', ' ').slice(0, 19), soon, uploadId).run();
    expect((await batch(uploadId, [files[1]!])).status).toBe(200);
    const capped = await env.DB.prepare(`SELECT expires_at FROM upload_sessions WHERE id = ?`).bind(uploadId).first<{ expires_at: string }>();
    expect(Date.parse(capped!.expires_at)).toBeLessThanOrEqual(created + LIMITS.uploadMaxHours * 3600_000 + 1000);
  });
});

describe('resuming: bytes this person already sent are not sent again', () => {
  it('create names the held paths; a held entry is received from storage, re-sniffed and committed', async () => {
    const files = [local('index.html', '<!doctype html><p>held</p>'), local('new.txt', `fresh ${Date.now()}`)];
    const first = await upload([{ path: 'index.html', body: files[0]!.body }]);
    expect(first.status).toBe(201);

    const created = await create(files);
    const { uploadId, held } = await created.json<{ uploadId: string; held: string[] }>();
    expect(held).toEqual(['index.html']);
    const res = await batch(uploadId, [{ path: 'index.html', held: true }, files[1]!]);
    expect(res.status).toBe(200);
    const out = await res.json<{ files: Array<{ path: string; mediaType?: string; missing?: boolean }> }>();
    expect(out.files[0]).toMatchObject({ path: 'index.html', mediaType: 'text/html; charset=utf-8' });
    const done = await commit(uploadId);
    expect(done.status).toBe(201);
    expect(await done.json()).toMatchObject({ mediaType: 'text/html; charset=utf-8' });
  });

  it('bytes received in an earlier unfinished session of the same person count as held', async () => {
    const files = [local('a.txt', `abandoned ${Date.now()}`)];
    const s1 = (await (await create(files)).json<{ uploadId: string }>()).uploadId;
    expect((await batch(s1, files)).status).toBe(200);
    const again = await (await create(files)).json<{ held: string[] }>();
    expect(again.held).toEqual(['a.txt']);
  });

  it('another person cannot claim bytes by their hash alone', async () => {
    const files = [local('mine.txt', `private bytes ${Date.now()}`)];
    expect((await upload([{ path: 'mine.txt', body: files[0]!.body }])).status).toBe(201);
    const theirs = await create(files, devHeaders(HUMAN_2));
    const { uploadId, held } = await theirs.json<{ uploadId: string; held: string[] }>();
    expect(held).toEqual([]);
    const res = await batch(uploadId, [{ path: 'mine.txt', held: true }], devHeaders(HUMAN_2));
    expect(res.status).toBe(200);
    expect((await res.json<{ files: unknown[] }>()).files).toEqual([{ path: 'mine.txt', missing: true }]);
    const row = await env.DB.prepare(`SELECT received FROM upload_files WHERE session_id = ?`).bind(uploadId).first<{ received: number }>();
    expect(row?.received).toBe(0);
  });

  it('held bytes are scanned again: an earlier override does not carry over', async () => {
    const files = [local('cfg.ts', SECRET)];
    expect((await upload([{ path: 'cfg.ts', body: files[0]!.body }], { override: 'fixture' })).status).toBe(201);
    const { uploadId, held } = await (await create(files)).json<{ uploadId: string; held: string[] }>();
    expect(held).toEqual(['cfg.ts']);
    const res = await batch(uploadId, [{ path: 'cfg.ts', held: true }]);
    expect((await res.json<{ files: Array<{ findings: unknown[] }> }>()).files[0]!.findings).toEqual([{ line: 1, rule: 'github-token' }]);
    expect((await commit(uploadId)).status).toBe(422);
  });
});
