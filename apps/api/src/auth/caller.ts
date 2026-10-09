/**
 * Who is calling: a person or an agent in an entitled workspace, or a refusal. The workspace is
 * created on first sight (issuer contract §2), a person joins it as owner if first, member
 * otherwise, and an agent never joins (plan P13) — one statement each, as Superpipeline's ensureOrgTenant/provisionOrgHuman do, so concurrent first
 * requests cannot make two workspaces or two owners.
 */
import type { Env } from '../env';
import { audit } from '../audit';
import { error } from '../http';
import { newId } from '../ids';
import { ORG_PLANE_PRODUCT, ORG_PLANE_SOURCE, orgPlaneMode, verifyOrgPlaneToken, type OrgPlaneClaims } from './org-plane';

export interface Person {
  kind: 'human';
  principalId: string;
  org: string;
  workspaceId: string;
  role: 'owner' | 'member';
  /** `act.sub` of the person's token, when present. Recorded, never a trust signal: every hub-minted token carries the hub here. Trust keys on `via`. */
  act: string | null;
}
export interface AgentViewer {
  kind: 'agent';
  principalId: string;
  org: string;
  workspaceId: string;
  /** Recorded, never a trust signal: every hub-minted token carries the hub here. Trust keys on `via`. */
  act: string | null;
  /** The hub's prn when the agent came through the hub (plan P1), else null. The only field a source-trust check may key on. */
  via: string | null;
}
export type Viewer = Person | AgentViewer;
/** Who may open an upload session (`via` is the only field a source-trust check may key on): a person, or an agent through the hub only (plan P1). */
export type Uploader = Person | (AgentViewer & { via: string; role: 'member' });

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

/** The workspace row only, never a member row: agents read and link, they never join (plan P13). */
export async function ensureWorkspace(db: D1Database, org: string): Promise<string> {
  const read = () => db.prepare(`SELECT id FROM workspaces WHERE external_source = ? AND external_id = ?`).bind(ORG_PLANE_SOURCE, org);
  const known = await read().first<{ id: string }>();
  if (known) return known.id;
  const [, r] = await db.batch<{ id: string }>([
    db.prepare(`INSERT OR IGNORE INTO workspaces (id, external_source, external_id) VALUES (?, ?, ?)`).bind(newId('wsp'), ORG_PLANE_SOURCE, org),
    read(),
  ]);
  const row = r?.results[0];
  if (!row) throw new Error('first sight could not record the workspace');
  return row.id;
}

/** HUB_SERVICE_PRINCIPAL when it is exactly one prn; anything else trusts nobody (fail closed). */
function hubPrincipal(env: Env): string | null {
  const v = env.HUB_SERVICE_PRINCIPAL ?? '';
  return PRN.test(v) ? v : null;
}

/** Whether `prn` is the AgentPod hub's service principal (plan P1). Lane A believes a link source only from it. */
export function isHubService(env: Env, prn: string | null): boolean {
  const hub = hubPrincipal(env);
  return hub !== null && prn === hub;
}

const ON_BEHALF = ['X-On-Behalf-Of', 'X-On-Behalf-Kind', 'X-On-Behalf-Token'] as const;
const carriesOnBehalf = (request: Request) => ON_BEHALF.some((h) => request.headers.has(h));
const where = (request: Request) => ({ method: request.method, path: new URL(request.url).pathname });

/**
 * A refused X-On-Behalf use, audited (guard d). The audit is best effort: a failed write must not
 * turn a refusal into a 500.
 */
async function refusal(env: Env, request: Request, sub: string, reason: string, res = error(403, 'principal_not_supported', { detail: reason })): Promise<Response> {
  const named = request.headers.get('X-On-Behalf-Of');
  try {
    await audit(env.DB, {
      workspaceId: null, actor: sub, act: null, action: 'on_behalf.refused',
      detail: { reason, named: named !== null && PRN.test(named) ? named : null, ...where(request) },
    }).run();
  } catch (e) {
    console.error('on_behalf.refused not audited', e instanceof Error ? e.message : String(e));
  }
  return res;
}

/** An unentitled caller: the same refusal either way, audited when it tried to act for someone (guard d). */
function notEnabled(env: Env, request: Request, claims: OrgPlaneClaims, carries: boolean): Promise<Response> | Response {
  const res = error(403, 'product_not_enabled', { org: claims.org });
  return carries ? refusal(env, request, claims.sub, 'product not enabled', res) : res;
}

type Resolved = { kind: 'human' | 'agent'; principalId: string; org: string; act: string | null; via: string | null };

/**
 * The hub acting for an agent (plan P1 with the operator's guards): the hub names the agent and
 * proves it with the agent's own plane token, minted by Accounts for the hub. Every check must hold.
 */
async function agentThroughHub(request: Request, env: Env, svc: OrgPlaneClaims, hub: string): Promise<Resolved | Response> {
  const who = request.headers.get('X-On-Behalf-Of');
  const kind = request.headers.get('X-On-Behalf-Kind');
  const proof = request.headers.get('X-On-Behalf-Token');
  const refuse = (reason: string) => refusal(env, request, svc.sub, reason);
  if (who === null) return refuse('X-On-Behalf-Of must name the agent');
  if (!PRN.test(who)) return refusal(env, request, svc.sub, 'X-On-Behalf-Of is not a prn', error(400, 'invalid', { detail: 'X-On-Behalf-Of must be a prn' }));
  if (kind !== 'agent') return refuse('the hub acts only for agents');
  if (proof === null) return refuse('X-On-Behalf-Token is required');
  const mode = orgPlaneMode(env);
  const claims = mode.kind === 'on' && proof.split('.').length === 3 ? await verifyOrgPlaneToken(proof, mode.cfg) : null;
  if (!claims) return refuse('the agent proof did not verify');
  if (claims.principalKind !== 'agent') return refuse('the agent proof is not an agent token');
  if (claims.sub !== who) return refuse('the agent proof names another principal');
  if (claims.org !== svc.org) return refuse('the agent proof is for another workspace');
  if (claims.act?.sub !== hub) return refuse('the agent proof was not minted for the hub');
  if (!claims.ent.includes(ORG_PLANE_PRODUCT)) return refuse('the agent is not entitled to Superlibrary');
  return { kind: 'agent', principalId: who, org: svc.org, act: svc.sub, via: svc.sub };
}

/**
 * The principal a request speaks for. A person's or an agent's own token speaks for itself and may
 * not name anyone else. A service speaks only for an agent, and only when it is the hub (guards a, b, e).
 */
async function principalOf(request: Request, env: Env): Promise<Resolved | Response> {
  const claims = await claimsOf(request, env);
  if (claims instanceof Response) return claims;
  const carries = carriesOnBehalf(request);
  if (!claims.ent.includes(ORG_PLANE_PRODUCT)) return notEnabled(env, request, claims, carries);
  if (claims.principalKind === 'service') {
    const hub = hubPrincipal(env);
    if (hub === null || claims.sub !== hub) {
      const reason = 'only the AgentPod hub may act for an agent';
      return carries ? refusal(env, request, claims.sub, reason) : error(403, 'principal_not_supported', { detail: 'this service may not act in Superlibrary' });
    }
    if (!carries) return error(403, 'principal_not_supported', { detail: 'a service speaks only for an agent it names' });
    return agentThroughHub(request, env, claims, hub);
  }
  if (carries) return refusal(env, request, claims.sub, 'only the AgentPod hub may act for another principal');
  const act = typeof claims.act?.sub === 'string' ? claims.act.sub : null;
  return { kind: claims.principalKind, principalId: claims.sub, org: claims.org, act, via: null };
}

async function asPerson(env: Env, r: Resolved): Promise<Person> {
  const { workspaceId, role } = await ensureMembership(env.DB, r.org, r.principalId);
  return { kind: 'human', principalId: r.principalId, org: r.org, workspaceId, role, act: r.act };
}

/** An agent never becomes a member. A use through the hub is audited, and an unaudited one fails. */
async function asAgent(request: Request, env: Env, r: Resolved): Promise<AgentViewer> {
  const workspaceId = await ensureWorkspace(env.DB, r.org);
  if (r.via !== null) {
    await audit(env.DB, { workspaceId, actor: r.principalId, act: r.via, action: 'on_behalf.accepted', detail: where(request) }).run();
  }
  return { kind: 'agent', principalId: r.principalId, org: r.org, workspaceId, act: r.act, via: r.via };
}

/** People only: every write route except an agent's link (plan P13). */
export async function resolvePerson(request: Request, env: Env): Promise<Person | Response> {
  const r = await principalOf(request, env);
  if (r instanceof Response) return r;
  if (r.kind !== 'human') {
    const res = error(403, 'principal_not_supported', { detail: 'only a person may use Superlibrary in this release' });
    return r.via !== null ? refusal(env, request, r.via, 'only a person may do this', res) : res;
  }
  return asPerson(env, r);
}

/** Reads: people and agents (search, get, related, MCP). Agents never become members. */
export async function resolveViewer(request: Request, env: Env): Promise<Viewer | Response> {
  const r = await principalOf(request, env);
  if (r instanceof Response) return r;
  if (r.kind === 'human') return asPerson(env, r);
  return asAgent(request, env, r);
}

/** Upload sessions: a person, or an agent ONLY through the hub (spec §5: never directly). */
export async function resolveUploader(request: Request, env: Env): Promise<Uploader | Response> {
  const r = await principalOf(request, env);
  if (r instanceof Response) return r;
  if (r.kind === 'human') return asPerson(env, r);
  const via = r.via;
  if (via === null) return error(403, 'principal_not_supported', { detail: 'agents link files through AgentPod, never directly' });
  return { ...(await asAgent(request, env, r)), via, role: 'member' };
}

/** For-itself routes (roster invalidation, Task B4): the hub's own service token, naming no one. */
export async function serviceCaller(request: Request, env: Env): Promise<{ sub: string; org: string } | Response> {
  const claims = await claimsOf(request, env);
  if (claims instanceof Response) return claims;
  const carries = carriesOnBehalf(request);
  if (claims.principalKind !== 'service' || !isHubService(env, claims.sub)) {
    const reason = 'only the AgentPod hub may call this';
    return carries ? refusal(env, request, claims.sub, reason) : error(403, 'principal_not_supported', { detail: reason });
  }
  if (!claims.ent.includes(ORG_PLANE_PRODUCT)) return notEnabled(env, request, claims, carries);
  if (carries) return refusal(env, request, claims.sub, 'this route acts for the hub itself and names no one');
  return { sub: claims.sub, org: claims.org };
}
