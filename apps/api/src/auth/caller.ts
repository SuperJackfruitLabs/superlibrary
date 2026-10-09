/**
 * Who is calling: a person in an entitled workspace, or a refusal. The workspace is created on first
 * sight (issuer contract §2), the person joins it as owner if first, member otherwise — one
 * statement each, as Superpipeline's ensureOrgTenant/provisionOrgHuman do, so concurrent first
 * requests cannot make two workspaces or two owners.
 */
import type { Env } from '../env';
import { error } from '../http';
import { newId } from '../ids';
import { ORG_PLANE_PRODUCT, ORG_PLANE_SOURCE, orgPlaneMode, verifyOrgPlaneToken, type OrgPlaneClaims } from './org-plane';

export interface Person {
  principalId: string;
  org: string;
  workspaceId: string;
  role: 'owner' | 'member';
  act: string | null;
}

const PRN = /^prn_[0-9a-f]{20}$/;
const ORG = /^org_[0-9a-f]{20}$/;

function bearerOf(request: Request): string | null {
  const m = (request.headers.get('Authorization') ?? '').match(/^Bearer\s+(.+)$/i);
  return m ? m[1]!.trim() : null;
}

function signInRequired(env: Env): Response {
  const res = error(401, 'sign_in_required');
  res.headers.set('WWW-Authenticate', `Bearer resource_metadata="${env.APP_URL}/.well-known/oauth-protected-resource"`);
  return res;
}

/**
 * The workspace and the caller's role in it: one read when both exist (every request after the
 * first), else one batch that creates whichever is missing and reads the result. Each D1 round trip
 * crosses to the database's region, so a request pays one, not four.
 */
const MEMBERSHIP = `SELECT w.id AS workspace_id, m.role FROM workspaces w JOIN members m ON m.workspace_id = w.id AND m.principal_id = ?3
  WHERE w.external_source = ?1 AND w.external_id = ?2`;

export async function ensureMembership(db: D1Database, org: string, principalId: string): Promise<{ workspaceId: string; role: 'owner' | 'member' }> {
  type Row = { workspace_id: string; role: 'owner' | 'member' };
  const known = await db.prepare(MEMBERSHIP).bind(ORG_PLANE_SOURCE, org, principalId).first<Row>();
  if (known) return { workspaceId: known.workspace_id, role: known.role };
  const [, , read] = await db.batch<Row>([
    db.prepare(`INSERT OR IGNORE INTO workspaces (id, external_source, external_id) VALUES (?, ?, ?)`).bind(newId('wsp'), ORG_PLANE_SOURCE, org),
    // First member is the owner, everyone after a member: decided inside the statement, so two
    // concurrent first requests cannot make two owners.
    db.prepare(
      `INSERT OR IGNORE INTO members (workspace_id, principal_id, role)
       SELECT w.id, ?3, CASE WHEN EXISTS (SELECT 1 FROM members WHERE workspace_id = w.id) THEN 'member' ELSE 'owner' END
       FROM workspaces w WHERE w.external_source = ?1 AND w.external_id = ?2`,
    ).bind(ORG_PLANE_SOURCE, org, principalId),
    db.prepare(MEMBERSHIP).bind(ORG_PLANE_SOURCE, org, principalId),
  ]);
  const row = read?.results[0];
  if (!row) throw new Error('first sight could not record the workspace membership');
  return { workspaceId: row.workspace_id, role: row.role };
}

async function claimsOf(request: Request, env: Env): Promise<OrgPlaneClaims | Response> {
  const mode = orgPlaneMode(env);
  if (mode.kind === 'invalid') return error(500, 'misconfigured', { setting: mode.reason });
  if (mode.kind === 'off') {
    if (env.DEV_AUTH !== 'true') return signInRequired(env);
    const sub = request.headers.get('X-Dev-Principal') ?? '';
    const org = request.headers.get('X-Dev-Org') ?? '';
    if (!PRN.test(sub) || !ORG.test(org)) return signInRequired(env);
    return { sub, org, principalKind: 'human', ent: [ORG_PLANE_PRODUCT] };
  }
  const token = bearerOf(request);
  if (!token || token.split('.').length !== 3) return signInRequired(env);
  return (await verifyOrgPlaneToken(token, mode.cfg)) ?? signInRequired(env);
}

export async function resolvePerson(request: Request, env: Env): Promise<Person | Response> {
  const claims = await claimsOf(request, env);
  if (claims instanceof Response) return claims;
  if (!claims.ent.includes(ORG_PLANE_PRODUCT)) return error(403, 'product_not_enabled', { org: claims.org });
  if (claims.principalKind !== 'human') {
    return error(403, 'principal_not_supported', { detail: 'only a person may use Superlibrary in this release' });
  }
  const { workspaceId, role } = await ensureMembership(env.DB, claims.org, claims.sub);
  return { principalId: claims.sub, org: claims.org, workspaceId, role, act: typeof claims.act?.sub === 'string' ? claims.act.sub : null };
}
