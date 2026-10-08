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
  /** Key-set fetch timeout; default 3 s. An issuer that hangs must not stall every request. */
  timeoutMs?: number;
}

interface CachedSet {
  keys: JSONWebKeySet;
  verify: ReturnType<typeof createLocalJWKSet>;
  fetchedAt: number;
}

const cache = new Map<string, CachedSet>();
const inflight = new Map<string, Promise<CachedSet | null>>();
/** When the last refresh of each URL failed; no new attempt for BACKOFF_MS, so a down issuer costs one try per window. */
const failedAt = new Map<string, number>();
const BACKOFF_MS = 30 * 1000;
/** Issuer contract §1: cache ≤ 10 minutes. */
const JWKS_TTL_MS = 10 * 60 * 1000;

export function __resetJwksCacheForTests(): void {
  cache.clear();
  inflight.clear();
  failedAt.clear();
}

function hasKid(set: CachedSet | undefined, kid: string): boolean {
  return !!set && set.keys.keys.some((k) => k.kid === kid);
}

function fetchFresh(opts: JwsOptions): Promise<CachedSet | null> {
  const existing = inflight.get(opts.jwksUrl);
  if (existing) return existing;
  const failed = failedAt.get(opts.jwksUrl);
  if (failed !== undefined && Date.now() - failed < BACKOFF_MS) return Promise.resolve(null);
  const timeoutMs = opts.timeoutMs ?? 3000;
  const promise = (async (): Promise<CachedSet | null> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // The signal aborts a well-behaved fetch; the race bounds one that ignores it.
      const res = await Promise.race([
        (opts.fetch ?? fetch)(opts.jwksUrl, { signal: AbortSignal.timeout(timeoutMs) }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
        }),
      ]);
      if (!res.ok) throw new Error('status');
      const keys = (await res.json()) as JSONWebKeySet;
      if (!Array.isArray(keys?.keys) || keys.keys.length === 0) throw new Error('empty');
      const fresh: CachedSet = { keys, verify: createLocalJWKSet(keys), fetchedAt: Date.now() };
      cache.set(opts.jwksUrl, fresh);
      failedAt.delete(opts.jwksUrl);
      return fresh;
    } catch {
      failedAt.set(opts.jwksUrl, Date.now());
      return null;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
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
