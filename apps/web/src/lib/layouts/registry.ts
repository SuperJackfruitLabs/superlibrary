/**
 * Which vibe has which layout: the one place (spec §3), with rows.ts for result rows. A vibe missing
 * here gets Daylight's layout in its own colours and type. Each later phase adds one line per screen.
 */
export { ROWS, rowShapeFor, type RowVariant } from './rows';

export const LAYOUTS = {} as const;   // Tasks 8, 10 and 11 add library, item, collections, collection
