/** `<prefix>_<16 hex>`, the shape Superpipeline's `newId` mints (apps/api/src/ids.ts). */
export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

export const ITEM_ID = /^itm_[0-9a-f]{16}$/;
const LABEL = /^itm-([0-9a-f]{16})$/;

/** `_` is not valid in a hostname, so an item's content subdomain spells it `-` (plan decision D10). */
export function contentLabel(itemId: string): string {
  if (!ITEM_ID.test(itemId)) throw new Error(`not an item id: ${itemId}`);
  return itemId.replace('itm_', 'itm-');
}

export function itemIdFromLabel(label: string): string | null {
  const m = LABEL.exec(label);
  return m ? `itm_${m[1]}` : null;
}
