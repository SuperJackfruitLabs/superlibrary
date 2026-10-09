import { SELF, env } from 'cloudflare:test';
import type { WorkRecord } from '@superlibrary/contract';
import { API } from './upload';
import { HUMAN, devHeaders } from './org-plane';
import { seedRecord } from './records';

export const B1 = 'brd_00000000000000b1';
export const B2 = 'brd_00000000000000b2';

/** The dev person's workspace. The first person seen in a workspace is its owner. */
export async function workspaceOf(principal = HUMAN): Promise<string> {
  const res = await SELF.fetch(`${API}/api/v1/me`, { headers: devHeaders(principal) });
  return (await res.json<{ workspaceId: string }>()).workspaceId;
}

/** A board Superlibrary has subscribed to: people see its items (decision P4). */
export async function knowBoard(ws: string, board = B1, name = 'Marketing & Community'): Promise<void> {
  await env.DB.prepare(`INSERT OR REPLACE INTO source_boards (workspace_id, board_id, name, last_seen_at) VALUES (?, ?, ?, 't')`).bind(ws, board, name).run();
}

export function recordBody(over: Partial<WorkRecord> = {}): WorkRecord {
  return {
    schema: 'work-record/1', boardId: B1, cardId: 'card_00000000000000c1', title: 'Launch post', spec: { goal: 'Write the launch post' },
    state: 'completed', stage: 'publish', archivedAt: null, createdAt: '2026-10-01T09:00:00.000Z', updatedAt: '2026-10-03T17:00:00.000Z',
    handoffs: [
      { runId: 'run_00000000000000a1', stage: 'draft', agent: 'prn_000000000000000000a2', startedAt: '2026-10-01T10:00:00.000Z', endedAt: '2026-10-01T11:00:00.000Z', attempt: 1, status: 'failed', handoff: null, failureReason: 'timed out' },
      { runId: 'run_00000000000000a2', stage: 'draft', agent: 'prn_000000000000000000a2', startedAt: '2026-10-02T10:00:00.000Z', endedAt: '2026-10-02T11:00:00.000Z', attempt: 2, status: 'completed', handoff: { summary: 'Draft ready <b>for review</b>' }, failureReason: null },
    ],
    comments: [{ id: 'cmt_1', author: { kind: 'human', name: 'A person' }, body: 'Looks good <img src=x onerror=alert(1)>', createdAt: '2026-10-02T12:00:00.000Z' }],
    references: [],
    gates: [{ id: 'gate_1', stage: 'review', decision: 'approve', resolvedAt: '2026-10-03T09:00:00.000Z' }],
    supersededByCard: null, outcome: 'approved', redactions: [], truncated: false,
    ...over,
  };
}

/** A work record with a full body, in a person's workspace. */
export async function seedWorkRecord(o: { id: string; ws: string; board?: string; outcome?: string; title?: string; text?: string; body?: WorkRecord; updatedAt?: string }): Promise<void> {
  const board = o.board ?? B1;
  const body = o.body ?? recordBody({ boardId: board, title: o.title ?? 'Launch post', cardId: `card_${o.id.slice(4)}` });
  await seedRecord({ id: o.id, ws: o.ws, board, text: o.text ?? body.title, outcome: o.outcome ?? body.outcome, title: o.title ?? body.title });
  await env.DB.prepare(`UPDATE work_records SET body = ?, source_updated_at = ? WHERE item_id = ?`).bind(JSON.stringify(body), o.updatedAt ?? body.updatedAt, o.id).run();
}

/** A request as a person (DEV_AUTH) unless `headers` says otherwise. */
export function call(path: string, init: { method?: string; body?: unknown; principal?: string; headers?: Record<string, string> } = {}): Promise<Response> {
  const headers: Record<string, string> = { ...(init.headers ?? devHeaders(init.principal)) };
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  return SELF.fetch(`${API}${path}`, { method: init.method ?? 'GET', headers, ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}) });
}
