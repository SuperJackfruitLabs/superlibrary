// A fresh Ed25519 pair for local dev and e2e: private half to the API, public half to the content
// Worker, as .dev.vars (gitignored). Production keys come from scripts/url-signing-key.mjs (Task 21).
import { writeFileSync } from 'node:fs';
const { privateKey, publicKey } = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
// Node 24+ exports Ed25519 JWKs with `"alg":"Ed25519"`, which workerd refuses to import (it knows
// only "EdDSA"). `alg` is optional, so the key is written without it and either runtime takes it.
const jwk = async (key) => {
  const { alg: _alg, ext: _ext, ...rest } = await crypto.subtle.exportKey('jwk', key);
  return JSON.stringify(rest);
};
const priv = await jwk(privateKey);
const pub = await jwk(publicKey);
writeFileSync(new URL('../apps/api/.dev.vars', import.meta.url), `URL_SIGNING_PRIVATE_KEY='${priv}'\n`);
writeFileSync(new URL('../apps/content/.dev.vars', import.meta.url), `URL_SIGNING_PUBLIC_KEY='${pub}'\n`);
console.log('wrote apps/api/.dev.vars and apps/content/.dev.vars');
