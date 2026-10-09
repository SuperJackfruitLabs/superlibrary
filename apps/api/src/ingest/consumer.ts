import type { IngestMessage } from '@superlibrary/contract';
import type { Env } from '../env';
import { newId } from '../ids';
import { audit } from '../audit';
import { itemChanged } from '../events';
import { deleteItem } from '../lifecycle/retention';
import { sha256Hex } from '../storage/blobs';
import { pipelineFor, PipelineError, type SnapshotCache } from '../sources/superpipeline';
import { buildWorkRecord } from './work-record';

const ACTOR = 'source:superpipeline';

async function orgOf(env: Env, workspaceId: string): Promise<string> {
  const w = await env.DB.prepare(`SELECT external_id FROM workspaces WHERE id = ?`).bind(workspaceId).first<{ external_id: string }>();
  if (!w) throw new Error(`unknown workspace ${workspaceId}`);
  return w.external_id;
}

export async function deleteCardRecord(env: Env, workspaceId: string, cardId: string): Promise<boolean> {
  const row = await env.DB.prepare(`SELECT item_id FROM work_records WHERE workspace_id = ? AND card_id = ?`).bind(workspaceId, cardId).first<{ item_id: string }>();
  if (!row) return false;
  // Spec §12: deleting a card deletes its work record and its index entries (deleteItem emits
  // item.changed 'deleted'; the index consumer removes chunks, FTS rows and vectors).
  await deleteItem(env, row.item_id, ACTOR, 'card deleted');
  return true;
}

/**
 * Plan P5: read the whole card back and make the record say exactly that. Idempotent. A delete
 * event is only a hint to sync: the record goes only when the read-back finds the card gone, so a
 * forged `card.deleted` is harmless. With a record on file the read uses ITS board, so a message
 * naming another board cannot make an existing card look gone.
 */
export async function syncCard(
  env: Env,
  m: { workspaceId: string; boardId: string; cardId: string },
  snapshots?: SnapshotCache,
): Promise<'created' | 'updated' | 'unchanged' | 'deleted'> {
  const existing = await env.DB.prepare(`SELECT item_id, digest, board_id FROM work_records WHERE workspace_id = ? AND card_id = ?`).bind(m.workspaceId, m.cardId).first<{ item_id: string; digest: string; board_id: string }>();
  const boardId = existing?.board_id ?? m.boardId;
  const bundle = await pipelineFor(env, await orgOf(env, m.workspaceId)).cardBundle(boardId, m.cardId, snapshots);
  if (!bundle) return (await deleteCardRecord(env, m.workspaceId, m.cardId)) ? 'deleted' : 'unchanged';
  const { record, text } = buildWorkRecord(bundle, env.APP_URL);
  record.boardId = boardId;   // before hashing, so backfill equals live
  const body = JSON.stringify(record);
  const digest = await sha256Hex(body);
  if (existing?.digest === digest) return 'unchanged';

  const itemId = existing?.item_id ?? newId('itm');
  const scope = `board:${boardId}`;
  const sourceUrl = `${env.SUPERPIPELINE_URL}/b/${boardId}/c/${m.cardId}`;
  const redacted = record.redactions.length > 0 ? 1 : 0;
  // Referenced Superlibrary items in THIS workspace only (spec §12 keeps them).
  const refIds = [...new Set(record.references.map((r) => r.itemId).filter((x): x is string => x !== null))];
  const owned = refIds.length === 0 ? [] : (await env.DB.prepare(`SELECT id FROM items WHERE workspace_id = ?1 AND id IN (SELECT value FROM json_each(?2))`).bind(m.workspaceId, JSON.stringify(refIds)).all<{ id: string }>()).results.map((r) => r.id);

  const statements: D1PreparedStatement[] = [];
  if (existing) {
    statements.push(
      env.DB.prepare(`UPDATE items SET title = ?, outcome = ?, scope = ? WHERE id = ?`).bind(record.title, record.outcome, scope, itemId),
      env.DB.prepare(`UPDATE work_records SET digest = ?, body = ?, text = ?, redacted = ?, superseded_by_card = ?, source_updated_at = ?, synced_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE item_id = ?`)
        .bind(digest, body, text, redacted, record.supersededByCard, record.updatedAt, itemId),
      env.DB.prepare(`UPDATE item_sources SET stage = ? WHERE item_id = ?`).bind(record.stage, itemId),
      env.DB.prepare(`DELETE FROM item_references WHERE from_kind = 'work-record' AND from_id = ?`).bind(itemId),
    );
  } else {
    statements.push(
      env.DB.prepare(`INSERT INTO items (id, workspace_id, kind, title, scope, outcome, created_by, latest_version) VALUES (?, ?, 'work-record', ?, ?, ?, ?, 0)`)
        .bind(itemId, m.workspaceId, record.title, scope, record.outcome, ACTOR),
      env.DB.prepare(`INSERT INTO work_records (item_id, workspace_id, board_id, card_id, digest, body, text, redacted, superseded_by_card, source_updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(itemId, m.workspaceId, boardId, m.cardId, digest, body, text, redacted, record.supersededByCard, record.updatedAt),
      env.DB.prepare(`INSERT INTO item_sources (item_id, source, board_id, card_id, stage, source_id, source_url) VALUES (?, 'superpipeline', ?, ?, ?, ?, ?)`)
        .bind(itemId, boardId, m.cardId, record.stage, m.cardId, sourceUrl),
      audit(env.DB, { workspaceId: m.workspaceId, actor: ACTOR, action: 'item.created', itemId, detail: { cardId: m.cardId } }),
    );
  }
  for (const id of owned) statements.push(env.DB.prepare(`INSERT OR IGNORE INTO item_references (item_id, from_kind, from_id) VALUES (?, 'work-record', ?)`).bind(id, itemId));
  if (redacted) statements.push(audit(env.DB, { workspaceId: m.workspaceId, actor: ACTOR, action: 'record.redacted', itemId, detail: { redactions: record.redactions } }));
  // A racing first delivery makes the loser's INSERT hit work_records_card; it throws, the message
  // retries and the retry updates.
  await env.DB.batch(statements);
  await itemChanged(env, itemId, m.workspaceId, 'upserted');
  return existing ? 'updated' : 'created';
}

export async function ingestBatch(batch: MessageBatch<IngestMessage>, env: Env): Promise<void> {
  // One read per card per batch, and one board snapshot per board: later messages share the first's.
  const done = new Map<string, Promise<unknown>>();
  const snapshots: SnapshotCache = new Map();
  for (const msg of batch.messages) {
    const m = msg.body;
    try {
      if (m.type === 'card.sync' || m.type === 'card.deleted') {
        const key = `${m.workspaceId} ${m.cardId}`;
        if (!done.has(key)) done.set(key, syncCard(env, m, snapshots));
        await done.get(key);
      } else if (m.type === 'board.backfill') {
        await backfillBoard(env, m.workspaceId, m.boardId);
      }
      msg.ack();
    } catch (e) {
      const status = e instanceof PipelineError ? e.status : 0;
      console.error('ingest failed', m.type, status, e instanceof Error ? e.message : String(e));
      done.delete(`${(m as { workspaceId: string }).workspaceId} ${(m as { cardId?: string }).cardId}`);
      msg.retry({ delaySeconds: Math.min(300, 10 * 2 ** msg.attempts) });
    }
  }
}

/** Task A14 replaces this with the real backfill; until then it refuses loudly so a stray message retries. */
export async function backfillBoard(_env: Env, _workspaceId: string, _boardId: string): Promise<void> {
  throw new Error('backfill arrives in Task A14');
}
