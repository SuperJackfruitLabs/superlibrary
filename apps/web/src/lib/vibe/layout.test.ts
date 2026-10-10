import { describe, expect, it } from 'vitest';
import { VIBES } from '@superjackfruit/vibekit';
import { pickLayout } from './layout';

describe('one place picks the layout', () => {
  it('a vibe with its own layout gets it', () => {
    expect(pickLayout('paper', { daylight: 'D', paper: 'P' })).toBe('P');
  });
  it('a vibe without one gets the Daylight layout, in its own colours', () => {
    for (const v of VIBES) expect(pickLayout(v, { daylight: 'D' })).toBe('D');
  });
});
