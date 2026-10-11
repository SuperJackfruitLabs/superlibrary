import { describe, expect, it } from 'vitest';
import { greeting } from '@superjackfruit/vibekit';
import { PHASE_NAMES, dateline, readout, timeLine } from './copy';

// A fixed clock (local time, so the test reads the same at any hour and in any zone); the default locale is kept,
// so the assertions allow for how a locale writes the date and the time separator.
const at = (h: number, m: number) => new Date(2026, 9, 11, h, m);

describe("the vibes' time-of-day lines", () => {
  it("Paper's dateline: the day in the person's locale, then the light", () => {
    const d = at(17, 42);
    const line = dateline(d, 'golden');
    expect(line).toMatch(/, in golden light$/);
    expect(line).toContain('11');
    expect(line.startsWith(d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }))).toBe(true);
    expect(dateline(at(23, 30), 'night')).toMatch(/, in lamplight$/);
    expect(dateline(at(5, 50), 'dawn')).toMatch(/, in first light$/);
  });

  it("Studio's readout: the phase's word, then a 24-hour time with two-digit hours", () => {
    expect(readout(at(17, 42), 'golden')).toMatch(new RegExp(`^${greeting('golden', 'studio')} · 17[:.]42$`));
    expect(readout(at(5, 7), 'dawn')).toMatch(/ · 05[:.]07$/);
    expect(readout(at(0, 0), 'night')).toMatch(/ · 00[:.]00$/);
  });

  it("Quiet's plain line names the phase", () => {
    expect(timeLine('noon')).toBe('Time of day: midday');
    expect(timeLine('golden')).toBe(`Time of day: ${PHASE_NAMES.golden}`);
  });
});
