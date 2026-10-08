import { SELF, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { LIMITS } from '@superlibrary/contract';
import { API, sha256Hex, upload } from './helpers/upload';
import { HUMAN_2, devHeaders } from './helpers/org-plane';

const declare = (files: unknown[], extra: Record<string, unknown> = {}, headers = devHeaders()) =>
  SELF.fetch(`${API}/api/v1/uploads`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ title: 't', files, ...extra }) });
const file = (path: string, bytes = 1) => ({ path, bytes, sha256: 'a'.repeat(64) });

describe('declaring an upload', () => {
  it('refuses a path outside the root or on the denylist, naming it', async () => {
    const res = await declare([file('ok.md'), file('../secrets.txt')]);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'path_refused', path: '../secrets.txt', reason: 'parent' });
    const env_ = await declare([file('app/.env')]);
    expect(await env_.json()).toEqual({ error: 'path_refused', path: 'app/.env', reason: 'denied', rule: '.env*' });
  });

  it('refuses two paths that normalise to one', async () => {
    expect((await declare([file('a.md'), file('./a.md')])).status).toBe(400);
  });

  it('caps a file at 25 MB, a folder at 100 MB and 500 files', async () => {
    const big = await declare([file('big.bin', LIMITS.fileBytes + 1)]);
    expect(big.status).toBe(413);
    expect(await big.json()).toEqual({ error: 'file_too_large', path: 'big.bin', limit: LIMITS.fileBytes });
    const exactly = await declare([file('ok.bin', LIMITS.fileBytes)]);
    expect(exactly.status).toBe(201);
    const folder = await declare(Array.from({ length: 5 }, (_, i) => file(`f${i}.bin`, LIMITS.fileBytes)));
    expect(await folder.json()).toEqual({ error: 'folder_too_large', limit: LIMITS.folderBytes });
    const many = await declare(Array.from({ length: LIMITS.folderFiles + 1 }, (_, i) => file(`f${i}.txt`)));
    expect(await many.json()).toEqual({ error: 'too_many_files', limit: LIMITS.folderFiles });
  });

  it('refuses an upload past the workspace quota', async () => {
    const org = 'org_00000000000000000e05';
    const h = devHeaders(HUMAN_2, org);
    await SELF.fetch(`${API}/api/v1/me`, { headers: h });
    await env.DB.prepare(`UPDATE workspaces SET quota_bytes = 10 WHERE external_id = ?`).bind(org).run();
    const res = await declare([{ path: 'a.bin', bytes: 11, sha256: 'b'.repeat(64) }], {}, h);
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ error: 'quota_exceeded', limit: 10 });
  });

  it('picks the entry: index.html, then README.md, then the first path; refuses an unknown one', async () => {
    const one = await (await declare([file('b.txt'), file('README.md'), file('index.html')])).json<{ entry: string }>();
    expect(one.entry).toBe('index.html');
    const two = await (await declare([file('b.txt'), file('README.md')])).json<{ entry: string }>();
    expect(two.entry).toBe('README.md');
    const three = await (await declare([file('z.txt'), file('a.txt')])).json<{ entry: string }>();
    expect(three.entry).toBe('a.txt');
    expect((await declare([file('a.txt')], { entry: 'nope.txt' })).status).toBe(400);
  });
});

describe('sending a file', () => {
  it('checks size and SHA-256 against the declaration, sniffs, and stores the bytes once by hash', async () => {
    const body = '# Hello\n';
    const r = await upload([{ path: 'notes.png', body }], { commit: false });
    expect(r.status).toBe(200);
    expect(r.body.puts[0]).toEqual({ path: 'notes.png', mediaType: 'text/plain; charset=utf-8', view: 'text', findings: [] });
    const sha = await sha256Hex(new TextEncoder().encode(body));
    expect(await (await env.BLOBS.get(`blobs/${sha}`))?.text()).toBe(body);
  });

  it('refuses bytes that do not match what was declared', async () => {
    const res = await declare([{ path: 'a.txt', bytes: 3, sha256: 'c'.repeat(64) }]);
    const { uploadId } = await res.json<{ uploadId: string }>();
    const wrongSize = await SELF.fetch(`${API}/api/v1/uploads/${uploadId}/files?path=a.txt`, { method: 'PUT', headers: devHeaders(), body: 'abcd' });
    expect(await wrongSize.json()).toEqual({ error: 'size_mismatch', path: 'a.txt' });
    const wrongHash = await SELF.fetch(`${API}/api/v1/uploads/${uploadId}/files?path=a.txt`, { method: 'PUT', headers: devHeaders(), body: 'abc' });
    expect(await wrongHash.json()).toEqual({ error: 'sha256_mismatch', path: 'a.txt' });
    const undeclared = await SELF.fetch(`${API}/api/v1/uploads/${uploadId}/files?path=b.txt`, { method: 'PUT', headers: devHeaders(), body: 'abc' });
    expect(undeclared.status).toBe(404);
  });

  it('counts the bytes that arrive, not only the announced length', async () => {
    // A streamed body carries no Content-Length, so only the count of what arrived can refuse it.
    const { uploadId } = await (await declare([{ path: 'a.txt', bytes: 3, sha256: 'c'.repeat(64) }])).json<{ uploadId: string }>();
    const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('abcd')); c.close(); } });
    const res = await SELF.fetch(`${API}/api/v1/uploads/${uploadId}/files?path=a.txt`, { method: 'PUT', headers: devHeaders(), body: stream, duplex: 'half' } as RequestInit);
    expect(await res.json()).toEqual({ error: 'size_mismatch', path: 'a.txt' });
  });

  it('reports secret findings by line and rule', async () => {
    const r = await upload([{ path: 'config.ts', body: 'const a = 1;\nconst t = "' + 'gh' + 'p_' + 'aB3xQ9zK7mP2wR5t'.repeat(3) + '";\n' }], { commit: false });
    expect(r.body.puts[0].findings).toEqual([{ line: 2, rule: 'github-token' }]);
  });

  it('only the person who declared it may send to it', async () => {
    const { uploadId } = await (await declare([file('a.txt', 3)])).json<{ uploadId: string }>();
    const other = await SELF.fetch(`${API}/api/v1/uploads/${uploadId}/files?path=a.txt`, { method: 'PUT', headers: devHeaders(HUMAN_2), body: 'abc' });
    expect(other.status).toBe(404);
  });
});

const put = (uploadId: string, rawQuery: string, body: string) =>
  SELF.fetch(`${API}/api/v1/uploads/${uploadId}/files?path=${rawQuery}`, { method: 'PUT', headers: devHeaders(), body });
const declared = async (path: string, body: string, extra: Record<string, unknown> = {}) => {
  const res = await declare([{ path, bytes: new TextEncoder().encode(body).length, sha256: await sha256Hex(new TextEncoder().encode(body)) }], extra);
  return (await res.json<{ uploadId: string }>()).uploadId;
};

describe('paths are keyed on their normalised form, decoded once', () => {
  it('names the normalised path a duplicate collides on', async () => {
    expect(await (await declare([file('docs/a.md'), file('docs//./a.md')])).json()).toEqual({ error: 'duplicate_path', path: 'docs/a.md' });
  });

  it('a file sent under another spelling of its declared path lands on the declared path', async () => {
    const id = await declared('docs/a.txt', 'abc');
    const res = await put(id, encodeURIComponent('./docs//a.txt'), 'abc');
    expect(res.status).toBe(200);
    expect((await res.json<{ path: string }>()).path).toBe('docs/a.txt');
    const row = await env.DB.prepare(`SELECT received FROM upload_files WHERE session_id = ? AND path = 'docs/a.txt'`).bind(id).first<{ received: number }>();
    expect(row?.received).toBe(1);
  });

  it('?path= is decoded exactly once', async () => {
    // Declared literally as "a%41.txt". Decoding twice would look for "aA.txt" and miss it.
    const id = await declared('a%41.txt', 'abc');
    const res = await put(id, encodeURIComponent('a%41.txt'), 'abc');
    expect(res.status).toBe(200);
    expect((await res.json<{ path: string }>()).path).toBe('a%41.txt');
  });

  it('refuses a sent path that breaks the path rules, naming it', async () => {
    const id = await declared('a.txt', 'abc');
    const res = await put(id, encodeURIComponent('../a.txt'), 'abc');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'path_refused', path: '../a.txt', reason: 'parent' });
  });
});

describe('the item expiry an upload carries', () => {
  it('is normalised to one ISO form', async () => {
    const id = await declared('a.txt', 'abc', { expiresAt: '2099-01-01T00:00:00Z' });
    const row = await env.DB.prepare(`SELECT item_expires_at FROM upload_sessions WHERE id = ?`).bind(id).first<{ item_expires_at: string }>();
    expect(row?.item_expires_at).toBe('2099-01-01T00:00:00.000Z');
  });

  it('refuses one in the past', async () => {
    const res = await declare([file('a.txt')], { expiresAt: new Date(Date.now() - 1000).toISOString() });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid', detail: 'expiresAt must be in the future' });
  });
});

describe('an expired session', () => {
  it('answers 410 upload_expired', async () => {
    const id = await declared('a.txt', 'abc');
    await env.DB.prepare(`UPDATE upload_sessions SET expires_at = ? WHERE id = ?`).bind(new Date(Date.now() - 1000).toISOString(), id).run();
    const res = await put(id, 'a.txt', 'abc');
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: 'upload_expired' });
  });
});

describe('a file whose secret scan hits is quarantined, never stored in the library', () => {
  const SECRET = 'const t = "' + 'gh' + 'p_' + 'zY8wQ1nM4kR7tP0s'.repeat(3) + '";\n';

  it('goes to quarantine/<uploadId>/<sha256>, not blobs/, and the session records it', async () => {
    const enc = new TextEncoder();
    const r = await upload([{ path: 'leak.ts', body: SECRET }, { path: 'clean.txt', body: 'nothing here' }], { commit: false });
    expect(r.status).toBe(200);
    const sha = await sha256Hex(enc.encode(SECRET));
    expect(await env.BLOBS.head(`blobs/${sha}`)).toBeNull();
    expect(await (await env.BLOBS.get(`quarantine/${r.uploadId}/${sha}`))?.text()).toBe(SECRET);
    const cleanSha = await sha256Hex(enc.encode('nothing here'));
    expect(await env.BLOBS.head(`blobs/${cleanSha}`)).not.toBeNull();
    expect(await env.BLOBS.head(`quarantine/${r.uploadId}/${cleanSha}`)).toBeNull();
    const rows = await env.DB.prepare(`SELECT path, quarantined FROM upload_files WHERE session_id = ? ORDER BY path`).bind(r.uploadId).all<{ path: string; quarantined: number }>();
    expect(rows.results).toEqual([{ path: 'clean.txt', quarantined: 0 }, { path: 'leak.ts', quarantined: 1 }]);
    const findings = await env.DB.prepare(`SELECT path, line, rule FROM secret_findings WHERE session_id = ?`).bind(r.uploadId).all();
    expect(findings.results).toEqual([{ path: 'leak.ts', line: 1, rule: 'github-token' }]);
  });
});

describe('names people actually use', () => {
  it.each(['my notes.md', 'a#b.txt', 'what?.txt', '100%.txt', 'a+b.txt', 'résumé/日本.md'])('%s uploads under its own name', async (path) => {
    const r = await upload([{ path, body: `body of ${path}` }], { commit: false });
    expect(r.status).toBe(200);
    expect(r.body.puts[0].path).toBe(path);
    const row = await env.DB.prepare(`SELECT received FROM upload_files WHERE session_id = ? AND path = ?`).bind(r.uploadId, path).first<{ received: number }>();
    expect(row?.received).toBe(1);
  });
});

describe('the quota counts each distinct blob once', () => {
  it('the same bytes under two paths, or in a second session, cost their size once', async () => {
    const org = 'org_00000000000000000e06';
    const h = devHeaders(HUMAN_2, org);
    await SELF.fetch(`${API}/api/v1/me`, { headers: h });
    await env.DB.prepare(`UPDATE workspaces SET quota_bytes = 10 WHERE external_id = ?`).bind(org).run();
    const same = (path: string) => ({ path, bytes: 6, sha256: 'd'.repeat(64) });
    // 12 bytes declared, 6 distinct: within a quota of 10.
    expect((await declare([same('a.bin'), same('b.bin')], {}, h)).status).toBe(201);
    // A second open session with the same bytes adds nothing.
    expect((await declare([same('c.bin')], {}, h)).status).toBe(201);
    // 6 held + 5 new = 11: over.
    const over = await declare([{ path: 'd.bin', bytes: 5, sha256: 'e'.repeat(64) }], {}, h);
    expect(over.status).toBe(413);
    expect(await over.json()).toEqual({ error: 'quota_exceeded', limit: 10, used: 6 });
  });
});

describe('text that is not valid UTF-8 is still scanned (PR 2 review)', () => {
  // An AWS access key id, built from fragments so this file never holds one whole.
  const KEY = 'AK' + 'IA' + 'Q7X2' + 'M9P4' + 'R6T8' + 'W3Z5';
  const sendRaw = async (path: string, bytes: Uint8Array) => {
    const sha = await sha256Hex(bytes);
    const created = await SELF.fetch(`${API}/api/v1/uploads`, { method: 'POST', headers: { ...devHeaders(), 'content-type': 'application/json' }, body: JSON.stringify({ title: 'raw', files: [{ path, bytes: bytes.length, sha256: sha }] }) });
    const { uploadId } = await created.json<{ uploadId: string }>();
    const put = await SELF.fetch(`${API}/api/v1/uploads/${uploadId}/files?path=${path}`, { method: 'PUT', headers: devHeaders(), body: bytes });
    return { uploadId, sha, put: await put.json<{ mediaType: string; findings: Array<{ line: number; rule: string }> }>() };
  };
  const latin1 = (s: string) => Uint8Array.from([...s].map((c) => c.charCodeAt(0)));

  it('Windows-1252 bytes with a key are quarantined', async () => {
    // 0x93/0x94 are cp1252 curly quotes and invalid UTF-8, so this sniffs as octet-stream.
    const bytes = latin1(`note \x93quoted\x94\nkey = ${KEY}\n`);
    const r = await sendRaw('notes.txt', bytes);
    expect(r.put.mediaType).toBe('application/octet-stream');
    expect(r.put.findings).toEqual([{ line: 2, rule: 'aws-access-key' }]);
    expect(await env.BLOBS.head(`quarantine/${r.uploadId}/${r.sha}`)).not.toBeNull();
    expect(await env.BLOBS.head(`blobs/${r.sha}`)).toBeNull();
  });

  it('BOM-less UTF-16LE with a key is quarantined', async () => {
    const text = `first line\nkey = ${KEY}\n`;
    const bytes = new Uint8Array(text.length * 2);
    [...text].forEach((c, i) => { bytes[i * 2] = c.charCodeAt(0); });
    const r = await sendRaw('notes16.txt', bytes);
    expect(r.put.mediaType).toBe('application/octet-stream');
    expect(r.put.findings).toEqual([{ line: 2, rule: 'aws-access-key' }]);
    expect(await env.BLOBS.head(`quarantine/${r.uploadId}/${r.sha}`)).not.toBeNull();
  });

  it('a recognised binary (a PNG) is not scanned, whatever bytes follow its header', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...latin1(`\nkey = ${KEY}\n`)]);
    const r = await sendRaw('pic.png', png);
    expect(r.put.mediaType).toBe('image/png');
    expect(r.put.findings).toEqual([]);
    expect(await env.BLOBS.head(`blobs/${r.sha}`)).not.toBeNull();
  });
});
