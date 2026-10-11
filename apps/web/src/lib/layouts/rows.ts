import type { Vibe } from '@superjackfruit/vibekit';

export type RowVariant = 'cards' | 'index' | 'table' | 'plain';
/** How a list of results is drawn in each vibe (home, outcomes). Phases 2 to 4 change one value each. */
export const ROWS: Record<Vibe, RowVariant> = { daylight: 'cards', paper: 'index', studio: 'cards', quiet: 'cards' };
/** The row shape for a vibe: lists ask this, they never compare vibe names. */
export const rowShapeFor = (vibe: Vibe): RowVariant => ROWS[vibe];
