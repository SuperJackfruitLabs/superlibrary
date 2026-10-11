import type { Vibe } from '@superjackfruit/vibekit';

export type RowVariant = 'cards' | 'index' | 'table' | 'plain';
/** How a list of results is drawn in each vibe (home, outcomes). Phases 2 to 4 change one value each. */
export const ROWS: Record<Vibe, RowVariant> = { daylight: 'cards', paper: 'index', studio: 'table', quiet: 'plain' };
