import type { Env } from '../env';
import type { AgentViewer } from '../auth/caller';
import { serviceToken } from './plane';

const STALE_MAX_MS = 3600_000;
const BOARD = /^brd_[0-9a-f]{16}$/;

/** Spec §4: the boards an agent holds an enabled bridge row on, from the AgentPod hub, cached. */
export async function rosterBoards(env: Env, a: AgentViewer): Promise<string[]> {
  const ttl = Number(env.ROSTER_TTL_SECONDS ?? '300') * 1000;
  const row = await env.DB.prepare(`SELECT boards, fetched_at FROM roster_cache WHERE principal_id = ?`).bind(a.principalId).first<{ boards: string; fetched_at: number }>();
  if (row && Date.now() - row.fetched_at < ttl) return JSON.parse(row.boards);
  try {
    const token = await serviceToken(env, a.org, env.HUB_AUDIENCE!);
    const res = await fetch(`${env.HUB_URL}/api/bridge/principals/${a.principalId}/boards`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`hub roster ${res.status}`);
    const boards = ((await res.json()) as { boards: unknown[] }).boards.filter((b): b is string => typeof b === 'string' && BOARD.test(b));
    await env.DB.prepare(`INSERT OR REPLACE INTO roster_cache (principal_id, workspace_id, boards, fetched_at) VALUES (?, ?, ?, ?)`).bind(a.principalId, a.workspaceId, JSON.stringify(boards), Date.now()).run();
    return boards;
  } catch (e) {
    console.error('roster read failed', a.principalId, e instanceof Error ? e.message : String(e));
    if (row && Date.now() - row.fetched_at < STALE_MAX_MS) return JSON.parse(row.boards);
    return [];
  }
}

export async function invalidateRoster(env: Env, principal: string): Promise<void> {
  await env.DB.prepare(`DELETE FROM roster_cache WHERE principal_id = ?`).bind(principal).run();
}
