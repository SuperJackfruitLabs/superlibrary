import { describe, expect, it, vi } from 'vitest';
import { zipSync } from 'fflate';
import { LIMITS } from '@superlibrary/contract';
import { deleteOnToIso, describeRefusal, expandZip, leftOutSentence, overrideAndCommit, precheck, secretRefusal, selectFiles, takePicked, uploadFiles, zipEntries } from './upload';

const enc = (s: string) => new TextEncoder().encode(s);
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

function fakeApi(handlers: Record<string, (init: RequestInit) => Response>) {
  const calls: string[] = [];
  const api = async (path: string, init: RequestInit = {}) => {
    const key = `${init.method ?? 'GET'} ${path.replace(/upl_[0-9a-f]{16}/, ':id').replace(/\?path=.*/, '?path')}`;
    calls.push(key);
    return handlers[key]!(init);
  };
  return { api, calls };
}

describe('zips are expanded here, and checked before anything is sent (plan D16)', () => {
  it('expands files, skipping directory entries', () => {
    const zip = zipSync({ 'site/': new Uint8Array(), 'site/index.html': enc('<!doctype html>'), 'site/a.css': enc('p{}') });
    expect(expandZip(zip)).toEqual([{ path: 'site/a.css', bytes: enc('p{}') }, { path: 'site/index.html', bytes: enc('<!doctype html>') }]);
  });

  it('refuses a zip with a symlink entry, naming it', () => {
    const zip = zipSync({ 'ok.txt': enc('x'), 'link': [enc('/etc/passwd'), { os: 3, attrs: (0o120777 << 16) >>> 0 }] });
    expect(zipEntries(zip).find((e) => e.name === 'link')!.symlink).toBe(true);
    expect(expandZip(zip)).toEqual({ refused: 'The zip contains a symbolic link, link, which is not uploaded.' });
  });

  it('refuses a zip whose declared size is over the folder cap before inflating it', () => {
    const zip = zipSync({ 'a.bin': new Uint8Array(10) });
    const view = new DataView(zip.buffer, zip.byteOffset);
    // Patch the central directory's uncompressed size (offset 24) to just over the cap.
    for (let i = zip.length - 22; i >= 0; i--) if (view.getUint32(i, true) === 0x02014b50) { view.setUint32(i + 24, LIMITS.folderBytes + 1, true); break; }
    expect(expandZip(zip)).toMatchObject({ refused: expect.stringContaining('100 MB') });
  });

  it('refuses a file that is not a zip, in a sentence', () => {
    expect(expandZip(enc('not a zip at all, just text that is long enough'))).toEqual({ refused: 'This file could not be read as a zip: not a zip file.' });
  });

  it('keeps non-ASCII and URL-special names from the zip exactly', () => {
    const zip = zipSync({ 'my report #1.md': enc('a'), 'img/a b?%.png': enc('b'), 'résumé/日本.txt': enc('c') });
    expect((expandZip(zip) as { path: string }[]).map((f) => f.path)).toEqual(['img/a b?%.png', 'my report #1.md', 'résumé/日本.txt']);
  });

  it("leaves out the __MACOSX/ copies a Mac's Compress adds", () => {
    const zip = zipSync({ 'site/index.html': enc('<p>'), '__MACOSX/site/._index.html': enc('junk'), '__MACOSX/': new Uint8Array() });
    expect((expandZip(zip) as { path: string }[]).map((f) => f.path)).toEqual(['site/index.html']);
  });

  it('does not count __MACOSX/ copies against the folder limits', () => {
    const zip = zipSync({ '__MACOSX/._a.bin': new Uint8Array(10), 'a.bin': new Uint8Array(10) });
    const view = new DataView(zip.buffer, zip.byteOffset);
    // The first central-directory record is the __MACOSX entry: claim it is over the cap.
    for (let i = 0; i < zip.length - 4; i++) if (view.getUint32(i, true) === 0x02014b50) { view.setUint32(i + 24, LIMITS.folderBytes + 1, true); break; }
    expect(expandZip(zip)).toEqual([{ path: 'a.bin', bytes: new Uint8Array(10) }]);
  });

  it('precheck says why, in a sentence', () => {
    expect(precheck([{ path: '.env', bytes: enc('A=1') }])).toBe('.env is not uploaded: it matches the .env* rule.');
    expect(precheck([{ path: '../x', bytes: enc('') }])).toBe('../x is not uploaded: it leaves the folder.');
    expect(precheck([])).toBe('Choose at least one file.');
    expect(precheck([{ path: 'a.md', bytes: enc('ok') }])).toBeNull();
  });
});

describe('selectFiles: what a pick becomes, checked before any file is read', () => {
  const file = (name: string, rel: string, body = 'x') => Object.assign(new File([body], name), { webkitRelativePath: rel });
  /** A File that only claims a size: reading it is what the caps must prevent (an iOS tab can die). */
  const claimed = (name: string, size: number, rel = '') => {
    const arrayBuffer = vi.fn(async () => new ArrayBuffer(0));
    return { f: { name, size, webkitRelativePath: rel, arrayBuffer } as unknown as File, arrayBuffer };
  };
  const zipFile = (entries: Parameters<typeof zipSync>[0], name = 'site.zip') => new File([zipSync(entries) as Uint8Array<ArrayBuffer>], name);
  const ok = async (...args: Parameters<typeof selectFiles>) => { const out = await selectFiles(...args); if ('refused' in out) throw new Error(out.refused); return out; };

  it("drops a folder pick's own name from every path, and names the selection after the folder", async () => {
    const out = await ok([file('index.html', 'site/index.html', '<p>'), file('a b.css', 'site/css/a b.css')], { expandZips: true });
    expect(out.files.map((f) => f.path)).toEqual(['index.html', 'css/a b.css']);
    expect(out.files[0]!.bytes).toEqual(enc('<p>'));
    expect(out.name).toBe('site');
  });

  it('keeps plain picked files by name', async () => {
    expect((await ok([file('my report #1.md', ''), file('b.md', '')], { expandZips: true })).files.map((f) => f.path)).toEqual(['my report #1.md', 'b.md']);
  });

  it('leaves out denied files and lists them with their rule; the rest still uploads', async () => {
    const out = await ok([file('a.md', 'proj/a.md'), file('HEAD', 'proj/.git/HEAD'), file('.env', 'proj/.env'), file('k.pem', 'proj/certs/k.pem')], { expandZips: true });
    expect(out.files.map((f) => f.path)).toEqual(['a.md']);
    expect(out.leftOut).toEqual([{ path: '.git/HEAD', rule: '.git/' }, { path: '.env', rule: '.env*' }, { path: 'certs/k.pem', rule: '*.pem' }]);
    expect(leftOutSentence(out.leftOut)).toBe('These 3 files are left out: .git/HEAD (the .git/ rule), .env (the .env* rule) and certs/k.pem (the *.pem rule).');
    expect(leftOutSentence([{ path: '.env', rule: '.env*' }])).toBe('This file is left out: .env (the .env* rule).');
    expect(leftOutSentence([])).toBeNull();
  });

  it('a refusal that is not a denial still blocks the whole pick, in its sentence', async () => {
    expect(await selectFiles([file('a.md', ''), file('a\\b.md', '')], { expandZips: true })).toEqual({ refused: 'a\\b.md is not uploaded: it contains a backslash.' });
  });

  it('skips .DS_Store and Thumbs.db silently', async () => {
    const out = await ok([file('a.md', 'p/a.md'), file('.DS_Store', 'p/.DS_Store'), file('Thumbs.db', 'p/img/Thumbs.db')], { expandZips: true });
    expect(out.files.map((f) => f.path)).toEqual(['a.md']);
    expect(out.leftOut).toEqual([]);
  });

  it('a file over 25 MB is refused from its size; nothing is read', async () => {
    const big = claimed('big.bin', LIMITS.fileBytes + 1);
    const small = claimed('a.md', 3);
    expect(await selectFiles([small.f, big.f], { expandZips: true })).toEqual({ refused: 'big.bin is larger than 25 MB, the limit for one file.' });
    expect(big.arrayBuffer).not.toHaveBeenCalled();
    expect(small.arrayBuffer).not.toHaveBeenCalled();
  });

  it('more than 500 files, or more than 100 MB together, is refused before anything is read', async () => {
    const many = Array.from({ length: LIMITS.folderFiles + 1 }, (_, i) => claimed(`f${i}.md`, 1, `d/f${i}.md`));
    expect(await selectFiles(many.map((m) => m.f), { expandZips: true })).toEqual({ refused: `A folder may have at most ${LIMITS.folderFiles} files; this has ${LIMITS.folderFiles + 1}.` });
    expect(many.some((m) => m.arrayBuffer.mock.calls.length > 0)).toBe(false);
    const heavy = Array.from({ length: 5 }, (_, i) => claimed(`h${i}.bin`, 21 * 1024 * 1024, `d/h${i}.bin`));
    expect(await selectFiles(heavy.map((m) => m.f), { expandZips: true })).toEqual({ refused: 'Together these are more than 100 MB, the limit for a folder.' });
    expect(heavy.some((m) => m.arrayBuffer.mock.calls.length > 0)).toBe(false);
  });

  it('a zip over the folder cap is refused from its size, unread', async () => {
    const z = claimed('huge.zip', LIMITS.folderBytes + 3 * 1024 * 1024);
    expect(await selectFiles([z.f], { expandZips: true })).toEqual({ refused: 'The zip is larger than 100 MB, the limit for a folder.' });
    expect(z.arrayBuffer).not.toHaveBeenCalled();
  });

  it('a zip is expanded, named after itself, with denied entries left out and junk skipped', async () => {
    const out = await ok([zipFile({ 'site/index.html': enc('<p>'), 'site/.git/config': enc('[core]'), 'site/.DS_Store': enc('x'), 'Thumbs.db': enc('x') })], { expandZips: true });
    expect(out.files.map((f) => f.path)).toEqual(['site/index.html']);
    expect(out.leftOut).toEqual([{ path: 'site/.git/config', rule: '.git/' }]);
    expect(out.name).toBe('site');
  });

  it('denied zip entries do not count against the folder limits', async () => {
    const entries: Record<string, Uint8Array> = { 'a.md': enc('a') };
    for (let i = 0; i < LIMITS.folderFiles; i++) entries[`.git/objects/${i}`] = enc('o');
    const out = await ok([zipFile(entries)], { expandZips: true });
    expect(out.files.map((f) => f.path)).toEqual(['a.md']);
    expect(out.leftOut).toHaveLength(LIMITS.folderFiles);
  });

  it('with zips not expanded, a zip is one file', async () => {
    expect((await ok([zipFile({ 'a.md': enc('a') }, 'a.zip')], { expandZips: false })).files.map((f) => f.path)).toEqual(['a.zip']);
  });
});

describe('uploadFiles', () => {
  it('declares, sends each file, commits — in that order', async () => {
    const { api, calls } = fakeApi({
      'POST /api/v1/uploads': () => json(201, { uploadId: 'upl_0000000000000001', expiresAt: 'x', entry: 'a.md' }),
      'PUT /api/v1/uploads/:id/files?path': () => json(200, { findings: [] }),
      'POST /api/v1/uploads/:id/commit': () => json(201, { itemId: 'itm_0000000000000001', version: 1 }),
    });
    const out = await uploadFiles(api, [{ path: 'a.md', bytes: enc('# a') }, { path: 'b.md', bytes: enc('# b') }], { title: 'T' });
    expect(out).toMatchObject({ ok: true, result: { itemId: 'itm_0000000000000001' } });
    expect(calls).toEqual(['POST /api/v1/uploads', 'PUT /api/v1/uploads/:id/files?path', 'PUT /api/v1/uploads/:id/files?path', 'POST /api/v1/uploads/:id/commit']);
  });

  it('a secret finding comes back with the upload id, and an override with a reason then commits', async () => {
    const { api, calls } = fakeApi({
      'POST /api/v1/uploads': () => json(201, { uploadId: 'upl_0000000000000002' }),
      'PUT /api/v1/uploads/:id/files?path': () => json(200, { findings: [{ line: 2, rule: 'github-token' }] }),
      'POST /api/v1/uploads/:id/commit': () => json(422, { error: 'secret_found', findings: [{ path: 'c.ts', line: 2, rule: 'github-token' }] }),
      'POST /api/v1/uploads/:id/override': (init) => (JSON.parse(String(init.body)).reason === 'rotated already' ? json(200, { overridden: true }) : json(400, { error: 'invalid' })),
    });
    const first = await uploadFiles(api, [{ path: 'c.ts', bytes: enc('x') }], { title: 'T' });
    expect(first).toEqual({ ok: false, status: 422, error: 'secret_found', uploadId: 'upl_0000000000000002', findings: [{ path: 'c.ts', line: 2, rule: 'github-token' }] });
    await overrideAndCommit(api, 'upl_0000000000000002', 'rotated already');
    expect(calls.slice(-2)).toEqual(['POST /api/v1/uploads/:id/override', 'POST /api/v1/uploads/:id/commit']);
  });

  it('declares each file by size and SHA-256, and sends its exact bytes', async () => {
    let declared: unknown;
    let sent: unknown;
    const { api } = fakeApi({
      'POST /api/v1/uploads': (init) => { declared = JSON.parse(String(init.body)); return json(201, { uploadId: 'upl_0000000000000003' }); },
      'PUT /api/v1/uploads/:id/files?path': (init) => { sent = init.body; return json(200, { findings: [] }); },
      'POST /api/v1/uploads/:id/commit': () => json(201, { itemId: 'itm_0000000000000003', version: 2 }),
    });
    await uploadFiles(api, [{ path: 'a.md', bytes: enc('abc') }], { title: 'T', item: 'itm_0000000000000003' });
    expect(declared).toEqual({ title: 'T', item: 'itm_0000000000000003', files: [{ path: 'a.md', bytes: 3, sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' }] });
    expect(sent).toEqual(enc('abc'));
  });

  it('a name with spaces, #, ?, % or non-ASCII letters reaches the server as itself', async () => {
    const names = ['my report #1.md', 'img/a b?.png', '100%.txt', 'résumé/日本.txt', 'a+b&c=d.md'];
    const seen: string[] = [];
    const api = async (path: string, init: RequestInit = {}) => {
      if (init.method === 'PUT') seen.push(new URL(path, 'https://app.test').searchParams.get('path')!);
      return path.endsWith('/uploads') ? json(201, { uploadId: 'upl_0000000000000004' }) : path.endsWith('/commit') ? json(201, { itemId: 'itm_0000000000000004', version: 1 }) : json(200, { findings: [] });
    };
    await uploadFiles(api, names.map((path) => ({ path, bytes: enc(path) })), { title: 'T' });
    expect(seen).toEqual(names);
  });

  it('a commit answered 409 incomplete resends exactly the missing files, then commits again', async () => {
    let commits = 0;
    const puts: string[] = [];
    const api = async (path: string, init: RequestInit = {}) => {
      if (init.method === 'PUT') { puts.push(new URL(path, 'https://app.test').searchParams.get('path')!); return json(200, { findings: [] }); }
      if (path.endsWith('/uploads')) return json(201, { uploadId: 'upl_0000000000000005' });
      return ++commits === 1 ? json(409, { error: 'incomplete', missing: ['b.md'] }) : json(201, { itemId: 'itm_0000000000000005', version: 1 });
    };
    const out = await uploadFiles(api, [{ path: 'a.md', bytes: enc('a') }, { path: 'b.md', bytes: enc('b') }], { title: 'T' });
    expect(out).toMatchObject({ ok: true });
    expect(puts).toEqual(['a.md', 'b.md', 'b.md']);
    expect(commits).toBe(2);
  });

  it('reports progress after each file it sends', async () => {
    const { api } = fakeApi({
      'POST /api/v1/uploads': () => json(201, { uploadId: 'upl_0000000000000006' }),
      'PUT /api/v1/uploads/:id/files?path': () => json(200, { findings: [] }),
      'POST /api/v1/uploads/:id/commit': () => json(201, { itemId: 'itm_0000000000000006', version: 1 }),
    });
    const seen: [number, number][] = [];
    await uploadFiles(api, [{ path: 'a', bytes: enc('a') }, { path: 'b', bytes: enc('b') }], { title: 'T' }, { onProgress: (n, of) => seen.push([n, of]) });
    expect(seen).toEqual([[0, 2], [1, 2], [2, 2]]);
  });

  it('a refused declaration keeps what the server said about it', async () => {
    const { api, calls } = fakeApi({ 'POST /api/v1/uploads': () => json(400, { error: 'path_refused', path: '.npmrc', reason: 'denied', rule: '.npmrc' }) });
    const out = await uploadFiles(api, [{ path: '.npmrc', bytes: enc('x') }], { title: 'T' });
    expect(out).toEqual({ ok: false, status: 400, error: 'path_refused', detail: { path: '.npmrc', reason: 'denied', rule: '.npmrc' } });
    expect(calls).toEqual(['POST /api/v1/uploads']);
  });
});

describe('what the person is told', () => {
  it('a secret refusal names file and line, and says nothing was added to the library', () => {
    expect(secretRefusal([{ path: 'c.ts', line: 2, rule: 'github-token' }, { path: 'd/e.env.txt', line: 9, rule: 'aws-access-key' }])).toBe(
      'c.ts line 2 (github-token) and d/e.env.txt line 9 (aws-access-key) look like secrets. Nothing was added to the library.',
    );
    expect(secretRefusal([{ path: 'c.ts', line: 2, rule: 'github-token' }])).toBe('c.ts line 2 (github-token) looks like a secret. Nothing was added to the library.');
  });

  it('every refusal the upload API gives reads as a sentence', () => {
    const r = (error: string, status: number, detail?: Record<string, unknown>) => describeRefusal({ ok: false, status, error, ...(detail ? { detail } : {}) });
    expect(r('path_refused', 400, { path: '.npmrc', reason: 'denied', rule: '.npmrc' })).toBe('.npmrc is not uploaded: it matches the .npmrc rule.');
    expect(r('quota_exceeded', 413)).toBe('This would take the workspace over its storage limit. Nothing was added to the library.');
    expect(r('upload_expired', 410)).toBe('This upload was not finished within 24 hours and has expired. Upload it again.');
    expect(r('revoked', 410)).toBe('That item has been revoked, so it cannot have a new version.');
    expect(r('expired', 410)).toBe('That item has expired. Choose a new delete date to upload a new version.');
    expect(r('not_found', 404)).toBe('That item does not exist, or you cannot change it.');
    expect(r('duplicate_path', 400, { path: 'a.md' })).toBe('a.md is chosen twice.');
    expect(r('teapot', 418)).toBe('The upload was refused (teapot, HTTP 418). Nothing was added to the library.');
  });

  it('the remaining refusals read as sentences too, with the server’s detail passed through', () => {
    const r = (error: string, status: number, detail?: Record<string, unknown>) => describeRefusal({ ok: false, status, error, ...(detail ? { detail } : {}) });
    // iOS's date picker does not enforce `min`, so a past delete date reaches the server.
    expect(r('invalid', 400, { detail: 'expiresAt must be in the future' })).toBe('The delete date must be after today. Nothing was added to the library.');
    expect(r('invalid', 400, { detail: 'a reason is required' })).toBe('The upload was not accepted: a reason is required. Nothing was added to the library.');
    expect(r('invalid', 400)).toBe('The upload was not accepted. Nothing was added to the library.');
    expect(r('not_declared', 404, { path: 'x.md' })).toBe('x.md was not part of this upload. Upload again.');
    expect(r('already_committed', 409)).toBe('This upload is already in the library.');
    expect(r('nothing_to_override', 409)).toBe('Nothing in this upload needs an override. Upload it again.');
    expect(r('entry_not_found', 400, { entry: 'index.html' })).toBe('index.html, the file to open first, is not among the chosen files. Nothing was added to the library.');
  });

  it('keeps what the server said, detail and entry included', async () => {
    const { api } = fakeApi({ 'POST /api/v1/uploads': () => json(400, { error: 'invalid', detail: 'expiresAt must be in the future' }) });
    expect(await uploadFiles(api, [{ path: 'a.md', bytes: enc('x') }], { title: 'T' })).toMatchObject({ detail: { detail: 'expiresAt must be in the future' } });
    const { api: api2 } = fakeApi({ 'POST /api/v1/uploads': () => json(400, { error: 'entry_not_found', entry: 'index.html' }) });
    expect(await uploadFiles(api2, [{ path: 'a.md', bytes: enc('x') }], { title: 'T' })).toMatchObject({ detail: { entry: 'index.html' } });
  });

  it('a picked file can be picked again: the input is emptied once its files are taken', () => {
    const f = new File(['x'], 'a.md');
    const input = { files: [f] as unknown as FileList, value: 'C:\\fakepath\\a.md' };
    expect(takePicked(input)).toEqual([f]);
    expect(input.value).toBe('');
  });

  it('a delete date means the start of that day where the person is', () => {
    expect(deleteOnToIso('2026-11-02')).toBe(new Date(2026, 10, 2).toISOString());
  });
});
