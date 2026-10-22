// The staging content Worker's smoke, run by content-smoke.sh inside node with the workspace
// installed. `seed <dir>` writes a fixed probe item (manifest + blob) for wrangler to upload to
// superlibrary-blobs-staging; `check` signs a short URL for it with the API's staging key, the way
// the API does (apps/api/src/items/sign.ts), and asks the public `-stg` host for it.
import { mkdirSync, writeFileSync } from 'node:fs';

// packages/contract/src (content.ts, ids.ts), restated: this runs as plain node, outside the workspace.
const b64url = (b) => Buffer.from(b).toString('base64url');
const signingMessage = (t) => new TextEncoder().encode(`superlibrary-content/v1\n${t.itemId}\n${t.version}\n${t.exp}\n${t.host}`);
const formatToken = (t) => `${t.version}.${t.exp}.${b64url(new TextEncoder().encode(t.host))}.${b64url(t.sig)}`;
const contentLabel = (id) => id.replace('itm_', 'itm-');

const ITEM = 'itm_00000000000057a9';
const HOST = 'https://staging-app.superlibrary.dev';
const body = new TextEncoder().encode('# staging content smoke\n');
const sha = [...new Uint8Array(await crypto.subtle.digest('SHA-256', body))].map((x) => x.toString(16).padStart(2, '0')).join('');
const [cmd, dir] = process.argv.slice(2);

if (cmd === 'seed') {
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/blob`, body);
  writeFileSync(`${dir}/manifest.json`, JSON.stringify({ itemId: ITEM, version: 1, entry: 'smoke.md', expiresAt: null, files: { 'smoke.md': { sha256: sha, bytes: body.length, mediaType: 'text/markdown; charset=utf-8', view: 'markdown' } } }));
  console.log(`blobs/${sha} manifests/${ITEM}/1.json`);
} else {
  const jwk = JSON.parse(process.env.URL_SIGNING_PRIVATE_KEY);
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'Ed25519' }, false, ['sign']);
  const exp = Math.floor(Date.now() / 1000) + 120;
  const sig = new Uint8Array(await crypto.subtle.sign('Ed25519', key, signingMessage({ itemId: ITEM, version: 1, exp, host: HOST })));
  const origin = `https://${contentLabel(ITEM)}-stg.superlibrarycontent.dev`;
  const res = await fetch(`${origin}/_view?sig=${formatToken({ version: 1, exp, host: HOST, sig })}`);
  const html = await res.text();
  // The URL is a grant; it is never printed. The status and the item's text are.
  if (res.status !== 200 || !html.includes('staging content smoke')) { console.error(`content smoke: ${origin}/_view answered ${res.status}`); process.exit(1); }
  const bare = await fetch(`${origin}/_view`);
  if (bare.status === 200) { console.error('content smoke: an unsigned /_view answered 200'); process.exit(1); }
  console.log(`content smoke: ok (${origin}, signed 200, unsigned ${bare.status})`);
}
