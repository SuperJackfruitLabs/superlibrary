import type { Env } from '../env';
import { pipelineFor } from './superpipeline';
import { ensureWorkspace } from '../auth/caller';

/** Superpipeline's record events as built (A1 RECORD_EVENTS); a push config may subscribe to nothing else. */
export const RECORD_EVENT_NAMES = [
  'card.created', 'card.updated', 'card.moved', 'card.advanced', 'card.completed', 'card.rejected', 'card.failed',
  'card.blocked', 'card.deleted', 'card.resumed', 'card.comment.added', 'card.comment.deleted', 'gate.resolved',
  'link.added', 'link.removed',
] as const;

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

/** Each board's push secret, derived, never stored (plan Task A11). */
export async function pushSecret(env: Env, boardId: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.PUSH_SIGNING_KEY!), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`superpipeline-push:${boardId}`)));
}

export const eventsUrl = (env: Env, boardId: string) => `${env.APP_URL}/api/v1/sources/superpipeline/events?board=${boardId}`;

/** Spec §5: a push config on each workspace board. Idempotent: Superpipeline upserts on (subscriber, url). */
export async function subscribeWorkspace(env: Env, workspaceId: string, org: string): Promise<{ boards: number; registered: number }> {
  const sp = pipelineFor(env, org);
  const boards = await sp.boards();
  const now = new Date().toISOString();
  let registered = 0;
  for (const b of boards) {
    await env.DB.prepare(
      `INSERT INTO source_boards (workspace_id, board_id, name, last_seen_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (workspace_id, board_id) DO UPDATE SET name = excluded.name, last_seen_at = excluded.last_seen_at`,
    ).bind(workspaceId, b.id, b.name, now).run();
    const configId = await sp.registerPush(b.id, eventsUrl(env, b.id), await pushSecret(env, b.id), [...RECORD_EVENT_NAMES]);
    await env.DB.prepare(`UPDATE source_boards SET push_config_id = ?, subscribed_at = COALESCE(subscribed_at, ?) WHERE workspace_id = ? AND board_id = ?`).bind(configId, now, workspaceId, b.id).run();
    registered++;
  }
  return { boards: boards.length, registered };
}

/** The hourly cron: every workspace Superlibrary holds a credential for (plan P20). */
export async function subscribeAll(env: Env): Promise<void> {
  const orgs = Object.keys(JSON.parse(env.SERVICE_CREDENTIALS || '{}') as Record<string, string>);
  for (const org of orgs) {
    try {
      await subscribeWorkspace(env, await ensureWorkspace(env.DB, org), org);
    } catch (e) {
      console.error('subscribe failed', org, e instanceof Error ? e.message : String(e));
    }
  }
}
