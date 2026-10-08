import { contentLabel, formatToken, signingMessage, type ContentGrant } from '@superlibrary/contract';
import type { Env } from '../env';

let cached: { jwk: string; key: Promise<CryptoKey> } | null = null;

function signingKey(env: Env): Promise<CryptoKey> {
  const jwk = env.URL_SIGNING_PRIVATE_KEY;
  if (!jwk) throw new Error('URL_SIGNING_PRIVATE_KEY is not set');
  if (cached?.jwk !== jwk) cached = { jwk, key: crypto.subtle.importKey('jwk', JSON.parse(jwk), { name: 'Ed25519' }, false, ['sign']) };
  return cached.key;
}

/** The API holds the signing half; the content Worker only the verification half (spec §6). */
export async function signContent(env: Env, g: ContentGrant): Promise<string> {
  const sig = new Uint8Array(await crypto.subtle.sign('Ed25519', await signingKey(env), signingMessage(g)));
  return formatToken({ version: g.version, exp: g.exp, host: g.host, sig });
}

export function contentOrigin(env: Env, itemId: string): string {
  return env.CONTENT_ORIGIN_TEMPLATE.replace('{label}', contentLabel(itemId));
}
