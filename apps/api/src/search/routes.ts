// apps/api/src/search/routes.ts (created here; B5 and B6 add the search, get and related routes)
import type { Handler } from '../http';
import { error, json } from '../http';
import { resolvePerson, serviceCaller } from '../auth/caller';
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
  return null;
};
