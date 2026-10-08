import { env } from 'cloudflare:test';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import { __resetJwksCacheForTests } from '../../src/auth/jws';

export const PLANE = 'https://accounts.test';
export const PLANE_JWKS = `${PLANE}/api/auth/jwks`;
export const APP_AUD = 'https://api.test';
export const ORG = 'org_00000000000000000a01';
export const OTHER_ORG = 'org_00000000000000000b02';
export const HUMAN = 'prn_000000000000000000a1';
export const HUMAN_2 = 'prn_000000000000000000a5';
export const AGENT = 'prn_000000000000000000a2';
export const KID = 'plane-kid-1';

export const PLANE_ENV = { ORG_PLANE_ISSUER: PLANE, ORG_PLANE_JWKS_URL: PLANE_JWKS, ORG_PLANE_AUDIENCE: APP_AUD } as const;

let once: Promise<{ privateKey: CryptoKey; jwksBody: string }> | null = null;
export function planeKeys() {
  once ??= (async () => {
    const pair = await generateKeyPair('EdDSA', { extractable: true });
    const jwk = await exportJWK(pair.publicKey);
    return { privateKey: pair.privateKey, jwksBody: JSON.stringify({ keys: [{ ...jwk, alg: 'EdDSA', kid: KID }] }) };
  })();
  return once;
}

/** A human in ORG entitled to superlibrary, `aud` as the array the OAuth provider issues. */
export async function planeToken(
  over: Record<string, unknown> = {},
  opts: { aud?: string | string[]; iss?: string; kid?: string; exp?: string; alg?: 'EdDSA' } = {},
): Promise<string> {
  const { privateKey } = await planeKeys();
  const payload: Record<string, unknown> = {
    sub: HUMAN, principalKind: 'human', org: ORG, ent: ['superlibrary'], mayDispatch: [], mayGrantReach: false,
    jti: crypto.randomUUID(), email: 'person@example.com', email_verified: true, ...over,
  };
  for (const [k, v] of Object.entries(payload)) if (v === undefined) delete payload[k];
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'EdDSA', kid: opts.kid ?? KID })
    .setIssuer(opts.iss ?? PLANE)
    .setAudience(opts.aud ?? [APP_AUD, `${PLANE}/api/auth/oauth2/userinfo`])
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? '5m')
    .sign(privateKey);
}

/** Plane mode on for SELF.fetch tests; every outbound URL recorded so "no network" is measured. */
export async function withOrgPlane<T>(fn: (calls: string[]) => Promise<T>): Promise<T> {
  const { jwksBody } = await planeKeys();
  const realFetch = globalThis.fetch;
  const calls: string[] = [];
  const bag = env as unknown as Record<string, unknown>;
  Object.assign(bag, PLANE_ENV);
  __resetJwksCacheForTests();
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    calls.push(url);
    if (url === PLANE_JWKS) return new Response(jwksBody, { headers: { 'content-type': 'application/json' } });
    return realFetch(input as RequestInfo, init);
  }) as typeof fetch;
  try {
    return await fn(calls);
  } finally {
    globalThis.fetch = realFetch;
    for (const k of Object.keys(PLANE_ENV)) bag[k] = '';
    __resetJwksCacheForTests();
  }
}

/** DEV_AUTH headers (the suite runs with DEV_AUTH on, plane off). */
export function devHeaders(principal = HUMAN, org = ORG): Record<string, string> {
  return { 'X-Dev-Principal': principal, 'X-Dev-Org': org };
}
