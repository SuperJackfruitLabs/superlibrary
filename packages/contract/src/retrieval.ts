import { z } from 'zod';
import { ITEM_ID } from './ids';
import { OUTCOMES, type ItemSource, type Outcome } from './model';
import { BOARD_ID, CARD_ID } from './provenance';

/** Spec §7: approved and completed rank first; rejected and failed rank lower, never hidden. */
export const OUTCOME_WEIGHTS: Readonly<Record<Outcome, number>> = {
  approved: 1, completed: 1, 'in-progress': 0.8, superseded: 0.5, rejected: 0.4, failed: 0.4, abandoned: 0.4,
};
/** Reciprocal rank fusion's constant (the usual 60). */
export const RRF_K = 60;
/** Spec §8: the related-work section's caps. */
export const PROMPT_CAPS = { items: 5, tokens: 1500 } as const;

const KINDS = ['artifact', 'work-record'] as const;

export const SearchQuery = z.object({
  query: z.string().trim().min(1).max(1000),
  kinds: z.array(z.enum(KINDS)).min(1).optional(),
  outcomes: z.array(z.enum(OUTCOMES)).min(1).optional(),
  board: z.string().regex(BOARD_ID).optional(),
  limit: z.number().int().min(1).max(25).default(10),
}).strict();
export type SearchQuery = z.infer<typeof SearchQuery>;

const relatedCaps = { limit: z.number().int().min(1).max(10).default(PROMPT_CAPS.items), maxTokens: z.number().int().min(100).max(4000).default(PROMPT_CAPS.tokens) };
export const RelatedQuery = z.union([
  z.object({ cardId: z.string().regex(CARD_ID), ...relatedCaps }).strict(),
  z.object({ itemId: z.string().regex(ITEM_ID), ...relatedCaps }).strict(),
]);
export type RelatedQuery = z.infer<typeof RelatedQuery>;

export interface SearchResult {
  itemId: string;
  kind: (typeof KINDS)[number];
  title: string;
  outcome: Outcome;
  scope: string;
  provenance: ItemSource;
  snippet: string;
  url: string;
  score: number;
  /** For a superseded item, the item that replaces it (spec §15). */
  supersededBy: string | null;
}
/** A related item with its capped text, already wrapped (`wrapItem`). */
export interface RelatedItem extends SearchResult {
  wrapped: string;
  tokens: number;
}

export const itemUrl = (appUrl: string, itemId: string) => `${appUrl}/a/${itemId}`;

/** Spec §8 / plan P17. */
export const estimateTokens = (s: string) => Math.ceil(s.length / 4);

const attr = (v: string) => v.replace(/[^A-Za-z0-9_:./?=&%#@+-]/g, '');
const neutral = (s: string) => s.replace(/<(\/?)library-item/gi, '<$1library_item');

/**
 * Spec §8: retrieved content is data, not instructions. One labelled block per item; nothing in
 * the title or body can close it or open a forged one. AgentPod renders the same format in
 * `card-prompt.ts` (Task I1); change both together.
 */
export function wrapItem(
  r: { itemId: string; kind: string; outcome: string; title: string; url: string; provenance: ItemSource },
  body: string,
): string {
  const p = r.provenance;
  const attrs: Array<[string, string | undefined]> = [
    ['id', r.itemId], ['kind', r.kind], ['outcome', r.outcome], ['source', p.sourceKind],
    ['board', p.board], ['card', p.card], ['stage', p.stage], ['station', p.station], ['path', p.path], ['url', r.url],
  ];
  const head = attrs.filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}="${attr(v!)}"`).join(' ');
  const title = neutral(r.title).replace(/[\r\n]+/g, ' ');
  return `<library-item ${head}>\ntitle: ${title}\n${neutral(body).trim()}\n</library-item>`;
}
