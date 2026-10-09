// packages/contract/src/library.ts
import { z } from 'zod';
import { ITEM_ID } from './ids';
import { OUTCOMES, type ItemSummary, type Outcome } from './model';
import { BOARD_ID, PRN_ID } from './provenance';
import type { WorkRecord } from './work-record';

export const ITEM_KINDS = ['artifact', 'work-record'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];
/** `col_` + 16 hex (`newId('col')`). */
export const COLLECTION_ID = /^col_[0-9a-f]{16}$/;

/**
 * Spec §11: what every library view filters by, beyond the words. `since`/`until` bound an item's
 * last activity (decision O4): a card's last update, else the newest version, else creation.
 */
export const LibraryFilters = {
  kinds: z.array(z.enum(ITEM_KINDS)).min(1).max(2).optional(),
  outcomes: z.array(z.enum(OUTCOMES)).min(1).max(7).optional(),
  board: z.string().regex(BOARD_ID).optional(),
  agent: z.string().regex(PRN_ID).optional(),
  /** The hub's station id, or its readable name. */
  station: z.string().trim().min(1).max(100).optional(),
  since: z.iso.datetime().optional(),
  until: z.iso.datetime().optional(),
};
export const sinceBeforeUntil = (q: { since?: string | undefined; until?: string | undefined }) =>
  !q.since || !q.until || Date.parse(q.since) < Date.parse(q.until);
export const SINCE_UNTIL = { message: 'since must be before until', path: ['until'] };

/** Browsing needs no words (spec §11 "views by outcome"). Newest activity first, cursor-paged. */
export const BrowseQuery = z
  .object({
    ...LibraryFilters,
    collection: z.string().regex(COLLECTION_ID).optional(),
    limit: z.number().int().min(1).max(100).default(50),
    cursor: z.string().min(1).max(200).optional(),
  })
  .strict()
  .refine(sinceBeforeUntil, SINCE_UNTIL);
export type BrowseQuery = z.infer<typeof BrowseQuery>;

export type OutcomeCounts = Record<Outcome, number>;
export interface BrowsePage {
  items: ItemSummary[];
  next: string | null;
  /** Per outcome, for the same filters without the outcome filter: what each outcome tab would show. */
  counts: OutcomeCounts;
}
/** What a person can filter by: only values from items they can see. */
export interface Facets {
  boards: Array<{ id: string; name: string }>;
  agents: string[];
  stations: Array<{ id: string; name: string | null }>;
}

export const CollectionCreate = z
  .object({ name: z.string().trim().min(1).max(120), description: z.string().trim().max(1000).default('') })
  .strict();
export const CollectionPatch = z
  .object({ name: z.string().trim().min(1).max(120).optional(), description: z.string().trim().max(1000).optional() })
  .strict()
  .refine((b) => b.name !== undefined || b.description !== undefined, { message: 'nothing to change' });
export const CollectionAdd = z.object({ itemId: z.string().regex(ITEM_ID), note: z.string().trim().max(500).optional() }).strict();

export interface CollectionSummary {
  id: string;
  name: string;
  description: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /** Items in it that this person can see (hidden ones are never counted, spec §4). */
  itemCount: number;
  /** Rename and delete: its creator or an owner (decision O2). */
  canEdit: boolean;
}
export interface CollectionEntry { item: ItemSummary; addedBy: string; addedAt: string; note: string | null }
export interface CollectionDetail extends CollectionSummary { entries: CollectionEntry[] }

/** Spec §11: mark superseded by another item; `null` undoes it. */
export const SupersedeBody = z.object({ by: z.string().regex(ITEM_ID).nullable() }).strict();
/** Spec §7, §11: an artifact's caption, indexed and shown; `null` or empty clears it. */
export const CaptionBody = z.object({ caption: z.string().trim().max(2000).nullable() }).strict();
/** Spec §11: remove from memory, with a recorded reason. */
export const RemoveBody = z.object({ reason: z.string().trim().min(3).max(500) }).strict();

/** Spec §11 "work-record timelines": the record, and the artifacts it links that the person can see. */
export interface WorkRecordView {
  item: ItemSummary;
  record: WorkRecord;
  artifacts: ItemSummary[];
  boardName: string | null;
}
