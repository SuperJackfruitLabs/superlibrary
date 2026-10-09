// apps/api/src/search/routes.ts (created here; B5 and B6 add the search, get and related routes)
import type { Handler } from '../http';
import { error, json } from '../http';
import { resolvePerson, resolveViewer, serviceCaller } from '../auth/caller';
import { RelatedQuery, SearchQuery } from '@superlibrary/contract';
import { audit } from '../audit';
import { search } from './search';
import { getForViewer, related } from './related';
import { invalidateRoster } from '../clients/roster';
import { reconcile } from '../indexing/consumer';

const isOperator = (env: { OPERATORS?: string }, prn: string) => (env.OPERATORS ?? '').split(/\s+/).includes(prn);

export const searchRoutes: Handler = async (request, env, _ctx, url) => {
  if (url.pathname === '/api/v1/admin/index/reconcile' && request.method === 'POST') {
    const p = await resolvePerson(request, env);
    if (p instanceof Response) return p;
    if (!isOperator(env, p.principalId)) return error(403, 'not_permitted');
    return json(await reconcile(env), 202);
  }
  if (url.pathname === '/api/v1/roster/invalidate' && request.method === 'POST') {
    const claims = await serviceCaller(request, env);
    if (claims instanceof Response) return claims;
    const body = (await request.json().catch(() => null)) as { principal?: string } | null;
    if (!body?.principal || !/^prn_[0-9a-f]{20}$/.test(body.principal)) return error(400, 'invalid');
    await invalidateRoster(env, body.principal);
    return new Response(null, { status: 204 });
  }
  if (url.pathname === '/api/v1/search' && request.method === 'POST') {
    const v = await resolveViewer(request, env);
    if (v instanceof Response) return v;
    const q = SearchQuery.safeParse(await request.json().catch(() => null));
    if (!q.success) return error(400, 'invalid', { issues: q.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
    const results = await search(env, v, q.data);
    await audit(env.DB, { workspaceId: v.workspaceId, actor: v.principalId, act: v.act, action: 'items.searched', detail: { count: results.length, queryLength: q.data.query.length } }).run();
    return json({ results });
  }
  const lib = /^\/api\/v1\/library\/(itm_[0-9a-f]{16})$/.exec(url.pathname);
  if (lib && request.method === 'GET') {
    const v = await resolveViewer(request, env);
    if (v instanceof Response) return v;
    const ver = url.searchParams.get('version');
    const version = ver === null ? undefined : Number(ver);
    if (version !== undefined && (!Number.isInteger(version) || version < 1)) return error(400, 'invalid');
    const g = await getForViewer(env, v, lib[1]!, version);
    return g ? json({ item: g.result, text: g.text, wrapped: g.wrapped }) : error(404, 'not_found');
  }
  if (url.pathname === '/api/v1/related' && request.method === 'POST') {
    const v = await resolveViewer(request, env);
    if (v instanceof Response) return v;
    const q = RelatedQuery.safeParse(await request.json().catch(() => null));
    if (!q.success) return error(400, 'invalid');
    const items = await related(env, v, q.data);
    await audit(env.DB, { workspaceId: v.workspaceId, actor: v.principalId, act: v.act, action: 'items.related', detail: { count: items.length } }).run();
    return json({ items });
  }
  return null;
};
