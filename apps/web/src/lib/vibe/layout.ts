import type { Vibe } from '@superjackfruit/vibekit';

/** A screen's layouts: Daylight's is required, the others arrive phase by phase. */
export type Layouts<C> = { daylight: C } & Partial<Record<Exclude<Vibe, 'daylight'>, C>>;

/** The only place a layout is chosen. A vibe without its own gets Daylight's, which its tokens restyle. */
export const pickLayout = <C>(vibe: Vibe, layouts: Layouts<C>): C => layouts[vibe] ?? layouts.daylight;
