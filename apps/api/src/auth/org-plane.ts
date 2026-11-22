import {
  AccessTokenError,
  createJwksCache,
  verifyAccessToken,
  type AccessTokenClaims,
  type AccessTokenErrorCode,
  type JwksCache,
} from '@superjackfruitlabs/treaty-ecosystem-identity';
import { decodeJwt, decodeProtectedHeader } from 'jose';
import type { Env } from '../env';

export const ORG_PLANE_PRODUCT = 'superlibrary';
export const ORG_PLANE_SOURCE = 'org-plane';

export interface OrgPlaneConfig { issuer: string; jwksUrl: string; audience: string }
export type OrgPlaneMode = { kind: 'off' } | { kind: 'invalid'; reason: string } | { kind: 'on'; cfg: OrgPlaneConfig };

/** https (http only on loopback), no credentials, query or fragment; else null. */
function safeUrl(raw: string | undefined): string | null {
  const s = (raw ?? '').trim();
  if (s === '') return null;
  try {
    const u = new URL(s);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && loopback)) return null;
    if (u.username || u.password || u.search || u.hash) return null;
    return s;
  } catch {
    return null;
  }
}

export function orgPlaneMode(env: Pick<Env, 'ORG_PLANE_ISSUER' | 'ORG_PLANE_JWKS_URL' | 'ORG_PLANE_AUDIENCE'>): OrgPlaneMode {
  if ((env.ORG_PLANE_ISSUER ?? '').trim() === '') return { kind: 'off' };
  const issuer = safeUrl(env.ORG_PLANE_ISSUER);
  if (!issuer) return { kind: 'invalid', reason: 'ORG_PLANE_ISSUER' };
  const jwksUrl = safeUrl(env.ORG_PLANE_JWKS_URL);
  if (!jwksUrl) return { kind: 'invalid', reason: 'ORG_PLANE_JWKS_URL' };
  const audience = safeUrl(env.ORG_PLANE_AUDIENCE);
  if (!audience) return { kind: 'invalid', reason: 'ORG_PLANE_AUDIENCE' };
  return { kind: 'on', cfg: { issuer, jwksUrl, audience } };
}

/** What the caller rules read. A verified token carries every claim; dev auth makes only these. */
export type OrgPlaneClaims = Pick<AccessTokenClaims, 'sub' | 'principalKind' | 'org' | 'ent' | 'act' | 'amr' | 'scope'>;

/**
 * One key-set cache per JWKS URL for the isolate's life: treaty's, with its rules (3 s timeout,
 * stale while revalidate, an unknown kid refetched at most once per 30 s, the last good set kept
 * while the issuer is down). Its fetch is looked up per call, so a test's stub is the one used.
 */
const caches = new Map<string, JwksCache>();

export function __resetJwksCacheForTests(): void {
  caches.clear();
}

function keysAt(url: string): JwksCache {
  let c = caches.get(url);
  if (!c) {
    c = createJwksCache({ url, fetch: (input, init) => fetch(input, init) });
    caches.set(url, c);
  }
  return c;
}

/** The header's kid when it is worth fetching keys for: an EdDSA header naming a kid. */
function fetchableKid(token: string): string | null {
  try {
    const h = decodeProtectedHeader(token);
    return h.alg === 'EdDSA' && typeof h.kid === 'string' && h.kid !== '' ? h.kid : null;
  } catch {
    return null;
  }
}

export type TokenCheck =
  | { ok: true; claims: AccessTokenClaims }
  /** `claims` only with product_not_enabled: the token is otherwise good, and the caller answers 403 with its org. */
  | { ok: false; code: AccessTokenErrorCode; claims?: AccessTokenClaims };

/**
 * Treaty's verifyAccessToken, fed from the key-set cache. A malformed header, another algorithm or
 * a missing kid never costs a fetch: the verifier is given no keys and refuses with its own code.
 */
export async function checkToken(
  token: string,
  o: { keys: JwksCache; issuer: string; audience: string; product: string; now?: number },
): Promise<TokenCheck> {
  const kid = fetchableKid(token);
  let jwks: { keys: unknown[] } = { keys: [] };
  if (kid !== null) {
    try {
      jwks = await o.keys.getKeys(kid);
    } catch {
      return { ok: false, code: 'unknown_key' }; // no key set was ever loaded
    }
  }
  try {
    const claims = await verifyAccessToken(token, { jwks, issuer: o.issuer, audience: o.audience, product: o.product, now: o.now });
    return { ok: true, claims };
  } catch (e) {
    if (!(e instanceof AccessTokenError)) return { ok: false, code: 'malformed' };
    // product_not_enabled is the verifier's last check, after the signature and every claim rule
    // (test/org-plane.test.ts pins that a second fault is refused first), so the payload is good.
    if (e.code === 'product_not_enabled') return { ok: false, code: e.code, claims: decodeJwt(token) as AccessTokenClaims };
    return { ok: false, code: e.code };
  }
}

/**
 * The verified claims, or null for every refusal (expired and forged are the same answer). A token
 * whose `ent` lacks Superlibrary comes back with its claims: the caller refuses it with 403
 * product_not_enabled, in the order its own rules check.
 */
export async function verifyOrgPlaneToken(token: string, cfg: OrgPlaneConfig): Promise<OrgPlaneClaims | null> {
  const r = await checkToken(token, { keys: keysAt(cfg.jwksUrl), issuer: cfg.issuer, audience: cfg.audience, product: ORG_PLANE_PRODUCT });
  return r.ok ? r.claims : (r.claims ?? null);
}

/** RFC 9728, as Superpipeline serves it (apps/api/src/mcp/auth.ts). Null when the plane is off. */
export function protectedResourceMetadata(env: Env): Response | null {
  const mode = orgPlaneMode(env);
  if (mode.kind !== 'on') return null;
  return Response.json({
    resource: mode.cfg.audience,
    authorization_servers: [mode.cfg.issuer],
    bearer_methods_supported: ['header'],
    scopes_supported: ['openid', 'profile', 'email', 'offline_access'],
    resource_name: 'Superlibrary',
  });
}
