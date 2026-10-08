/**
 * superlibrary-api: REST at app.superlibrary.dev/api/* (plan decision D1). Routes are added by
 * later tasks to `route` below; each returns null when the path is not theirs.
 */
import type { Env, RetentionMessage } from './env';
import { error, json } from './http';

type Handler = (request: Request, env: Env, ctx: ExecutionContext, url: URL) => Promise<Response | null>;
const handlers: Handler[] = [];

async function route(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/api/health') return json({ ok: true, service: 'superlibrary-api' });
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
