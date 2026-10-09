// Generates the production Ed25519 pair and hands each half straight to `wrangler secret put` on
// stdin. Neither half touches a file or the terminal (Global Constraints: secrets never in files).
import { spawnSync } from 'node:child_process';
const { privateKey, publicKey } = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
const put = (pkg, name, value) => {
  const r = spawnSync('pnpm', ['--filter', pkg, 'exec', 'wrangler', 'secret', 'put', name], { input: value, stdio: ['pipe', 'inherit', 'inherit'] });
  if (r.status !== 0) throw new Error(`wrangler secret put ${name} failed`);
};
// The API and the content Worker drop `alg` before importing, so it is not sent.
const exportJwk = async (k) => {
  const jwk = await crypto.subtle.exportKey('jwk', k);
  delete jwk.alg;
  return JSON.stringify(jwk);
};
put('@superlibrary/api', 'URL_SIGNING_PRIVATE_KEY', await exportJwk(privateKey));
put('@superlibrary/content', 'URL_SIGNING_PUBLIC_KEY', await exportJwk(publicKey));
console.log('both halves set; nothing written to disk');
