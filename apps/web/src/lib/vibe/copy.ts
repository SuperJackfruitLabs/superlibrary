import { greeting, type Phase, type Vibe } from '@superjackfruit/vibekit';

/** The suite spec's "feels like" line for each vibe (shown in the picker). */
export const VIBE_WORDS: Record<Vibe, { name: string; feel: string }> = {
  daylight: { name: 'Daylight', feel: 'A sunlit room your team works in' },
  paper: { name: 'Paper', feel: 'A letter from a colleague' },
  studio: { name: 'Studio', feel: 'A well-made piece of equipment' },
  quiet: { name: 'Quiet', feel: 'A clear printed page' },
};
export const PHASE_NAMES: Record<Phase, string> = { dawn: 'dawn', morning: 'morning', noon: 'midday', golden: 'golden hour', dusk: 'dusk', night: 'night' };
const PHASE_LIGHT: Record<Phase, string> = { dawn: 'first light', morning: 'morning light', noon: 'midday light', golden: 'golden light', dusk: 'the dusk', night: 'lamplight' };

/** Paper's dateline: "Saturday 11 October, in golden light". */
export const dateline = (now: Date, phase: Phase) => `${now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}, in ${PHASE_LIGHT[phase]}`;
/** Studio's readout: "GOLDEN HOUR · 17:42". */
export const readout = (now: Date, phase: Phase) => `${greeting(phase, 'studio')} · ${now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}`;
/** Quiet's plain line, only when the person turned the time of day on. */
export const timeLine = (phase: Phase) => `Time of day: ${PHASE_NAMES[phase]}`;
