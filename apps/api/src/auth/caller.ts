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

export async function ensureWorkspace(db: D1Database, org: string): Promise<string> {
  await db
    .prepare(`INSERT OR IGNORE INTO workspaces (id, external_source, external_id) VALUES (?, ?, ?)`)
    .bind(newId('wsp'), ORG_PLANE_SOURCE, org)
    .run();
  const row = await db.prepare(`SELECT id FROM workspaces WHERE external_source = ? AND external_id = ?`).bind(ORG_PLANE_SOURCE, org).first<{ id: string }>();
  if (!row) throw new Error('first sight could not create the workspace');
  return row.id;
}

export async function ensureMember(db: D1Database, workspaceId: string, principalId: string): Promise<'owner' | 'member'> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO members (workspace_id, principal_id, role)
       SELECT ?1, ?2, CASE WHEN EXISTS (SELECT 1 FROM members WHERE workspace_id = ?1) THEN 'member' ELSE 'owner' END`,
    )
    .bind(workspaceId, principalId)
    .run();
  const row = await db.prepare(`SELECT role FROM members WHERE workspace_id = ? AND principal_id = ?`).bind(workspaceId, principalId).first<{ role: 'owner' | 'member' }>();
  if (!row) throw new Error('could not record the membership');
  return row.role;
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
  const workspaceId = await ensureWorkspace(env.DB, claims.org);
  const role = await ensureMember(env.DB, workspaceId, claims.sub);
  return { principalId: claims.sub, org: claims.org, workspaceId, role, act: typeof claims.act?.sub === 'string' ? claims.act.sub : null };
}
