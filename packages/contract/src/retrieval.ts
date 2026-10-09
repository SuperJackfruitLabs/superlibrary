import { z } from 'zod';
import { ITEM_ID } from './ids';
import { OUTCOMES, type ItemSource, type Outcome } from './model';
import { ITEM_KINDS, LibraryFilters, SINCE_UNTIL, sinceBeforeUntil } from './library';
import { CARD_ID } from './provenance';

/** Spec §7: approved and completed rank first; rejected and failed rank lower, never hidden. */
export const OUTCOME_WEIGHTS: Readonly<Record<Outcome, number>> = {
  approved: 1, completed: 1, 'in-progress': 0.8, superseded: 0.5, rejected: 0.4, failed: 0.4, abandoned: 0.4,
};
/** Reciprocal rank fusion's constant (the usual 60). */
export const RRF_K = 60;
/**
 * Gap S2: the relevance floor (spec §7). A candidate found only by meaning is kept when its best
 * chunk scores within `vectorGap` (cosine) of the best meaning match for the query; one with an
 * exact-word match is never dropped (S3-R10/R13). Tuned from the live measurement (Task 26 Step 7).
 */
export const RELEVANCE = { vectorGap: 0.1 } as const;
/** Words that match nearly every item; they count as word matches only when a query has no other word. */
export const STOPWORDS: ReadonlySet<string> = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'in', 'into', 'is', 'it', 'of', 'on', 'or', 'that', 'the', 'this', 'to', 'with',
]);
/** Spec §8: the related-work section's caps. */
export const PROMPT_CAPS = { items: 5, tokens: 1500 } as const;

const KINDS = ITEM_KINDS;

export const SearchQuery = z
  .object({
    query: z.string().trim().min(1).max(1000),
    ...LibraryFilters,
    limit: z.number().int().min(1).max(25).default(10),
  })
  .strict()
  .refine(sinceBeforeUntil, SINCE_UNTIL);
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
