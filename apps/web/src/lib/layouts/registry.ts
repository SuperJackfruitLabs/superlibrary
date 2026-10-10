/**
 * Which vibe has which layout: the one place (spec §3), with rows.ts for result rows. A vibe missing
 * here gets Daylight's layout in its own colours and type. Each later phase adds one line per screen.
 */
import type { Component } from 'svelte';
import type { Layouts } from '$lib/vibe/layout';
import type { LibraryModel } from '$lib/screens/library.svelte';
import LibraryDaylight from './library/LibraryDaylight.svelte';
export { ROWS, rowShapeFor, type RowVariant } from './rows';

type Of<M> = Layouts<Component<{ model: M }>>;
export const LAYOUTS = {
  library: { daylight: LibraryDaylight } satisfies Of<LibraryModel>,   // Tasks 10 and 11 add item, collections, collection
};
