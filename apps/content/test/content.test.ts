import { createExecutionContext, env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { FRAME_SANDBOX, contentCsp, contentLabel, formatToken, signingMessage, type Manifest } from '@superlibrary/contract';
import worker, { type Env } from '../src/index';

const APP = 'https://app.test';
const ITEM = 'itm_00000000000000c1';
const OTHER = 'itm_00000000000000c2';
let pair: CryptoKeyPair;
let PUB = '';
beforeAll(async () => {
  pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  PUB = JSON.stringify(await crypto.subtle.exportKey('jwk', pair.publicKey));
});
const testEnv = (o: Partial<Env> = {}) => ({ ...env, URL_SIGNING_PUBLIC_KEY: PUB, ...o }) as unknown as Env;

async function token(itemId: string, version: number, o: { exp?: number; host?: string; key?: CryptoKey } = {}) {
  const exp = o.exp ?? Math.floor(Date.now() / 1000) + 300;
  const host = o.host ?? APP;
  const sig = new Uint8Array(await crypto.subtle.sign('Ed25519', o.key ?? pair.privateKey, signingMessage({ itemId, version, exp, host })));
  return formatToken({ version, exp, host, sig });
}
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const bytesOf = (body: string | Uint8Array) => (typeof body === 'string' ? new TextEncoder().encode(body) : body);

type Seed = { body: string | Uint8Array; mediaType: string; view: Manifest['files'][string]['view'] };
async function seed(itemId: string, version: number, files: Record<string, Seed>, entry: string, expiresAt: string | null = null) {
  const m: Manifest = { itemId, version, entry, expiresAt, files: {} };
  for (const [path, f] of Object.entries(files)) {
    const b = bytesOf(f.body);
    const h = hex(await crypto.subtle.digest('SHA-256', b));
    await env.BLOBS.put(`blobs/${h}`, b);
    m.files[path] = { sha256: h, bytes: b.length, mediaType: f.mediaType, view: f.view };
  }
  await env.BLOBS.put(`manifests/${itemId}/${version}.json`, JSON.stringify(m));
}
// What a Worker receives is an incoming request; a test builds a plain one.
const req = (url: string, init?: RequestInit) => new Request(url, init) as Parameters<typeof worker.fetch>[0];
const get = (itemId: string, pathAndQuery: string, init?: RequestInit, e: Env = testEnv()) =>
  worker.fetch(req(`https://${contentLabel(itemId)}.content.test${pathAndQuery}`, init), e, createExecutionContext());
const dataOf = (html: string) => JSON.parse(/<script id="sl-data" type="application\/json">(.*?)<\/script>/s.exec(html)![1]!);

const MD = { body: '# Hi\n', mediaType: 'text/markdown; charset=utf-8', view: 'markdown' as const };
const HTML = { body: '<!doctype html><link rel="stylesheet" href="style.css"><p>app</p>', mediaType: 'text/html; charset=utf-8', view: 'html' as const };
const CSS = { body: 'p{color:red}', mediaType: 'text/css; charset=utf-8', view: 'code' as const };
const SVG = { body: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', mediaType: 'image/svg+xml', view: 'svg' as const };
const DOCX = { body: 'PK\u0003\u0004word/', mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', view: 'download' as const };
const TXT = { body: '0123456789', mediaType: 'text/plain; charset=utf-8', view: 'text' as const };

const CSP = contentCsp(['https://app.test', 'https://host.test']);
// Ruling C9: an HTML or SVG document is sandboxed by its own headers too, so opened top-level it
// still gets an opaque origin, exactly as inside the host's frame.
const DOCUMENT_CSP = `${CSP}; sandbox ${FRAME_SANDBOX}`;

describe('the viewer document', () => {
  it('serves /_view with the viewer data and every spec §9 header', async () => {
    await seed(ITEM, 1, { 'notes.md': MD }, 'notes.md');
    const t = await token(ITEM, 1);
    const res = await get(ITEM, `/_view?sig=${t}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(res.headers.get('content-security-policy')).toBe(DOCUMENT_CSP);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('cross-origin-opener-policy')).toBe('same-origin');
    expect(res.headers.get('cross-origin-resource-policy')).toBe('same-site');
    expect(res.headers.get('set-cookie')).toBeNull();
    const html = await res.text();
    const base = `https://${contentLabel(ITEM)}.content.test/s/${t}/`;
    expect(dataOf(html)).toMatchObject({ view: 'markdown', path: 'notes.md', name: 'notes.md', text: '# Hi\n', host: APP, rawUrl: `${base}notes.md`, baseUrl: base });
    expect(html).toContain('<script type="module" src="/_viewer/viewer.js"></script>');
    expect(html).not.toMatch(/<script>/); // every script tag is a data block or an external file
  });

  it('an HTML entry renders itself: /_view redirects into the signed path, and its own CSS loads cross-origin', async () => {
    await seed(ITEM, 2, { 'index.html': HTML, 'style.css': CSS }, 'index.html');
    const t = await token(ITEM, 2);
    const res = await get(ITEM, `/_view?sig=${t}`, { redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(`/s/${t}/index.html`);
    const page = await get(ITEM, `/s/${t}/index.html`);
    expect(page.headers.get('cross-origin-resource-policy')).toBe('same-site');
    expect(page.headers.get('content-disposition')).toBe('inline');
    expect(page.headers.get('content-security-policy')).toBe(DOCUMENT_CSP);
    const css = await get(ITEM, `/s/${t}/style.css`);
    expect(await css.text()).toBe(CSS.body);
    // Plan D2: an opaque-origin page cannot load same-site subresources.
    expect(css.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
    expect(css.headers.get('access-control-allow-origin')).toBe('*');
    expect(css.headers.get('content-type')).toBe('text/css; charset=utf-8');
    expect(css.headers.get('content-security-policy')).toBe(CSP);
  });

  it('a raw SVG is sandboxed when opened as a document, and still loads as an image from an opaque origin', async () => {
    await seed(ITEM, 10, { 'a.svg': SVG }, 'a.svg');
    const res = await get(ITEM, `/s/${await token(ITEM, 10)}/a.svg`);
    expect(res.headers.get('content-security-policy')).toBe(DOCUMENT_CSP);
    expect(res.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
    expect(res.headers.get('content-type')).toBe('image/svg+xml');
  });

  it('every kind not rendered is an attachment; ?download=1 makes any kind one', async () => {
    await seed(ITEM, 3, { 'a.docx': DOCX, 'n.md': MD }, 'a.docx');
    const t = await token(ITEM, 3);
    expect((await get(ITEM, `/s/${t}/a.docx`)).headers.get('content-disposition')).toBe(`attachment; filename*=UTF-8''a.docx`);
    expect((await get(ITEM, `/s/${t}/n.md?download=1`)).headers.get('content-disposition')).toBe(`attachment; filename*=UTF-8''n.md`);
    expect((await get(ITEM, `/s/${t}/n.md`)).headers.get('content-disposition')).toBe('inline');
  });

  it('a path with # ? % and spaces round-trips', async () => {
    const path = 'img/my report #1?100%.md';
    await seed(ITEM, 4, { [path]: MD }, path);
    const t = await token(ITEM, 4);
    const res = await get(ITEM, `/s/${t}/img/my%20report%20%231%3F100%25.md`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(MD.body);
    expect(dataOf(await (await get(ITEM, `/_view?sig=${t}`)).text()).rawUrl).toBe(`https://${contentLabel(ITEM)}.content.test/s/${t}/img/my%20report%20%231%3F100%25.md`);
  });

  it('answers a Range request with 206, a suffix and an open range too, and an unsatisfiable one with 416', async () => {
    await seed(ITEM, 5, { 'v.txt': TXT }, 'v.txt');
    const t = await token(ITEM, 5);
    const res = await get(ITEM, `/s/${t}/v.txt`, { headers: { Range: 'bytes=2-4' } });
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe('bytes 2-4/10');
    expect(await res.text()).toBe('234');
    const suffix = await get(ITEM, `/s/${t}/v.txt`, { headers: { Range: 'bytes=-3' } });
    expect([suffix.status, suffix.headers.get('content-range'), suffix.headers.get('content-length'), await suffix.text()]).toEqual([206, 'bytes 7-9/10', '3', '789']);
    const open = await get(ITEM, `/s/${t}/v.txt`, { headers: { Range: 'bytes=6-' } });
    expect([open.status, open.headers.get('content-range'), await open.text()]).toEqual([206, 'bytes 6-9/10', '6789']);
    const beyond = await get(ITEM, `/s/${t}/v.txt`, { headers: { Range: 'bytes=50-60' } });
    expect([beyond.status, beyond.headers.get('content-range')]).toEqual([416, 'bytes */10']);
    const multi = await get(ITEM, `/s/${t}/v.txt`, { headers: { Range: 'bytes=0-1,4-5' } });
    expect([multi.status, multi.headers.get('content-range'), await multi.text()]).toEqual([200, null, TXT.body]);
    const head = await get(ITEM, `/s/${t}/v.txt`, { method: 'HEAD' });
    expect([head.status, head.headers.get('content-length'), head.headers.get('accept-ranges')]).toEqual([200, '10', 'bytes']);
  });

  it('decodes UTF-16LE, UTF-16BE and UTF-8 with a BOM into the viewer data', async () => {
    const s = 'héllo ✓ 𝄞\n';
    const le = new Uint8Array(2 + s.length * 2);
    const be = new Uint8Array(2 + s.length * 2);
    le.set([0xff, 0xfe]);
    be.set([0xfe, 0xff]);
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      le.set([c & 0xff, c >> 8], 2 + i * 2);
      be.set([c >> 8, c & 0xff], 2 + i * 2);
    }
    const u8 = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(s)]);
    const cases: [number, Seed][] = [
      [11, { body: le, mediaType: 'text/plain; charset=utf-16le', view: 'text' }],
      [12, { body: be, mediaType: 'text/plain; charset=utf-16be', view: 'text' }],
      [13, { body: u8, mediaType: 'text/plain; charset=utf-8', view: 'text' }],
      // SVG's media type carries no charset: the BOM alone says how to read it.
      [14, { body: le, mediaType: 'image/svg+xml', view: 'svg' }],
    ];
    for (const [version, file] of cases) {
      await seed(ITEM, version, { 'u.txt': file }, 'u.txt');
      const html = await (await get(ITEM, `/_view?sig=${await token(ITEM, version)}`)).text();
      expect(dataOf(html).text, file.mediaType).toBe(s);
    }
  });

  it('inlines a PDF as base64', async () => {
    const pdf = '%PDF-1.4\n%ÿ\n';
    await seed(ITEM, 15, { 'a.pdf': { body: pdf, mediaType: 'application/pdf', view: 'pdf' } }, 'a.pdf');
    const d = dataOf(await (await get(ITEM, `/_view?sig=${await token(ITEM, 15)}`)).text());
    expect(d.text).toBeUndefined();
    expect(atob(d.base64)).toBe(String.fromCharCode(...new TextEncoder().encode(pdf)));
  });

  it('a path that is an Object prototype key is no file of the version', async () => {
    const t = await token(ITEM, 1);
    for (const p of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      const res = await get(ITEM, `/s/${t}/${p}`);
      expect(res.status, p).toBe(404);
    }
  });
});

describe('signed URLs', () => {
  it('an expired URL is refused', async () => {
    await seed(ITEM, 1, { 'notes.md': MD }, 'notes.md');
    const res = await get(ITEM, `/_view?sig=${await token(ITEM, 1, { exp: Math.floor(Date.now() / 1000) - 1 })}`);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'expired' });
  });
  it('an expiry further out than five minutes is refused even when signed', async () => {
    const res = await get(ITEM, `/_view?sig=${await token(ITEM, 1, { exp: Math.floor(Date.now() / 1000) + 3600 })}`);
    expect(await res.json()).toEqual({ error: 'invalid_signature' });
  });
  it('a URL opens only its own item: the same token on another item’s subdomain is refused', async () => {
    await seed(OTHER, 1, { 'notes.md': MD }, 'notes.md');
    const res = await get(OTHER, `/_view?sig=${await token(ITEM, 1)}`);
    expect(await res.json()).toEqual({ error: 'invalid_signature' });
  });
  it('a URL opens only its own version', async () => {
    await seed(ITEM, 6, { 'a.md': MD }, 'a.md');
    await seed(ITEM, 7, { 'b.md': MD }, 'b.md');
    expect((await get(ITEM, `/s/${await token(ITEM, 6)}/b.md`)).status).toBe(404);
  });
  it('a token signed by another key, or naming a host not allowed to frame, is refused', async () => {
    const stranger = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    expect(await (await get(ITEM, `/_view?sig=${await token(ITEM, 1, { key: stranger.privateKey })}`)).json()).toEqual({ error: 'invalid_signature' });
    expect(await (await get(ITEM, `/_view?sig=${await token(ITEM, 1, { host: 'https://evil.test' })}`)).json()).toEqual({ error: 'host_not_allowed' });
    expect((await get(ITEM, `/_view?sig=garbage`)).status).toBe(403);
  });
  it('takes the verification key whichever runtime exported it (`alg` "Ed25519" from Node 24+, "EdDSA", or none)', async () => {
    await seed(ITEM, 1, { 'notes.md': MD }, 'notes.md');
    const t = await token(ITEM, 1);
    const { alg: _alg, ...bare } = JSON.parse(PUB) as JsonWebKey;
    for (const alg of ['Ed25519', 'EdDSA', undefined]) {
      const res = await get(ITEM, `/_view?sig=${t}`, undefined, testEnv({ URL_SIGNING_PUBLIC_KEY: JSON.stringify(alg ? { ...bare, alg } : bare) }));
      expect(res.status, String(alg)).toBe(200);
    }
  });
  it('revoked (no manifest) or expired items are gone, at once', async () => {
    const t = await token(ITEM, 8);
    expect(await (await get(ITEM, `/_view?sig=${t}`)).json()).toEqual({ error: 'gone' });
    await seed(ITEM, 9, { 'a.md': MD }, 'a.md', new Date(Date.now() - 1000).toISOString());
    expect((await get(ITEM, `/_view?sig=${await token(ITEM, 9)}`)).status).toBe(410);
  });
});

describe('the content origin serves nothing else', () => {
  it('no other method, host or path', async () => {
    expect((await get(ITEM, '/_view', { method: 'POST' })).status).toBe(405);
    expect((await worker.fetch(req('https://content.test/'), testEnv(), createExecutionContext())).status).toBe(404);
    expect((await worker.fetch(req('https://www.content.test/'), testEnv(), createExecutionContext())).status).toBe(404);
    expect((await get(ITEM, '/api/v1/items')).status).toBe(404);
  });
  it('serves the viewer bundle to an opaque origin', async () => {
    const res = await get(ITEM, '/_viewer/viewer.js');
    expect(res.status).toBe(200);
    expect(res.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('content-type')).toMatch(/^text\/javascript/);
  });
  it('a revalidating browser still gets the bundle, not a refusal', async () => {
    // The asset store's own validator: a browser holding it would get a 304 from the store.
    const direct = await env.VIEWER.fetch(`https://${contentLabel(ITEM)}.content.test/_viewer/viewer.js`);
    await direct.arrayBuffer();
    const etag = direct.headers.get('etag')!;
    const cached = await env.VIEWER.fetch(`https://${contentLabel(ITEM)}.content.test/_viewer/viewer.js`, { headers: { 'If-None-Match': etag } });
    expect(cached.status).toBe(304);
    const again = await get(ITEM, '/_viewer/viewer.js', { headers: { 'If-None-Match': etag } });
    expect(again.status).toBe(200);
    expect(await again.text()).toContain('sl-data');
  });
  it('an empty frame-ancestors configuration fails closed: 500 and nothing served', async () => {
    await seed(ITEM, 1, { 'notes.md': MD }, 'notes.md');
    const res = await get(ITEM, `/_view?sig=${await token(ITEM, 1)}`, undefined, testEnv({ FRAME_ANCESTORS: '  ' }));
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain('Hi');
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
  });
  it('without the verification key it refuses plainly', async () => {
    const res = await get(ITEM, `/_view?sig=${await token(ITEM, 1)}`, undefined, testEnv({ URL_SIGNING_PUBLIC_KEY: '' }));
    expect([res.status, await res.json()]).toEqual([503, { error: 'not_configured' }]);
  });
});

describe('the content origin never serves anything with a login (operator)', () => {
  it('sets no cookie on any response class', async () => {
    await seed(ITEM, 1, { 'notes.md': MD }, 'notes.md');
    await seed(ITEM, 2, { 'index.html': HTML, 'style.css': CSS }, 'index.html');
    await seed(ITEM, 5, { 'v.txt': TXT }, 'v.txt');
    const t1 = await token(ITEM, 1);
    const t2 = await token(ITEM, 2);
    const t5 = await token(ITEM, 5);
    const classes: [string, Promise<Response>, number][] = [
      ['viewer document', get(ITEM, `/_view?sig=${t1}`), 200],
      ['viewer document HEAD', get(ITEM, `/_view?sig=${t1}`, { method: 'HEAD' }), 200],
      ['HTML entry redirect', get(ITEM, `/_view?sig=${t2}`, { redirect: 'manual' }), 302],
      ['raw HTML document', get(ITEM, `/s/${t2}/index.html`), 200],
      ['raw subresource', get(ITEM, `/s/${t2}/style.css`), 200],
      ['raw download', get(ITEM, `/s/${t1}/notes.md?download=1`), 200],
      ['raw range', get(ITEM, `/s/${t5}/v.txt`, { headers: { Range: 'bytes=0-1' } }), 206],
      ['raw HEAD', get(ITEM, `/s/${t5}/v.txt`, { method: 'HEAD' }), 200],
      ['range not satisfiable', get(ITEM, `/s/${t5}/v.txt`, { headers: { Range: 'bytes=99-' } }), 416],
      ['viewer bundle', get(ITEM, '/_viewer/viewer.js'), 200],
      ['403 expired', get(ITEM, `/_view?sig=${await token(ITEM, 1, { exp: Math.floor(Date.now() / 1000) - 1 })}`), 403],
      ['403 invalid_signature', get(ITEM, '/_view?sig=garbage'), 403],
      ['403 host_not_allowed', get(ITEM, `/_view?sig=${await token(ITEM, 1, { host: 'https://evil.test' })}`), 403],
      ['404 not_found', get(ITEM, '/nothing'), 404],
      ['404 no file', get(ITEM, `/s/${t1}/missing.md`), 404],
      ['404 viewer asset', get(ITEM, '/_viewer/missing.js'), 404],
      ['405', get(ITEM, '/_view', { method: 'POST' }), 405],
      ['410 gone', get(ITEM, `/_view?sig=${await token(ITEM, 99)}`), 410],
      ['500 unconfigured', get(ITEM, `/_view?sig=${t1}`, undefined, testEnv({ FRAME_ANCESTORS: '' })), 500],
      ['503 unconfigured', get(ITEM, `/_view?sig=${t1}`, undefined, testEnv({ URL_SIGNING_PUBLIC_KEY: '' })), 503],
    ];
    for (const [name, pending, status] of classes) {
      const res = await pending;
      await res.arrayBuffer();
      expect(res.status, name).toBe(status);
      expect(res.headers.get('set-cookie'), name).toBeNull();
      expect([...res.headers.keys()].filter((k) => /cookie/i.test(k)), name).toEqual([]);
    }
  });
});
