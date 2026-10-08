import type { JWTPayload } from 'jose';
import type { Env } from '../env';
import { verifyJws } from './jws';

export const ORG_PLANE_PRODUCT = 'superlibrary';
export const ORG_PLANE_SOURCE = 'org-plane';
const PRN = /^prn_[0-9a-f]{20}$/;
const ORG = /^org_[0-9a-f]{20}$/;

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

export interface OrgPlaneClaims extends JWTPayload {
  sub: string;
  principalKind: 'human' | 'agent' | 'service';
  org: string;
  ent: string[];
  scope?: string;
  act?: { sub?: string };
}

const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

export async function verifyOrgPlaneToken(token: string, cfg: OrgPlaneConfig): Promise<OrgPlaneClaims | null> {
  const p = await verifyJws(token, { issuer: cfg.issuer, jwksUrl: cfg.jwksUrl, audience: cfg.audience, requiredClaims: ['exp', 'iat', 'jti', 'sub'] });
  if (!p) return null;
  if (typeof p.sub !== 'string' || !PRN.test(p.sub)) return null;
  const kind = p.principalKind;
  if (kind !== 'human' && kind !== 'agent' && kind !== 'service') return null;
  if (typeof p.org !== 'string' || !ORG.test(p.org)) return null;
  if (!strings(p.ent)) return null;
  return p as OrgPlaneClaims;
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
