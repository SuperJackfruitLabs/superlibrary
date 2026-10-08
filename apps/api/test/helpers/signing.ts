import { env } from 'cloudflare:test';

let pair: Promise<CryptoKeyPair> | null = null;

/** A test Ed25519 pair; the private half is set as the Worker's signing secret. Returns the public key. */
export async function useSigningKey(): Promise<CryptoKey> {
  pair ??= crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']) as Promise<CryptoKeyPair>;
  const { privateKey, publicKey } = await pair;
  (env as unknown as Record<string, unknown>).URL_SIGNING_PRIVATE_KEY = JSON.stringify(await crypto.subtle.exportKey('jwk', privateKey));
  return publicKey;
}
