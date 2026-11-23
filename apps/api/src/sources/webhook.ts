import type { Env } from '../env';
import { error, json } from '../http';
import { verifyPush } from './push-signature';
import { isRecordBody } from './record-event';
import { RECORD_EVENT_NAMES, pushConfigured, pushSecret } from './subscribe';

export const MAX_PUSH_BODY = 64 * 1024;
const BOARD = /^brd_[0-9a-f]{16}$/;
const CARD = /^card_[0-9a-f]{16}$/;

/**
 * SuperPipeline's record push (Task A1). Routes only: the consumer reads the card back (plan P5).
 *
 * The answers follow the suite's receiver status contract (treaty `schemas/README.md`): 2xx is
 * handled or permanently ignored, 503 is transient and sent again, any other 4xx is refused for
 * good. A board this deployment has not mapped yet is 503, not 404: the next subscription pass may
 * map it, and a 404 would be dropped.
 */
export async function receivePush(request: Request, env: Env, url: URL): Promise<Response> {
  // Fail closed: without a usable signing key no signature can mean anything.
  if (!pushConfigured(env)) return error(503, 'not_configured');
  const boardId = url.searchParams.get('board') ?? '';
  if (!BOARD.test(boardId)) return error(404, 'not_found');
  const workspaceId = url.searchParams.get('ws') ?? '';
  if (workspaceId === '' || workspaceId.length > 100) return error(404, 'not_found');
  const row = await env.DB.prepare(`SELECT workspace_id FROM source_boards WHERE workspace_id = ? AND board_id = ?`).bind(workspaceId, boardId).first<{ workspace_id: string }>();
  if (!row) return error(503, 'board_not_mapped');
  // Cap before any HMAC work: a declared length first, then the bytes actually read.
  if (Number(request.headers.get('content-length') ?? 0) > MAX_PUSH_BODY) return error(413, 'too_large');
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > MAX_PUSH_BODY) return error(413, 'too_large');
  // Treaty's x-treaty-signature over t.id.body, and nothing else.
  if (!(await verifyPush(request.headers, bytes, await pushSecret(env, row.workspace_id, boardId)))) return error(401, 'bad_signature');
  let body: unknown;
  try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { return error(400, 'invalid'); }
  const event = typeof body === 'object' && body !== null && 'event' in body ? body.event : undefined;
  if (typeof event !== 'string') return error(400, 'invalid');
  // Only record events are subscribed to; anything else is acknowledged and dropped (no retry storm).
  if (!RECORD_EVENT_NAMES.includes(event)) return json({ accepted: 0 }, 202);
  if (!isRecordBody(body) || body.boardId !== boardId) return error(400, 'invalid');
  const cards = body.cardIds.filter((c) => CARD.test(c));
  if (cards.length > 0) {
    await env.INGEST.sendBatch(cards.map((cardId) => ({
      body: event === 'card.deleted'
        ? { type: 'card.deleted' as const, workspaceId: row.workspace_id, boardId, cardId }
        : { type: 'card.sync' as const, workspaceId: row.workspace_id, boardId, cardId, reason: event },
    })));
  }
  return json({ accepted: cards.length }, 202);
}
