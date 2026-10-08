/**
 * Offline verification of organization-plane tokens, copied from Superpipeline
 * (apps/api/src/auth/hub-jwt.ts): the key set is fetched by us, not by jose's createRemoteJWKSet,
 * so no failure escapes as an unhandled rejection; no network in the verify path while the cache
 * is warm; one refetch on an unknown kid; the last good set served when the issuer is down.
 */
import { createLocalJWKSet, jwtVerify, type JSONWebKeySet, type JWTPayload } from 'jose';

export interface JwsOptions {
  issuer: string;
  jwksUrl: string;
  /** This deployment's resource. Required, never defaulted to the issuer (Superpipeline 2026-09-20). */
  audience: string;
  requiredClaims: string[];
  fetch?: typeof fetch;
}

interface CachedSet {
  keys: JSONWebKeySet;
  verify: ReturnType<typeof createLocalJWKSet>;
  fetchedAt: number;
}

const cache = new Map<string, CachedSet>();
const inflight = new Map<string, Promise<CachedSet | null>>();
/** Issuer contract §1: cache ≤ 10 minutes. */
const JWKS_TTL_MS = 10 * 60 * 1000;

export function __resetJwksCacheForTests(): void {
  cache.clear();
  inflight.clear();
}

function hasKid(set: CachedSet | undefined, kid: string): boolean {
  return !!set && set.keys.keys.some((k) => k.kid === kid);
}

function fetchFresh(opts: JwsOptions): Promise<CachedSet | null> {
  const existing = inflight.get(opts.jwksUrl);
  if (existing) return existing;
  const promise = (async (): Promise<CachedSet | null> => {
    try {
      const res = await (opts.fetch ?? fetch)(opts.jwksUrl);
      if (!res.ok) return null;
      const keys = (await res.json()) as JSONWebKeySet;
      if (!Array.isArray(keys?.keys) || keys.keys.length === 0) return null;
      const fresh: CachedSet = { keys, verify: createLocalJWKSet(keys), fetchedAt: Date.now() };
      cache.set(opts.jwksUrl, fresh);
      return fresh;
    } catch {
      return null;
    }
  })();
  inflight.set(opts.jwksUrl, promise);
  promise.finally(() => {
    if (inflight.get(opts.jwksUrl) === promise) inflight.delete(opts.jwksUrl);
  });
  return promise;
}

async function keySet(opts: JwsOptions, kid: string): Promise<CachedSet | null> {
  const cached = cache.get(opts.jwksUrl);
  const isFresh = !!cached && Date.now() - cached.fetchedAt < JWKS_TTL_MS;
  if (isFresh && hasKid(cached, kid)) return cached;
  // Fresh but missing this kid: a rotation. Refetch once and fail closed if that fails.
  if (isFresh) return fetchFresh(opts);
  // Cold or expired: refresh, serving the last good set if the issuer is down.
  return (await fetchFresh(opts)) ?? cached ?? null;
}

/** The verified payload, or null for every failure (expired and forged are the same answer). */
export async function verifyJws(token: string, opts: JwsOptions): Promise<JWTPayload | null> {
  if (!token) return null;
  const header = token.split('.')[0];
  if (!header) return null;
  let kid: string;
  try {
    const decoded = JSON.parse(atob(header.replace(/-/g, '+').replace(/_/g, '/'))) as { alg?: unknown; kid?: unknown };
    // Checked before any key lookup: a bad alg or a missing kid must never trigger a refetch.
    if (decoded.alg !== 'EdDSA') return null;
    if (typeof decoded.kid !== 'string' || decoded.kid === '') return null;
    kid = decoded.kid;
  } catch {
    return null;
  }
  try {
    const set = await keySet(opts, kid);
    if (!set || !hasKid(set, kid)) return null;
    const { payload } = await jwtVerify(token, set.verify, {
      issuer: opts.issuer,
      audience: opts.audience,
      requiredClaims: opts.requiredClaims,
      algorithms: ['EdDSA'],
    });
    return payload;
  } catch {
    return null;
  }
}
