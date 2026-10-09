// apps/api/src/search/routes.ts (created here; B5 and B6 add the search, get and related routes)
import type { Handler } from '../http';
import { error, json, preflight, withCors } from '../http';
import { resolvePerson, resolveViewer, serviceCaller } from '../auth/caller';
import { RelatedQuery, SearchQuery } from '@superlibrary/contract';
import { searchAudited } from './search';
import { getForViewer, related } from './related';
import { invalidateRoster } from '../clients/roster';
import { reconcile } from '../indexing/consumer';
import { cancelReindex, resumeReindex, startReindex } from '../indexing/reindex';

const isOperator = (env: { OPERATORS?: string }, prn: string) => (env.OPERATORS ?? '').split(/\s+/).includes(prn);

export const searchRoutes: Handler = async (request, env, _ctx, url) => {
  if (url.pathname === '/api/v1/admin/index/reconcile' && request.method === 'POST') {
    const p = await resolvePerson(request, env);
    if (p instanceof Response) return p;
    if (!isOperator(env, p.principalId)) return error(403, 'not_permitted');
    return json(await reconcile(env), 202);
  }
  if (url.pathname === '/api/v1/admin/index/reindex' && request.method === 'POST') {
    const p = await resolvePerson(request, env);
    if (p instanceof Response) return p;
    if (!isOperator(env, p.principalId)) return error(403, 'not_permitted');
    const body = (await request.json().catch(() => null)) as { embedder?: string } | null;
    if (!body || typeof body.embedder !== 'string' || !body.embedder) return error(400, 'invalid');
    try {
      return json(await startReindex(env, body.embedder), 202);
    } catch (e) {
      const m = e instanceof Error ? e.message : '';
      if (m === 'reindex_running') return error(409, 'reindex_running');
      if (m === 'slot_not_drained') return error(409, 'slot_not_drained');
      if (m === 'dimension_mismatch') return error(400, 'dimension_mismatch');
      if (m.startsWith('unknown embedder')) return error(400, 'unknown_embedder');
      throw e;
    }
  }
  if ((url.pathname === '/api/v1/admin/index/reindex/cancel' || url.pathname === '/api/v1/admin/index/reindex/resume') && request.method === 'POST') {
    const p = await resolvePerson(request, env);
    if (p instanceof Response) return p;
    if (!isOperator(env, p.principalId)) return error(403, 'not_permitted');
    try {
      return json(url.pathname.endsWith('/cancel') ? await cancelReindex(env) : await resumeReindex(env), 202);
    } catch (e) {
      if (e instanceof Error && e.message === 'no_reindex') return error(404, 'no_reindex');
      throw e;
    }
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
    return json({ results: await searchAudited(env, v, q.data) });
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
  if (url.pathname === '/api/v1/related') {
    if (request.method === 'OPTIONS') return preflight(request, env.EMBED_HOSTS, 'POST');
    if (request.method !== 'POST') return null;
    const v = await resolveViewer(request, env);
    if (v instanceof Response) return withCors(request, env.EMBED_HOSTS, v);
    const q = RelatedQuery.safeParse(await request.json().catch(() => null));
    if (!q.success) return withCors(request, env.EMBED_HOSTS, error(400, 'invalid'));
    return withCors(request, env.EMBED_HOSTS, json({ items: await related(env, v, q.data) }));
  }
  return null;
};
