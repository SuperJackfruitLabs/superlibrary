// apps/api/src/search/routes.ts (created here; B5 and B6 add the search, get and related routes)
import type { Handler } from '../http';
import { error, json } from '../http';
import { resolvePerson } from '../auth/caller';
import { reconcile } from '../indexing/consumer';

const isOperator = (env: { OPERATORS?: string }, prn: string) => (env.OPERATORS ?? '').split(/\s+/).includes(prn);

export const searchRoutes: Handler = async (request, env, _ctx, url) => {
  if (url.pathname === '/api/v1/admin/index/reconcile' && request.method === 'POST') {
    const p = await resolvePerson(request, env);
    if (p instanceof Response) return p;
    if (!isOperator(env, p.principalId)) return error(403, 'not_permitted');
    return json(await reconcile(env), 202);
  }
  return null;
};
