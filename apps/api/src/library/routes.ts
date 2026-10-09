import { BrowseQuery } from '@superlibrary/contract';
import { error, json, type Handler } from '../http';
import { resolvePerson } from '../auth/caller';
import { BadCursor, browse } from './browse';
import { facets } from './facets';
import { recordView } from './record';

export const issues = (e: { issues: Array<{ path: PropertyKey[]; message: string }> }) =>
  e.issues.map((i) => ({ path: i.path.map(String).join('.'), message: i.message }));

/**
 * The library app's routes (phase 4). People only: agents read through search, get, related and
 * MCP (P13, ruling B-R5), and `resolvePerson` refuses them here.
 */
export const libraryRoutes: Handler = async (request, env, _ctx, url) => {
  if (url.pathname === '/api/v1/browse' && request.method === 'POST') {
    const p = await resolvePerson(request, env);
    if (p instanceof Response) return p;
    const q = BrowseQuery.safeParse(await request.json().catch(() => null));
    if (!q.success) return error(400, 'invalid', { issues: issues(q.error) });
    try {
      return json(await browse(env, p, q.data));
    } catch (e) {
      if (e instanceof BadCursor) return error(400, 'invalid', { detail: 'cursor is not one this server issued' });
      throw e;
    }
  }
  if (url.pathname === '/api/v1/facets' && request.method === 'GET') {
    const p = await resolvePerson(request, env);
    return p instanceof Response ? p : json(await facets(env, p));
  }
  const rec = /^\/api\/v1\/items\/(itm_[0-9a-f]{16})\/record$/.exec(url.pathname);
  if (rec && request.method === 'GET') {
    const p = await resolvePerson(request, env);
    return p instanceof Response ? p : recordView(env, p, rec[1]!);
  }
  return null;
};
