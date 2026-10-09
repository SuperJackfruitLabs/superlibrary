import { mkdirSync, mkdtempSync, symlinkSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { LIMITS, pathRefusalSentence, sizeRefusal } from '@superlibrary/contract';
import { getItem, makeClient, revoke, uploadWith, walk } from './artifacts.ts';
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
    const src = tokenSource({ env: {}, dir: tmp(), exchange, now: () => clock, device: { credential: 'dev_00000000000000000000:' + 'a'.repeat(43), plane: 'https://accounts.test', audience: 'https://app.test' } });
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


describe('get and revoke', () => {
  it('revoke posts the version route with the reason; get asks for the viewer URL only with --embed', async () => {
    vi.stubEnv('SUPERLIBRARY_TOKEN', 'tok');
    const seen: string[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      seen.push(`${init.method} ${new URL(url).pathname} ${init.body ?? ''}`);
      return new Response(JSON.stringify(url.endsWith('/embed') ? { url: 'https://v.test/x', expiresAt: 'soon' } : { item: { title: 'T', scope: 'org', createdBy: 'p', createdAt: 'now' }, versions: [{ version: 1, fileCount: 1, sha256: 'a'.repeat(64), revokedAt: null }] }));
    });
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    try {
      await revoke('itm_0000000000000001', { version: '2', reason: 'mistake', json: false });
      await getItem('itm_0000000000000001', { embed: false, version: null, json: false });
      await getItem('itm_0000000000000001', { embed: true, version: null, json: false });
    } finally {
      write.mockRestore();
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
    expect(seen).toEqual([
      'POST /api/v1/items/itm_0000000000000001/versions/2/revoke {"reason":"mistake"}',
      'GET /api/v1/items/itm_0000000000000001 ',
      'GET /api/v1/items/itm_0000000000000001 ',
      'POST /api/v1/items/itm_0000000000000001/embed {}',
    ]);
  });
});
