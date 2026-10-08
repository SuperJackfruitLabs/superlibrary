/**
 * superlibrary-api: REST at app.superlibrary.dev/api/* (plan decision D1). Routes are added by
 * later tasks to `route` below; each returns null when the path is not theirs.
 */
import type { Env, RetentionMessage } from './env';
import { resolvePerson } from './auth/caller';
import { protectedResourceMetadata } from './auth/org-plane';
import { error, json, type Handler } from './http';
import { uploadRoutes } from './uploads/routes';
import { itemRoutes } from './items/routes';

const handlers: Handler[] = [uploadRoutes, itemRoutes];

async function route(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/api/health') return json({ ok: true, service: 'superlibrary-api' });
  if (url.pathname === '/.well-known/oauth-protected-resource') return protectedResourceMetadata(env) ?? error(404, 'not_found');
  if (url.pathname === '/api/v1/me' && request.method === 'GET') {
    const p = await resolvePerson(request, env);
    if (p instanceof Response) return p;
    return json({ principalId: p.principalId, org: p.org, workspaceId: p.workspaceId, role: p.role });
  }
  for (const h of handlers) {
    const res = await h(request, env, ctx, url);
    if (res) return res;
  }
  return error(404, 'not_found');
}

export default {
  async fetch(request, env, ctx) {
    try {
      return await route(request, env, ctx);
    } catch (e) {
      console.error('unexpected', e instanceof Error ? e.message : String(e));
      return error(500, 'unexpected');
    }
  },
  async queue(batch: MessageBatch<RetentionMessage>, _env: Env) {
    for (const m of batch.messages) m.ack();
  },
  async scheduled(_c: ScheduledController, _env: Env) {},
} satisfies ExportedHandler<Env, RetentionMessage>;
