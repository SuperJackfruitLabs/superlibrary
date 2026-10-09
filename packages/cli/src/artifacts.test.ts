import { mkdirSync, mkdtempSync, symlinkSync, truncateSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { LIMITS, describeRefusal, pathRefusalSentence, sizeRefusal } from '@superlibrary/contract';
import { getItem, makeClient, revoke, upload, uploadWith, walk } from './artifacts.ts';
import { tokenSource } from './credential.ts';

const tmp = () => mkdtempSync(join(tmpdir(), 'suli-up-'));

describe('walk', () => {
  it('reads a folder as relative paths; a single file as its name', () => {
    const d = tmp();
    mkdirSync(join(d, 'img'));
    writeFileSync(join(d, 'index.html'), '<!doctype html>');
    writeFileSync(join(d, 'img', 'a b.png'), 'x');
    expect(walk(d).map((f) => f.path).sort()).toEqual(['img/a b.png', 'index.html']);
    expect(walk(join(d, 'index.html')).map((f) => f.path)).toEqual(['index.html']);
  });
  it('follows a symlink inside the folder and refuses one that leaves it (spec §8)', () => {
    const d = tmp();
    writeFileSync(join(d, 'real.md'), '# r');
    symlinkSync(join(d, 'real.md'), join(d, 'alias.md'));
    expect(walk(d).map((f) => f.path).sort()).toEqual(['alias.md', 'real.md']);
    symlinkSync('/etc/hosts', join(d, 'escape'));
    expect(() => walk(d)).toThrow('escape points outside the folder; it is not uploaded.');
  });
  it('refuses a denylisted path before sending anything', () => {
    const d = tmp();
    writeFileSync(join(d, '.env'), 'A=1');
    expect(() => walk(d)).toThrow(pathRefusalSentence({ path: '.env', reason: 'denied', rule: '.env*' }));
    expect(() => walk(d)).toThrow('.env is not uploaded: it matches the .env* rule.');
  });
  it('refuses a file over the file cap, a folder over the byte cap and one with too many files, from sizes alone', () => {
    const one = tmp();
    writeFileSync(join(one, 'big.bin'), '');
    truncateSync(join(one, 'big.bin'), LIMITS.fileBytes + 1);
    expect(() => walk(one)).toThrow(sizeRefusal.file('big.bin'));
    expect(sizeRefusal.file('big.bin')).toBe('big.bin is larger than 25 MB, the limit for one file.');

    const heavy = tmp();
    for (const n of ['a', 'b', 'c', 'd', 'e']) { writeFileSync(join(heavy, n), ''); truncateSync(join(heavy, n), LIMITS.fileBytes); }
    expect(() => walk(heavy)).toThrow(sizeRefusal.folder());

    const many = tmp();
    for (let i = 0; i <= LIMITS.folderFiles; i++) writeFileSync(join(many, `f${i}.txt`), 'x');
    expect(() => walk(many)).toThrow(sizeRefusal.files(LIMITS.folderFiles + 1));
  });
});

describe('uploadWith', () => {
  it('refuses a denied path before any request is made', async () => {
    const d = tmp();
    writeFileSync(join(d, 'id.pem'), 'x');
    const fetchImpl = vi.fn();
    await expect(uploadWith(makeClient('https://app.test', async () => 't', fetchImpl as never), d, {})).rejects.toThrow('id.pem is not uploaded: it matches the *.pem rule.');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  it('re-exchanges the device credential when the cached token expires mid-upload', async () => {
    let clock = 0;
    let n = 0;
    const exchange = vi.fn(async () => ({ token: `tok${++n}`, expiresIn: 300 }));
    const src = tokenSource({ env: {}, base: 'https://app.test', dir: tmp(), exchange, now: () => clock, device: { credential: 'dev_00000000000000000000:' + 'a'.repeat(43), plane: 'https://accounts.test', audience: 'https://app.test' } });
    const auth: string[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      auth.push(new Headers(init.headers).get('authorization')!);
      clock += 200_000; // each file takes 200 s on this link
      if (url.endsWith('/api/v1/uploads')) return ok({ uploadId: 'upl_0000000000000001' }, 201);
      if (url.includes('/files?')) return ok({ findings: [] });
      return ok({ itemId: 'itm_0000000000000001', version: 1, url: 'https://app.test/a/itm_0000000000000001', sha256: 'x', mediaType: 'text/plain', bytes: 2 }, 201);
    }) as never;
    const d = tmp();
    writeFileSync(join(d, 'a.txt'), 'a');
    writeFileSync(join(d, 'b.txt'), 'b');
    const result = await uploadWith(makeClient('https://app.test', () => src.token(), fetchImpl), d, { title: 'T' });
    expect(result.itemId).toBe('itm_0000000000000001');
    expect(auth).toEqual(['Bearer tok1', 'Bearer tok1', 'Bearer tok2', 'Bearer tok2']);
  });

  it('a secret finding stops the upload with file and line, unless --override is given', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push(`${init.method} ${new URL(url).pathname}`);
      if (url.endsWith('/api/v1/uploads')) return ok({ uploadId: 'upl_0000000000000002' }, 201);
      if (url.includes('/files?')) return ok({ findings: [{ line: 3, rule: 'github-token' }] });
      if (url.endsWith('/override')) return ok({ overridden: true });
      return calls.includes('POST /api/v1/uploads/upl_0000000000000002/override')
        ? ok({ itemId: 'itm_0000000000000002', version: 1 }, 201)
        : ok({ error: 'secret_found', findings: [{ path: 'c.ts', line: 3, rule: 'github-token' }] }, 422);
    }) as never;
    const d = tmp();
    writeFileSync(join(d, 'c.ts'), 'x');
    const client = makeClient('https://app.test', async () => 't', fetchImpl);
    await expect(uploadWith(client, d, { title: 'T' })).rejects.toThrow('c.ts line 3: github-token');
    await expect(uploadWith(client, d, { title: 'T', override: 'rotated already' })).resolves.toMatchObject({ itemId: 'itm_0000000000000002' });
  });
});


describe('a single file gets the same checks as a folder', () => {
  it('refuses a denied name and an oversized file before reading or sending anything', async () => {
    const d = tmp();
    writeFileSync(join(d, '.env'), 'A=1');
    expect(() => walk(join(d, '.env'))).toThrow('.env is not uploaded: it matches the .env* rule.');
    writeFileSync(join(d, 'big.bin'), '');
    truncateSync(join(d, 'big.bin'), LIMITS.fileBytes + 1);
    expect(() => walk(join(d, 'big.bin'))).toThrow(sizeRefusal.file('big.bin'));
    const fetchImpl = vi.fn();
    await expect(uploadWith(makeClient('https://app.test', async () => 't', fetchImpl as never), join(d, '.env'), {})).rejects.toThrow('.env is not uploaded');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

type Seen = { method: string; url: string; body: string };
function stack(handler: (s: Seen) => Response | undefined = () => undefined) {
  const seen: Seen[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    const s = { method: String(init.method), url, body: init.body instanceof Uint8Array ? '' : String(init.body ?? '') };
    seen.push(s);
    const custom = handler(s);
    if (custom) return custom;
    if (url.endsWith('/api/v1/uploads')) return Response.json({ uploadId: 'upl_0000000000000001' }, { status: 201 });
    if (url.includes('/files?')) return Response.json({});
    return Response.json({ itemId: 'itm_0000000000000001', version: 1, url: 'https://app.test/a/itm_0000000000000001' }, { status: 201 });
  }) as never;
  return { seen, impl, client: makeClient('https://app.test', async () => 't', impl) };
}

describe('uploadWith details', () => {
  it('encodes a path with #, ? and % and a non-ASCII letter into the PUT query', async () => {
    const d = tmp();
    const name = 'a#b?c%d é.txt';
    writeFileSync(join(d, name), 'x');
    const { seen, client } = stack();
    await uploadWith(client, d, { title: 'T' });
    const put = seen.find((s) => s.method === 'PUT')!;
    expect(put.url).toBe(`https://app.test/api/v1/uploads/upl_0000000000000001/files?path=${encodeURIComponent(name)}`);
    expect(new URL(put.url).searchParams.get('path')).toBe(name);
  });
  it('titles an upload of "." after the folder, not "."', async () => {
    const d = tmp();
    writeFileSync(join(d, 'a.txt'), 'x');
    const { seen, client } = stack();
    await uploadWith(client, d + '/.', {});
    expect(JSON.parse(seen[0]!.body).title).toBe(basename(d));
  });
  it('sends the override reason, and turns a server refusal into the shared sentence', async () => {
    const d = tmp();
    writeFileSync(join(d, 'a.txt'), 'x');
    let committed = 0;
    const { seen, client } = stack((s) => {
      if (s.url.endsWith('/commit')) return ++committed === 1 ? Response.json({ error: 'secret_found', findings: [{ path: 'a.txt', line: 1, rule: 'r' }] }, { status: 422 }) : undefined;
      return undefined;
    });
    await uploadWith(client, d, { override: 'rotated already' });
    expect(JSON.parse(seen.find((s) => s.url.endsWith('/override'))!.body)).toEqual({ reason: 'rotated already' });

    const { client: c2 } = stack((s) => (s.method === 'PUT' ? Response.json({ error: 'quota_exceeded' }, { status: 413 }) : undefined));
    await expect(uploadWith(c2, d, {})).rejects.toThrow(describeRefusal({ ok: false, status: 413, error: 'quota_exceeded' }));
  });
  it('rejects an --expires date that is not a real day, before any request', async () => {
    const d = tmp();
    writeFileSync(join(d, 'a.txt'), 'x');
    const { seen, client } = stack();
    for (const bad of ['2026-02-30', '2026-13-01', 'tomorrow']) await expect(uploadWith(client, d, { expires: bad })).rejects.toThrow('--expires takes a real date, YYYY-MM-DD');
    expect(seen).toEqual([]);
    await uploadWith(client, d, { expires: '2026-03-01' });
    expect(JSON.parse(seen[0]!.body).expiresAt).toBe('2026-03-01T00:00:00.000Z');
  });
  it('a refused sign-in says which credential was refused', async () => {
    const res = async () => new Response('', { status: 401 });
    await expect(makeClient('https://app.test', async () => 't', res as never, 'env')('GET', '/x')).rejects.toThrow('SUPERLIBRARY_TOKEN was refused');
    await expect(makeClient('https://app.test', async () => 't', res as never)('GET', '/x')).rejects.toThrow('Run suli login');
  });
});

describe('upload, get and revoke', () => {
  const ID = 'itm_0000000000000001';
  async function run(fn: () => Promise<void>, handler?: (s: Seen) => Response | undefined) {
    vi.stubEnv('SUPERLIBRARY_TOKEN', 'tok');
    vi.stubEnv('SUPERLIBRARY_URL', 'https://app.test');
    const st = stack(handler);
    vi.stubGlobal('fetch', st.impl);
    let out = '';
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(((c: string) => { out += c; return true; }) as never);
    try { await fn(); } finally { write.mockRestore(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); }
    return { seen: st.seen, out };
  }
  const item = { item: { title: 'T', scope: 'org', createdBy: 'p', createdAt: 'now' }, versions: [{ version: 1, fileCount: 1, sha256: 'a'.repeat(64), revokedAt: null }] };
  const grant = { url: 'https://v.test/x', expiresAt: 'soon', version: 2 };
  const answer = (s: Seen) => Response.json(s.url.endsWith('/embed') ? grant : item);

  it('--json prints the commit result as one JSON line', async () => {
    const d = tmp();
    writeFileSync(join(d, 'a.txt'), 'x');
    const { out } = await run(() => upload(join(d, 'a.txt'), { title: null, item: null, board: null, entry: null, expires: null, override: null, json: true }));
    expect(JSON.parse(out)).toMatchObject({ itemId: ID, version: 1 });
    expect(out.trim().split('\n')).toHaveLength(1);
  });
  it('get --embed --version sends that version and prints the version it minted', async () => {
    const { seen, out } = await run(() => getItem(ID, { embed: true, version: '2', json: false }), answer);
    expect(JSON.parse(seen[1]!.body)).toEqual({ version: 2 });
    expect(out).toContain('viewer of v2 (until soon): https://v.test/x');
  });
  it('whole-item revoke posts the reason; revoking a version takes no reason', async () => {
    const { seen } = await run(() => revoke(ID, { version: null, reason: 'mistake', json: false }), () => Response.json({}));
    expect(seen.map((s) => `${s.method} ${new URL(s.url).pathname} ${s.body}`)).toEqual([`POST /api/v1/items/${ID}/revoke {"reason":"mistake"}`]);
    const v = await run(() => revoke(ID, { version: '2', reason: null, json: false }), () => Response.json({}));
    expect(v.seen.map((s) => `${new URL(s.url).pathname} ${s.body}`)).toEqual([`/api/v1/items/${ID}/versions/2/revoke {}`]);
    const both = await run(() => expect(revoke(ID, { version: '2', reason: 'why', json: false })).rejects.toThrow('--reason is recorded only when the whole item is revoked'));
    expect(both.seen).toEqual([]);
  });
  it('checks the item id and the version before any request', async () => {
    const r = await run(async () => {
      await expect(getItem('itm_xyz', { embed: false, version: null, json: false })).rejects.toThrow('is not an item id');
      await expect(getItem(ID, { embed: true, version: 'abc', json: false })).rejects.toThrow('--version takes a whole number');
      await expect(getItem(ID, { embed: true, version: '0', json: false })).rejects.toThrow('--version takes a whole number');
      await expect(getItem(ID, { embed: true, version: '2x', json: false })).rejects.toThrow('--version takes a whole number');
      await expect(revoke('../x', { version: null, reason: null, json: false })).rejects.toThrow('is not an item id');
      await expect(revoke(ID, { version: '1/../..', reason: null, json: false })).rejects.toThrow('--version takes a whole number');
    });
    expect(r.seen).toEqual([]);
  });
});
