import type { Env } from '../env';
import { error, json } from '../http';
import { verifyPush } from './push-signature';
import { RECORD_EVENT_NAMES, pushConfigured, pushSecret } from './subscribe';

export const MAX_PUSH_BODY = 64 * 1024;
const BOARD = /^brd_[0-9a-f]{16}$/;
const CARD = /^card_[0-9a-f]{16}$/;

/** Superpipeline's record push (Task A1). Routes only: the consumer reads the card back (plan P5). */
export async function receivePush(request: Request, env: Env, url: URL): Promise<Response> {
  // Fail closed: without a usable signing key no signature can mean anything.
  if (!pushConfigured(env)) return error(503, 'not_configured');
  const boardId = url.searchParams.get('board') ?? '';
  if (!BOARD.test(boardId)) return error(404, 'not_found');
  const workspaceId = url.searchParams.get('ws') ?? '';
  if (workspaceId === '' || workspaceId.length > 100) return error(404, 'not_found');
  const row = await env.DB.prepare(`SELECT workspace_id FROM source_boards WHERE workspace_id = ? AND board_id = ?`).bind(workspaceId, boardId).first<{ workspace_id: string }>();
  if (!row) return error(404, 'not_found');
  // Cap before any HMAC work: a declared length first, then the bytes actually read.
  if (Number(request.headers.get('content-length') ?? 0) > MAX_PUSH_BODY) return error(413, 'too_large');
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > MAX_PUSH_BODY) return error(413, 'too_large');
  // Treaty's x-treaty-signature over t.id.body; the old X-Superpipeline-Signature until the cleanup.
  if (!(await verifyPush(request.headers, bytes, await pushSecret(env, row.workspace_id, boardId)))) return error(401, 'bad_signature');
  const raw = new TextDecoder().decode(bytes);
  let body: { event?: string; boardId?: string; cardIds?: unknown };
  try { body = JSON.parse(raw); } catch { return error(400, 'invalid'); }
  if (body.boardId !== boardId || typeof body.event !== 'string' || !Array.isArray(body.cardIds)) return error(400, 'invalid');
  // Only record events are subscribed to; anything else is acknowledged and dropped (no retry storm).
  if (!(RECORD_EVENT_NAMES as readonly string[]).includes(body.event)) return json({ accepted: 0 }, 202);
  const cards = body.cardIds.filter((c): c is string => typeof c === 'string' && CARD.test(c));
  if (cards.length > 0) {
    await env.INGEST.sendBatch(cards.map((cardId) => ({
      body: body.event === 'card.deleted'
        ? { type: 'card.deleted' as const, workspaceId: row.workspace_id, boardId, cardId }
        : { type: 'card.sync' as const, workspaceId: row.workspace_id, boardId, cardId, reason: body.event! },
    })));
  }
  return json({ accepted: cards.length }, 202);
}
