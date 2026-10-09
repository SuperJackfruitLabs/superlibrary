import { describe, expect, it } from 'vitest';
import { parseToken, signingMessage } from '@superlibrary/contract';
import { signContent } from '../src/items/sign';
import type { Env } from '../src/env';

// Node 24+ exports Ed25519 JWKs with `"alg":"Ed25519"`; workerd imports only "EdDSA" or none.
describe('the URL signing key', () => {
  it('signs with a private JWK whichever runtime exported it', async () => {
    const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    const { alg: _alg, ...bare } = (await crypto.subtle.exportKey('jwk', pair.privateKey)) as JsonWebKey;
    const g = { itemId: 'itm_00000000000000a1', version: 1, exp: 2_000_000_000, host: 'https://app.test' };
    for (const alg of ['Ed25519', 'EdDSA', undefined]) {
      const env = { URL_SIGNING_PRIVATE_KEY: JSON.stringify(alg ? { ...bare, alg } : bare) } as unknown as Env;
      const t = parseToken(await signContent(env, g))!;
      expect(await crypto.subtle.verify('Ed25519', pair.publicKey, t.sig, signingMessage(g)), String(alg)).toBe(true);
    }
  });
});
