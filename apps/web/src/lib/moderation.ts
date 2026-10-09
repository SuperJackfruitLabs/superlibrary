// apps/web/src/lib/moderation.ts
/** Spec §11 moderation, from the item page. A person's act; the API decides who may. */
import { ITEM_ID } from '@superlibrary/contract';
import { change, type Ask } from './item';

type Api = (path: string, init?: RequestInit) => Promise<Response>;
const LINK = /^https?:\/\/[^/]+\/a\/(itm_[0-9a-f]{16})(?:\/v\/[1-9][0-9]*)?\/?(?:[?#].*)?$/;

/** An item id, or the id in an item link (`…/a/itm_…[/v/n]`). Anything else is not an item. */
export function parseItemRef(input: string): string | null {
  const s = input.trim();
  if (ITEM_ID.test(s)) return s;
  return LINK.exec(s)?.[1] ?? null;
}

export const askSupersede = (title: string, byTitle: string): Ask => ({
  title: `Mark “${title}” as superseded?`,
  message: `It will show as superseded by “${byTitle}” and rank lower in search. You can undo this.`,
  action: 'Mark as superseded',
});
export const askWiden = (title: string): Ask => ({
  title: `Show “${title}” to everyone in the workspace?`,
  message: 'Everyone in the workspace, and every agent in it, will be able to find and open it. It cannot be narrowed again.',
  action: 'Show to everyone',
});
export const askRemove = (title: string, kind: 'artifact' | 'work-record'): Ask & { required: true } => ({
  title: `Remove “${title}” from memory?`,
  message: kind === 'work-record'
    ? 'The record and its search entries are deleted, and later changes to the card will not bring it back. Your reason is kept in the audit log.'
    : 'The item, every version, its files and its search entries are deleted. Your reason is kept in the audit log.',
  action: 'Remove from memory',
  reason: true,
  required: true,
});

export const supersede = (api: Api, id: string, by: string | null) => change(api, `/api/v1/items/${id}/supersede`, 'POST', { by });
export const setCaption = (api: Api, id: string, caption: string | null) => change(api, `/api/v1/items/${id}/caption`, 'PATCH', { caption });
export const widen = (api: Api, id: string) => change(api, `/api/v1/items/${id}/scope`, 'POST', { scope: 'workspace' });
export const removeItem = (api: Api, id: string, reason: string) => change(api, `/api/v1/items/${id}/remove`, 'POST', { reason });
