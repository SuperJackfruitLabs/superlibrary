import { CaptionBody, SupersedeBody } from '@superlibrary/contract';
import type { z } from 'zod';
import type { Env } from '../env';
import type { Person } from '../auth/caller';
import { audit } from '../audit';
import { itemChanged } from '../events';
import { error, json } from '../http';
import { canManage, canSee, isExpired, loadItem, viewerScopes, type ItemRow } from '../items/visibility';
import { extrasFor, summary } from '../items/routes';
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

/** Following replacements from `by` reaches `id`: setting it would make a loop. */
async function wouldLoop(env: Env, id: string, by: string): Promise<boolean> {
  let at: string | null = by;
  for (let i = 0; i < 32 && at; i++) {
    if (at === id) return true;
    at = (await env.DB.prepare(`SELECT superseded_by FROM items WHERE id = ?`).bind(at).first<{ superseded_by: string | null }>())?.superseded_by ?? null;
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
        audit(env.DB, { workspaceId: p.workspaceId, actor: p.principalId, act: p.act, action: 'item.supersede_cleared', itemId: id, detail: { was: m.item.superseded_by } }),
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
