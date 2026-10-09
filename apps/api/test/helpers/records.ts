import { env } from 'cloudflare:test';

/** A work record written straight into D1: lane B never needs lane A (plan Lane B). */
export async function seedRecord(o: { id: string; ws?: string; board?: string; text: string; outcome?: string; title?: string }) {
  const ws = o.ws ?? 'wsp_00000000000000f1';
  await env.DB.prepare(`INSERT OR IGNORE INTO workspaces (id, external_source, external_id) VALUES (?, 'org-plane', ?)`).bind(ws, `org_${ws.slice(4).padStart(20, '0')}`).run();
  const board = o.board ?? 'brd_00000000000000b1';
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO items (id, workspace_id, kind, title, scope, outcome, created_by) VALUES (?, ?, 'work-record', ?, ?, ?, 'source:superpipeline')`).bind(o.id, ws, o.title ?? 'A card', `board:${board}`, o.outcome ?? 'completed'),
    env.DB.prepare(`INSERT INTO work_records (item_id, workspace_id, board_id, card_id, digest, body, text) VALUES (?, ?, ?, ?, 'd', '{}', ?)`).bind(o.id, ws, board, `card_${o.id.slice(4)}`, o.text),
    env.DB.prepare(`INSERT INTO item_sources (item_id, source, board_id, card_id) VALUES (?, 'superpipeline', ?, ?)`).bind(o.id, board, `card_${o.id.slice(4)}`),
  ]);
}
