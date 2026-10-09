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

/** A message for a workspace that does not exist can never succeed: it is acked and dropped, not retried. */
export class UnknownWorkspace extends Error {}

async function orgOf(env: Env, workspaceId: string): Promise<string> {
  const w = await env.DB.prepare(`SELECT external_id FROM workspaces WHERE id = ?`).bind(workspaceId).first<{ external_id: string }>();
  if (!w) throw new UnknownWorkspace(`unknown workspace ${workspaceId}`);
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
  const client = pipelineFor(env, await orgOf(env, m.workspaceId));
  const bundle = await client.cardBundle(boardId, m.cardId, snapshots);
  if (!bundle) {
    // A 404 on the card alone proves nothing: a board that went forbidden or missing looks the same.
    // Delete only when the board itself reads 200 and does not list the card; snapshot() throws
    // otherwise and the message retries.
    const snap = await (snapshots ? (snapshots.get(boardId) ?? snapshots.set(boardId, client.snapshot(boardId)).get(boardId)!) : client.snapshot(boardId));
    if (snap.cards.some((c) => c.id === m.cardId)) throw new Error(`card ${m.cardId} read 404 but its board lists it; retry`);
    return (await deleteCardRecord(env, m.workspaceId, m.cardId)) ? 'deleted' : 'unchanged';
  }
  // The board id goes in before the size cap and the hash, so backfill equals live.
  const { record, text } = buildWorkRecord(bundle, env.APP_URL, boardId);
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
  // The consumer runs with max_concurrency 1 (wrangler.jsonc): that, not this loop, keeps an older
  // read from overwriting a newer one across invocations.
  const done = new Map<string, Promise<unknown>>();
  const snapshots: SnapshotCache = new Map();
  for (const msg of batch.messages) {
    const m = msg.body;
    const key = m.type === 'board.backfill' ? null : `${m.workspaceId} ${m.cardId}`;
    try {
      if (m.type === 'card.sync' || m.type === 'card.deleted') {
        if (!done.has(key!)) done.set(key!, syncCard(env, m, snapshots));
        await done.get(key!);
      } else if (m.type === 'board.backfill') {
        await backfillBoard(env, m.workspaceId, m.boardId, m.after ?? null);
      }
      msg.ack();
    } catch (e) {
      if (key) done.delete(key);
      if (e instanceof UnknownWorkspace) {
        console.error('ingest dropped', m.type, e.message);
        msg.ack();
        continue;
      }
      const status = e instanceof PipelineError ? e.status : 0;
      console.error('ingest failed', m.type, status, e instanceof Error ? e.message : String(e));
      msg.retry({ delaySeconds: Math.min(300, 10 * 2 ** msg.attempts) });
    }
  }
}

/**
 * Spec §5: memory starts with history. Every card on the board, archived ones included, plus a
 * delete hint for every record whose card is no longer listed. The messages go through the same
 * `syncCard` the live events use (plan P5), so backfill equals live.
 *
 * Bounded work: one invocation reads one snapshot (1 subrequest), one D1 read, and sends at most
 * BACKFILL_PAGE messages in sendBatch calls of <= 100 (<= 5 calls), so about 7 subrequests. The
 * rest of the board follows as a `board.backfill` carrying a cursor. The expensive part, about 6
 * subrequests per card (cardBundle), happens later in the consumer, 10 messages per invocation.
 */
export const BACKFILL_PAGE = 500;

export async function backfillBoard(env: Env, workspaceId: string, boardId: string, after: string | null = null): Promise<void> {
  const snap = await pipelineFor(env, await orgOf(env, workspaceId)).snapshot(boardId);
  const listed = new Set(snap.cards.map((c) => c.id));
  const recorded = (await env.DB.prepare(`SELECT card_id FROM work_records WHERE workspace_id = ? AND board_id = ?`).bind(workspaceId, boardId).all<{ card_id: string }>()).results.map((r) => r.card_id);
  const gone = recorded.filter((id) => !listed.has(id));
  const all: Array<readonly [string, boolean]> = [...[...listed].map((id) => [id, true] as const), ...gone.map((id) => [id, false] as const)].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const rest = after === null ? all : all.filter(([id]) => id > after);
  const page = rest.slice(0, BACKFILL_PAGE);
  const msgs: Array<{ body: IngestMessage }> = page.map(([cardId, present]) => ({
    body: present ? { type: 'card.sync', workspaceId, boardId, cardId, reason: 'backfill' } : { type: 'card.deleted', workspaceId, boardId, cardId },
  }));
  if (rest.length > page.length) msgs.push({ body: { type: 'board.backfill', workspaceId, boardId, after: page[page.length - 1]![0] } });
  for (let i = 0; i < msgs.length; i += 100) await env.INGEST.sendBatch(msgs.slice(i, i + 100));
}
