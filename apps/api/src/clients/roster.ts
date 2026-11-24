import type { Env } from '../env';
import type { AgentViewer } from '../auth/caller';
import { hubConforms, refusedAnswer } from './hub-contract';
import { serviceToken } from './plane';

const STALE_MAX_MS = 3600_000;

/** Spec §4: the boards an agent holds an enabled bridge row on, from the AgentPod hub, cached. */
export async function rosterBoards(env: Env, a: AgentViewer): Promise<string[]> {
  const ttl = Number(env.ROSTER_TTL_SECONDS ?? '300') * 1000;
  const row = await env.DB.prepare(`SELECT boards, fetched_at FROM roster_cache WHERE principal_id = ? AND workspace_id = ?`).bind(a.principalId, a.workspaceId).first<{ boards: string; fetched_at: number }>();
  if (row && Date.now() - row.fetched_at < ttl) return JSON.parse(row.boards);
  try {
    const token = await serviceToken(env, a.org, env.HUB_AUDIENCE!);
    const res = await fetch(`${env.HUB_URL}/api/bridge/principals/${a.principalId}/boards`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`hub roster ${res.status}`);
    // Treaty's capability-catalog.v1: an answer it refuses is no answer, as a failed read is.
    const body: unknown = await res.json().catch(() => undefined);
    const why: string[] = [];
    if (!hubConforms('listPrincipalBoards', res.status, body, why)) throw new Error(refusedAnswer('listPrincipalBoards', res.status, why));
    const { boards } = body;
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
