/**
 * THE seam between sources (lane A) and indexing (lane B). Every write that changes what an item
 * says, who may see it, or whether it exists sends one of these on the `superlibrary-index`
 * queue. Indexing re-reads the item from D1; the message only says which.
 */
export interface ItemChanged {
  type: 'item.changed';
  itemId: string;
  workspaceId: string;
  change: 'upserted' | 'deleted';
  at: string;
}
/** One page of the re-index job (plan P9). */
export interface ReindexPage {
  type: 'reindex';
  slot: 'a' | 'b';
  /** The last item id done, or null for the first page. */
  after: string | null;
}
export type IndexMessage = ItemChanged | ReindexPage;

/** The `superlibrary-ingest` queue (plan P5: every card event is a re-sync). */
export type IngestMessage =
  | { type: 'card.sync'; workspaceId: string; boardId: string; cardId: string; reason: string }
  | { type: 'card.deleted'; workspaceId: string; boardId: string; cardId: string }
  | { type: 'board.backfill'; workspaceId: string; boardId: string; /** Card id cursor: the page after it. */ after?: string }
  /** Gap S5: a board confirmed deleted (Superpipeline sends no event). `removed`: records already deleted by earlier pages. */
  | { type: 'board.deleted'; workspaceId: string; boardId: string; removed?: number };
