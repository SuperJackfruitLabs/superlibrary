/**
 * superlibrary-api: REST at app.superlibrary.dev/api/* (plan decision D1). Routes are added by
 * later tasks to `route` below; each returns null when the path is not theirs.
 */
import type { Env } from './env';
import { resolvePerson, resolveViewer } from './auth/caller';
import { protectedResourceMetadata } from './auth/org-plane';
import { error, json, type Handler } from './http';
import { uploadRoutes } from './uploads/routes';
import { itemRoutes } from './items/routes';
import { sourceRoutes } from './sources/routes';
import { queueHandlers } from './queues';
import { counted, withCost } from './cost';
import { RETENTION_CRON } from './lifecycle/retention';
import { RECONCILE_CRON, reconcile } from './indexing/consumer';
import { searchRoutes } from './search/routes';

const handlers: Handler[] = [uploadRoutes, itemRoutes, searchRoutes, sourceRoutes];

async function route(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/api/health') return json({ ok: true, service: 'superlibrary-api' });
  if (url.pathname === '/.well-known/oauth-protected-resource') return protectedResourceMetadata(env) ?? error(404, 'not_found');
  if (url.pathname === '/api/v1/me' && request.method === 'GET') {
    const p = await resolvePerson(request, env);
    if (p instanceof Response) return p;
    return json({ kind: p.kind, principalId: p.principalId, org: p.org, workspaceId: p.workspaceId, role: p.role });
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
    if (c.cron === RECONCILE_CRON) {
      ctx.waitUntil(reconcile(env).catch((e) => console.error('reconcile failed', e instanceof Error ? e.message : String(e))));
      return;
    }
    if (c.cron !== RETENTION_CRON) {
      console.error('no handler for cron', c.cron);
      return;
    }
    await env.RETENTION.send({ type: 'sweep', at: new Date(c.scheduledTime).toISOString() });
  },
} satisfies ExportedHandler<Env, unknown>;
