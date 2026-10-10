/**
 * Which vibe has which layout: the one place (spec §3), with rows.ts for result rows. A vibe missing
 * here gets Daylight's layout in its own colours and type. Each later phase adds one line per screen.
 */
import type { Component } from 'svelte';
import type { Layouts } from '$lib/vibe/layout';
import type { LibraryModel } from '$lib/screens/library.svelte';
import type { ItemModel } from '$lib/screens/item.svelte';
import ItemDaylight from './item/ItemDaylight.svelte';
import LibraryDaylight from './library/LibraryDaylight.svelte';
export { ROWS, rowShapeFor, type RowVariant } from './rows';

type Of<M> = Layouts<Component<{ model: M }>>;
export const LAYOUTS = {
  item: { daylight: ItemDaylight } satisfies Of<ItemModel>,
  library: { daylight: LibraryDaylight } satisfies Of<LibraryModel>,   // Task 11 adds collections, collection
};
