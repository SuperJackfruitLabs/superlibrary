import { describe, expect, it } from 'vitest';
import { isoUtc } from '../src/time';

describe('isoUtc', () => {
  it('turns SQLite UTC time into ISO 8601 with Z, and leaves ISO UTC and null alone', () => {
    expect(isoUtc('2026-10-09 12:34:56')).toBe('2026-10-09T12:34:56Z');
    expect(isoUtc('2026-10-09 12:34:56.789')).toBe('2026-10-09T12:34:56.789Z');
    expect(isoUtc('2026-10-09T12:34:56.000Z')).toBe('2026-10-09T12:34:56.000Z');
    expect(isoUtc('2026-10-09T14:34:56+02:00')).toBe('2026-10-09T12:34:56.000Z');
    expect(isoUtc(null)).toBeNull();
  });
});
