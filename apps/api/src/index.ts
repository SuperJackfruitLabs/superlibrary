/**
 * superlibrary-api: REST at app.superlibrary.dev/api/* (plan decision D1). Routes are added by
 * later tasks to `route` below; each returns null when the path is not theirs.
 */
import type { Env } from './env';
import { resolvePerson, resolveViewer } from './auth/caller';
import { protectedResourceMetadata } from './auth/org-plane';
import { error, json, preflight, withCors, type Handler } from './http';
import { uploadRoutes } from './uploads/routes';
import { itemRoutes } from './items/routes';
import { sourceRoutes } from './sources/routes';
import { queueHandlers } from './queues';
import { counted, withCost } from './cost';
import { RETENTION_CRON } from './lifecycle/retention';
import { RECONCILE_CRON, reconcile } from './indexing/consumer';
import { handleMcp } from './mcp/server';
import { searchRoutes } from './search/routes';
import { SUBSCRIBE_CRON, subscribeAll } from './sources/subscribe';
import { libraryRoutes } from './library/routes';

const handlers: Handler[] = [uploadRoutes, itemRoutes, searchRoutes, sourceRoutes, libraryRoutes];

async function route(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/api/health') return json({ ok: true, service: 'superlibrary-api' });
  if (url.pathname === '/.well-known/oauth-protected-resource') return protectedResourceMetadata(env) ?? error(404, 'not_found');
  if (url.pathname === '/.well-known/oauth-protected-resource/mcp') return protectedResourceMetadata(env) ?? error(404, 'not_found');
  if (url.pathname === '/mcp') {
    const v = await resolveViewer(request, env);
    if (v instanceof Response) {
      if (v.status !== 401) return v;
      const headers = new Headers(v.headers);
      headers.set('WWW-Authenticate', `Bearer resource_metadata="${env.APP_URL}/.well-known/oauth-protected-resource/mcp"`);
      return new Response(v.body, { status: v.status, statusText: v.statusText, headers });
    }
    // Stateless: there is no session to stream to or delete (a GET would hold a keepalive-only stream).
    if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: { Allow: 'POST', 'content-type': 'application/json' } });
    return handleMcp(request, env, v);
  }
  if (url.pathname === '/api/v1/me') {
    // An embedding host asks who the person is to offer widening (gap G4).
    if (request.method === 'OPTIONS') return preflight(request, env.EMBED_HOSTS, 'GET');
    if (request.method !== 'GET') return error(404, 'not_found');
    const p = await resolvePerson(request, env);
    if (p instanceof Response) return withCors(request, env.EMBED_HOSTS, p);
    return withCors(request, env.EMBED_HOSTS, json({ kind: p.kind, principalId: p.principalId, org: p.org, workspaceId: p.workspaceId, role: p.role }));
  }
  // Read-only identity for people and agents (plan P13); an agent is never made a member.
  if (url.pathname === '/api/v1/whoami' && request.method === 'GET') {
    const v = await resolveViewer(request, env);
    return v instanceof Response ? v : json({ kind: v.kind, principalId: v.principalId });
  }
  for (const h of handlers) {
    const res = await h(request, env, ctx, url);
    if (res) return res;
  }
  return error(404, 'not_found');
}

export default {
  async fetch(request, env, ctx) {
    const startedAt = Date.now();
    const c = counted(env);
    try {
      return withCost(await route(request, c.env, ctx), c.cost, startedAt);
    } catch (e) {
      console.error('unexpected', e instanceof Error ? e.message : String(e));
      return withCost(error(500, 'unexpected'), c.cost, startedAt);
    }
  },
  async queue(batch: MessageBatch<unknown>, env: Env, _ctx: ExecutionContext) {
    const handle = queueHandlers[batch.queue];
    if (!handle) {
      console.error('no handler for queue', batch.queue);
      batch.retryAll();
      return;
    }
    await handle(batch, env);
  },
  /** The daily cron only enqueues; the consumer does the work (spec §6 `retention` queue). */
  async scheduled(c: ScheduledController, env: Env, ctx: ExecutionContext) {
    if (c.cron === SUBSCRIBE_CRON) ctx.waitUntil(subscribeAll(env).catch((e) => console.error('subscribeAll failed', e instanceof Error ? e.message : String(e))));
    else if (c.cron === RECONCILE_CRON) {
      ctx.waitUntil(reconcile(env).catch((e) => console.error('reconcile failed', e instanceof Error ? e.message : String(e))));
    } else if (c.cron === RETENTION_CRON) await env.RETENTION.send({ type: 'sweep', at: new Date(c.scheduledTime).toISOString() });
    else console.error('no handler for cron', c.cron);
  },
} satisfies ExportedHandler<Env, unknown>;
