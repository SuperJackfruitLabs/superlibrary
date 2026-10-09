import { CaptionBody, RemoveBody, SupersedeBody } from '@superlibrary/contract';
import type { z } from 'zod';
import type { Env } from '../env';
import type { Person } from '../auth/caller';
import { audit } from '../audit';
import { itemChanged } from '../events';
import { error, json } from '../http';
import { canManage, canSee, isExpired, loadItem, viewerScopes, type ItemRow } from '../items/visibility';
import { extrasFor, summary } from '../items/routes';
import { deleteItem } from '../lifecycle/retention';
import { issues } from './issues';

/**
 * The item a person may moderate (spec §11): visible to them, and theirs or they own the workspace
 * (plan D12, decision O1; a work record has no uploader, so owners only). Agents never get here:
 * `resolvePerson` refuses them. Invisible is 404 (D11).
 */
export async function moderatable(env: Env, p: Person, id: string, opts: { allowRevoked?: boolean } = {}): Promise<{ item: ItemRow; scopes: string[] } | Response> {
  const item = await loadItem(env, id);
  const scopes = item ? await viewerScopes(env, p) : [];
  if (!item || !canSee(p, item, scopes)) return error(404, 'not_found');
  if (!canManage(p, item, scopes)) return error(403, 'not_permitted');
  if (item.revoked_at && !opts.allowRevoked) return error(410, 'revoked');
  return { item, scopes };
}

export async function respond(env: Env, p: Person, id: string, scopes?: string[]): Promise<Response> {
  const now = (await loadItem(env, id))!;
  return json({ item: summary(now, (await extrasFor(env, p, [now], scopes)).get(id)) });
}

async function body<S extends z.ZodType>(request: Request, schema: S): Promise<z.infer<S> | Response> {
  const b = schema.safeParse(await request.json().catch(() => null));
  return b.success ? b.data : error(400, 'invalid', { issues: issues(b.error) });
}

/** Following the replacements people and cards name from `by` reaches `id`: setting it would make a loop. */
async function wouldLoop(env: Env, id: string, by: string): Promise<boolean> {
  let at: string | null = by;
  for (let i = 0; i < 32 && at; i++) {
    if (at === id) return true;
    // The effective link, as shown: a person's replacement first, else the card's (same join as supersededByMap).
    at = (await env.DB.prepare(
      `SELECT COALESCE(i.superseded_by, n.item_id) AS next FROM items i
         LEFT JOIN work_records w ON w.item_id = i.id
         LEFT JOIN work_records n ON n.workspace_id = w.workspace_id AND n.card_id = w.superseded_by_card
        WHERE i.id = ?`,
    ).bind(at).first<{ next: string | null }>())?.next ?? null;
  }
  return at !== null;   // a chain longer than 32 is refused as a loop rather than followed further
}

export async function supersede(request: Request, env: Env, p: Person, id: string): Promise<Response> {
  const m = await moderatable(env, p, id);
  if (m instanceof Response) return m;
  const b = await body(request, SupersedeBody);
  if (b instanceof Response) return b;
  if (b.by === null) {
    if (m.item.superseded_by) {
      await env.DB.batch([
        env.DB.prepare(`UPDATE items SET outcome = COALESCE(superseded_prior, outcome), superseded_by = NULL, superseded_prior = NULL WHERE id = ?`).bind(id),
        audit(env.DB, { workspaceId: p.workspaceId, actor: p.principalId, act: p.act, action: 'item.supersede_cleared', itemId: id, detail: { was: m.item.superseded_by, restored: m.item.superseded_prior ?? m.item.outcome } }),
      ]);
      await itemChanged(env, id, m.item.workspace_id, 'upserted');
    }
    return respond(env, p, id, m.scopes);
  }
  if (b.by === id) return error(400, 'invalid', { detail: 'an item cannot supersede itself' });
  const target = await loadItem(env, b.by);
  if (!target || !canSee(p, target, m.scopes) || target.revoked_at || isExpired(target)) return error(404, 'not_found', { detail: 'the replacement was not found' });
  if (await wouldLoop(env, id, b.by)) return error(400, 'invalid', { detail: 'that would make a loop of replacements' });
  const prior = m.item.superseded_by ? (m.item.superseded_prior ?? m.item.outcome) : m.item.outcome;
  await env.DB.batch([
    env.DB.prepare(`UPDATE items SET superseded_prior = ?, superseded_by = ?, outcome = 'superseded' WHERE id = ?`).bind(prior, b.by, id),
    audit(env.DB, { workspaceId: p.workspaceId, actor: p.principalId, act: p.act, action: 'item.superseded', itemId: id, detail: { by: b.by, prior } }),
  ]);
  // Outcome changes the ranking weight (spec §7): the index consumer re-reads the item.
  await itemChanged(env, id, m.item.workspace_id, 'upserted');
  return respond(env, p, id, m.scopes);
}

export async function setCaption(request: Request, env: Env, p: Person, id: string): Promise<Response> {
  const m = await moderatable(env, p, id);
  if (m instanceof Response) return m;
  if (m.item.kind !== 'artifact') return error(400, 'invalid', { detail: 'only an artifact has a caption' });
  const b = await body(request, CaptionBody);
  if (b instanceof Response) return b;
  const caption = b.caption === null || b.caption === '' ? null : b.caption;
  await env.DB.batch([
    env.DB.prepare(`UPDATE items SET caption = ? WHERE id = ?`).bind(caption, id),
    audit(env.DB, { workspaceId: p.workspaceId, actor: p.principalId, act: p.act, action: 'item.caption_set', itemId: id, detail: { length: caption?.length ?? 0 } }),
  ]);
  await itemChanged(env, id, m.item.workspace_id, 'upserted');
  return respond(env, p, id, m.scopes);
}

/**
 * Spec §11 "remove an item from memory, with a recorded reason"; spec §12 "deletion removes
 * everything". A revoked item may still be removed. A work record's card is remembered, so its
 * next event does not bring it back (decision O5).
 */
export async function removeFromMemory(request: Request, env: Env, p: Person, id: string): Promise<Response> {
  const m = await moderatable(env, p, id, { allowRevoked: true });
  if (m instanceof Response) return m;
  const b = RemoveBody.safeParse(await request.json().catch(() => null));
  if (!b.success) return error(400, 'invalid', { detail: 'a reason of 3 to 500 characters is required' });
  // The tombstone goes in before the delete, deliberately: if the delete fails, the card stays frozen
  // (no sync can change it) and a second remove succeeds; the other order could let a sync recreate it.
  if (m.item.kind === 'work-record') {
    const w = await env.DB.prepare(`SELECT card_id FROM work_records WHERE item_id = ?`).bind(id).first<{ card_id: string }>();
    if (w) {
      await env.DB.prepare(`INSERT OR REPLACE INTO removed_cards (workspace_id, card_id, item_id, reason, removed_by) VALUES (?, ?, ?, ?, ?)`)
        .bind(m.item.workspace_id, w.card_id, id, b.data.reason, p.principalId).run();
    }
  }
  // Rows, bytes no other version shares, and (through item.changed 'deleted') chunks, FTS rows and
  // vectors. Its `item.deleted` audit row records this person and the reason.
  await deleteItem(env, id, p.principalId, b.data.reason);
  return json({ removed: true });
}
