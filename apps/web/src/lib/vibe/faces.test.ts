import { describe, expect, it } from 'vitest';
import { makerOf, moodOf } from './faces';

describe('who made it, as a face', () => {
  it('an agent maker is its principal, said the provenance way', () => {
    expect(makerOf({ agent: true, agentPrincipal: 'prn_00000000000000000a9a' }, 'prn_x')).toEqual({ id: 'prn_00000000000000000a9a', label: 'An agent (prn_00000000000000000a9a)' });
    expect(makerOf({ agent: true }, 'prn_00000000000000000a9b')).toEqual({ id: 'prn_00000000000000000a9b', label: 'An agent (prn_00000000000000000a9b)' });
  });
  it('people and unknown makers get no face', () => {
    expect(makerOf(undefined, 'prn_1')).toBeNull();
    expect(makerOf({ agent: false }, 'prn_1')).toBeNull();
    expect(makerOf({ agent: true })).toBeNull();
  });
  it('the mood follows how the work turned out', () => {
    expect(moodOf('approved')).toBe('done');
    expect(moodOf('in-progress')).toBe('working');
    expect(moodOf('rejected')).toBe('resting');
  });
});
