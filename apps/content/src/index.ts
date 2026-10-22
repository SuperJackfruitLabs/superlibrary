/**
 * superlibrary-content: artifact bytes and the viewer on `<itm-label>.superlibrarycontent.dev`, for a
 * valid signed URL only. No credentials of any kind, no API, no database (spec §6). R2 is read
 * through a type that has no write methods (plan D8).
 */
import { SOURCE_VIEWS, TEXT_VIEWS, encodePath, itemIdFromLabel, parseToken, signingMessage, type Manifest, type ViewerData } from '@superlibrary/contract';
import { cacheUntil, documentHeaders, frameAncestors, subresourceHeaders, unconfiguredHeaders } from './headers';
import { expiredPage, viewerPage } from './viewer-page';

export type ReadOnlyBucket = Pick<R2Bucket, 'get' | 'head'>;

export interface Env {
  BLOBS: ReadOnlyBucket;
  VIEWER: Fetcher;
  URL_SIGNING_PUBLIC_KEY: string;
  FRAME_ANCESTORS: string;
  CONTENT_DOMAIN: string;
}

type ManifestFile = Manifest['files'][string];

/** Five minutes (spec §9) plus thirty seconds of clock skew. */
const MAX_AHEAD_S = 330;

function refuse(env: Env, status: number, code: string): Response {
  return new Response(JSON.stringify({ error: code }), { status, headers: documentHeaders(env, 'application/json') });
}

let keyCache: { jwk: string; key: Promise<CryptoKey> } | null = null;
function verifyKey(env: Env): Promise<CryptoKey> {
  if (keyCache?.jwk !== env.URL_SIGNING_PUBLIC_KEY) {
    // workerd imports an Ed25519 JWK only when `alg` is absent or "EdDSA"; Node 24+ exports "Ed25519".
    // The algorithm is fixed here, so `alg` adds nothing: drop it, whichever runtime made the key.
    const { alg: _alg, ...jwk } = JSON.parse(env.URL_SIGNING_PUBLIC_KEY) as JsonWebKey;
    keyCache = { jwk: env.URL_SIGNING_PUBLIC_KEY, key: crypto.subtle.importKey('jwk', jwk, { name: 'Ed25519' }, false, ['verify']) };
  }
  return keyCache.key;
}

type Grant = { version: number; host: string; exp: number };

/**
 * A grant, or `{ expired }` for a token that is genuine but has run out (signature, host and item all
 * check), so a frame navigating with it can be told to ask its host for a new one.
 */
async function verify(env: Env, itemId: string, token: string): Promise<Grant | { expired: Grant } | Response> {
  // Before Task 21 Step 4 sets the key, refuse plainly rather than throw.
  if (!env.URL_SIGNING_PUBLIC_KEY) return refuse(env, 503, 'not_configured');
  const t = parseToken(token);
  if (!t) return refuse(env, 403, 'invalid_signature');
  const now = Math.floor(Date.now() / 1000);
  if (t.exp > now + MAX_AHEAD_S) return refuse(env, 403, 'invalid_signature');
  if (!frameAncestors(env).includes(t.host)) return refuse(env, 403, 'host_not_allowed');
  // The item comes from the hostname, never from the token: a URL opens only its own item.
  const ok = await crypto.subtle.verify('Ed25519', await verifyKey(env), t.sig, signingMessage({ itemId, version: t.version, exp: t.exp, host: t.host }));
  if (!ok) return refuse(env, 403, 'invalid_signature');
  const g = { version: t.version, host: t.host, exp: t.exp };
  return t.exp <= now ? { expired: g } : g;
}

/** A navigation of the frame (or of a tab): the only requests that can show a page. */
const isDocumentRequest = (request: Request) => ['iframe', 'frame', 'document'].includes(request.headers.get('sec-fetch-dest') ?? '');

/**
 * PR 3 review: a person keeps viewing past the five-minute URL (a relative link in an HTML page, a
 * reload). A document navigation gets a page that posts `superlibrary:expired` to the signed host,
 * which mints again; anything else keeps the JSON refusal.
 */
function expired(request: Request, env: Env, g: Grant, path: string): Response {
  if (!isDocumentRequest(request)) {
    // A subresource of the opaque-origin frame: CORP same-site would hide this refusal from it
    // (plan D2), and a media element would then retry forever instead of failing.
    return new Response(JSON.stringify({ error: 'expired' }), { status: 403, headers: subresourceHeaders(env, 'application/json') });
  }
  return new Response(request.method === 'HEAD' ? null : expiredPage(g.host, path), { status: 403, headers: documentHeaders(env, 'text/html; charset=utf-8') });
}

async function manifestOf(env: Env, itemId: string, version: number): Promise<Manifest | Response> {
  const obj = await env.BLOBS.get(`manifests/${itemId}/${version}.json`);
  if (!obj) return refuse(env, 410, 'gone'); // revoked, deleted, or never existed
  const m = await obj.json<Manifest>();
  // Only null means "no expiry". Anything else must be a time still ahead: an expiry that cannot be
  // read fails closed (Date.parse gives NaN, and NaN <= now is false).
  if (m.expiresAt !== null) {
    const at = typeof m.expiresAt === 'string' ? Date.parse(m.expiresAt) : NaN;
    if (!(at > Date.now())) return refuse(env, 410, 'gone');
  }
  return m;
}

/** A file of this version, or null. Own keys only: `constructor` or `__proto__` is no file (ruling T11). */
const fileOf = (m: Manifest, path: string): ManifestFile | null => (Object.hasOwn(m.files, path) ? m.files[path]! : null);

const nameOf = (path: string) => path.split('/').pop() ?? path;

/**
 * Text as the upload's sniffer read it: it calls a file UTF-16 only on a BOM, so the BOM decides
 * here too (an SVG's media type carries no charset). The BOM itself is not part of the text.
 */
function decode(bytes: ArrayBuffer): string {
  const b = new Uint8Array(bytes);
  const [enc, bom] =
    b[0] === 0xff && b[1] === 0xfe ? ['utf-16le', 2] : b[0] === 0xfe && b[1] === 0xff ? ['utf-16be', 2] : ['utf-8', b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf ? 3 : 0];
  return new TextDecoder(enc as string, { fatal: false, ignoreBOM: true }).decode(b.subarray(bom as number));
}

function base64(bytes: ArrayBuffer): string {
  const b = new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

/** `source`: the caller has checked SOURCE_VIEWS; the text is inlined to be shown as source. */
async function viewerData(env: Env, f: ManifestFile, path: string, baseUrl: string, host: string, source: boolean): Promise<ViewerData | Response> {
  const d: ViewerData = { view: f.view, path, name: nameOf(path), mediaType: f.mediaType, bytes: f.bytes, sha256: f.sha256, rawUrl: baseUrl + encodePath(path), baseUrl, host };
  if (source) d.source = true;
  if (source || TEXT_VIEWS.has(f.view) || f.view === 'pdf') {
    const obj = await env.BLOBS.get(`blobs/${f.sha256}`);
    if (!obj) return refuse(env, 410, 'gone');
    const bytes = await obj.arrayBuffer();
    if (f.view === 'pdf') d.base64 = base64(bytes);
    else d.text = decode(bytes);
  }
  return d;
}

/** RFC 6266 / 5987: a UTF-8 file name, with the characters encodeURIComponent leaves but attr-char forbids. */
const attachment = (name: string) => `attachment; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`;

/**
 * One `bytes=` range as [first byte, length]; null to ignore the header and send everything (a
 * multi-range or malformed one, which RFC 9110 lets a server ignore); 'unsatisfiable' past the end.
 */
function rangeOf(header: string, size: number): [number, number] | null | 'unsatisfiable' {
  const r = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!r || (r[1] === '' && r[2] === '')) return null;
  if (r[1] === '') {
    const n = Math.min(Number(r[2]), size);
    return n === 0 ? 'unsatisfiable' : [size - n, n];
  }
  const start = Number(r[1]);
  const end = r[2] === '' ? size - 1 : Math.min(Number(r[2]), size - 1);
  if (start >= size) return 'unsatisfiable';
  if (end < start) return null;
  return [start, end - start + 1];
}

async function raw(request: Request, env: Env, itemId: string, url: URL): Promise<Response> {
  const rest = url.pathname.slice('/s/'.length);
  const slash = rest.indexOf('/');
  if (slash <= 0) return refuse(env, 404, 'not_found');
  const token = rest.slice(0, slash);
  let path: string;
  try {
    path = rest.slice(slash + 1).split('/').map(decodeURIComponent).join('/');
  } catch {
    return refuse(env, 404, 'not_found');
  }
  const g = await verify(env, itemId, token);
  if (g instanceof Response) return g;
  if ('expired' in g) return expired(request, env, g.expired, path);
  const m = await manifestOf(env, itemId, g.version);
  if (m instanceof Response) return m;
  const f = fileOf(m, path);
  if (!f) return refuse(env, 404, 'not_found');

  const download = url.searchParams.get('download') === '1' || f.view === 'download';
  const disposition = download ? attachment(nameOf(path)) : 'inline';
  const headers = f.mediaType.startsWith('text/html') ? documentHeaders(env, f.mediaType, disposition) : subresourceHeaders(env, f.mediaType, disposition);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('ETag', `"${f.sha256}"`);
  cacheUntil(headers, g.exp);
  const key = `blobs/${f.sha256}`;
  if (request.method === 'HEAD') {
    if (!(await env.BLOBS.head(key))) return refuse(env, 410, 'gone');
    headers.set('Content-Length', String(f.bytes));
    return new Response(null, { headers });
  }
  const range = rangeOf(request.headers.get('range') ?? '', f.bytes);
  if (range === 'unsatisfiable') {
    const h = subresourceHeaders(env, 'application/json');
    h.set('Content-Range', `bytes */${f.bytes}`);
    return new Response(JSON.stringify({ error: 'range_not_satisfiable' }), { status: 416, headers: h });
  }
  const obj = await env.BLOBS.get(key, range ? { range: { offset: range[0], length: range[1] } } : undefined);
  if (!obj) return refuse(env, 410, 'gone');
  if (range) {
    const [start, length] = range;
    headers.set('Content-Range', `bytes ${start}-${start + length - 1}/${f.bytes}`);
    headers.set('Content-Length', String(length));
    return new Response(obj.body, { status: 206, headers });
  }
  headers.set('Content-Length', String(f.bytes));
  return new Response(obj.body, { headers });
}

async function serve(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return refuse(env, 405, 'method_not_allowed');
  const url = new URL(request.url);
  // `superlibrarycontent.dev`: hosts `<label>.superlibrarycontent.dev`. A domain that starts with `-`
  // (staging's `-stg.superlibrarycontent.dev`) is appended to the label itself, keeping one label.
  const suffix = env.CONTENT_DOMAIN.startsWith('-') ? env.CONTENT_DOMAIN : `.${env.CONTENT_DOMAIN}`;
  if (!url.hostname.endsWith(suffix)) return refuse(env, 404, 'not_found');
  const itemId = itemIdFromLabel(url.hostname.slice(0, -suffix.length));
  if (!itemId) return refuse(env, 404, 'not_found');

  if (url.pathname.startsWith('/_viewer/')) {
    // Unconditional: a 304 from the asset store would otherwise read as "not ok" and become a 404.
    const res = await env.VIEWER.fetch(new Request(url, { method: request.method }));
    if (!res.ok) return refuse(env, 404, 'not_found');
    // The bundle is the same for every token and holds no artifact bytes. Chunks have content hashes
    // in their names, so they keep; the entry files (viewer.js, viewer.css, expired.js) are
    // revalidated on every use, so one cached across a deploy never names a chunk that is gone.
    const headers = subresourceHeaders(env, res.headers.get('content-type') ?? 'application/octet-stream');
    const etag = res.headers.get('etag');
    if (etag) headers.set('ETag', etag);
    if (url.pathname.startsWith('/_viewer/chunks/')) {
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      headers.set('Cache-Control', 'no-cache');
      const asked = request.headers.get('if-none-match');
      if (etag && asked && asked.split(',').some((t) => t.trim().replace(/^W\//, '') === etag.replace(/^W\//, ''))) {
        await res.body?.cancel();
        return new Response(null, { status: 304, headers });
      }
    }
    return new Response(res.body, { headers });
  }
  if (url.pathname === '/_view') {
    const token = url.searchParams.get('sig') ?? '';
    const g = await verify(env, itemId, token);
    if (g instanceof Response) return g;
    if ('expired' in g) {
      const asked = url.searchParams.get('path');
      const m = asked === null ? await manifestOf(env, itemId, g.expired.version) : null;
      return expired(request, env, g.expired, asked ?? (m && !(m instanceof Response) ? m.entry : ''));
    }
    const m = await manifestOf(env, itemId, g.version);
    if (m instanceof Response) return m;
    // Operator: the host's Files list opens any file of the version (`path`, decoded once by
    // URLSearchParams, own keys only), and its toolbar can ask for the source of a text-backed one.
    const path = url.searchParams.get('path') ?? m.entry;
    const source = url.searchParams.get('source') === '1';
    const f = fileOf(m, path);
    if (!f) return refuse(env, 404, 'not_found');
    if (source) {
      if (!SOURCE_VIEWS.has(f.view)) return refuse(env, 404, 'not_found');
    } else if (f.view === 'html') {
      // Plan D9: the artifact's own page, under the signed path so its relative files resolve.
      const headers = documentHeaders(env, 'text/plain; charset=utf-8');
      headers.set('Location', `/s/${token}/${encodePath(path)}`);
      return new Response(null, { status: 302, headers });
    }
    const d = await viewerData(env, f, path, `${url.origin}/s/${token}/`, g.host, source);
    if (d instanceof Response) return d;
    return new Response(request.method === 'HEAD' ? null : viewerPage(d), { headers: cacheUntil(documentHeaders(env, 'text/html; charset=utf-8'), g.exp) });
  }
  if (url.pathname.startsWith('/s/')) return raw(request, env, itemId, url);
  return refuse(env, 404, 'not_found');
}

export default {
  async fetch(request, env, _ctx) {
    // Ruling T11: with no hosts to name, frame-ancestors cannot limit framing. Serve nothing.
    if (frameAncestors(env).length === 0) return new Response(JSON.stringify({ error: 'not_configured' }), { status: 500, headers: unconfiguredHeaders() });
    return serve(request, env);
  },
} satisfies ExportedHandler<Env>;
