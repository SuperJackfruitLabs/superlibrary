// apps/web/src/lib/library.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import type { ItemSummary, SearchResult } from '@superlibrary/contract';
import { EMPTY_FILTERS, activeFilters, browseBody, periodRange, rangeProblem, readFilters, rowOfItem, rowOfResult, searchBody, writeFilters } from './library';

const TZ = process.env.TZ;
afterEach(() => { process.env.TZ = TZ; });

describe('filters in the address (spec §11: a view can be kept and shared)', () => {
  it('round-trips, and drops what is not a known value', () => {
    const qs = 'q=launch&kind=work-record&outcome=rejected&outcome=failed&board=brd_00000000000000b1&agent=prn_000000000000000000a2&station=docs&period=month';
    const f = readFilters(new URLSearchParams(qs));
    expect(f).toMatchObject({ q: 'launch', kind: 'work-record', outcomes: ['rejected', 'failed'], board: 'brd_00000000000000b1', period: 'month' });
    expect(writeFilters(f)).toBe(qs);
    const junk = readFilters(new URLSearchParams('kind=folder&outcome=great&board=marketing&agent=bob&period=forever&from=yesterday'));
    expect(junk).toEqual(EMPTY_FILTERS);
    expect(activeFilters(f)).toBe(7);   // kind, two outcomes, board, agent, station, period
  });
  it('a page may default the period; the other choice is then written out', () => {
    const d = { period: 'month' } as const;
    expect(readFilters(new URLSearchParams(''), d).period).toBe('month');
    expect(writeFilters({ ...EMPTY_FILTERS, period: 'month' }, d)).toBe('');
    expect(writeFilters({ ...EMPTY_FILTERS, period: 'any' }, d)).toBe('period=any');
  });
});

describe('the filter count', () => {
  it('counts a custom period only once a date is set', () => {
    expect(activeFilters({ ...EMPTY_FILTERS, period: 'custom' })).toBe(0);
    expect(activeFilters({ ...EMPTY_FILTERS, period: 'custom', from: '2026-10-01' })).toBe(1);
  });
});

describe('periods in the person’s own time zone (Review Focus)', () => {
  it("periodRange starts a month at the person's local midnight", () => {
    process.env.TZ = 'Pacific/Kiritimati';   // UTC+14
    expect(periodRange({ period: 'month', from: '', to: '' }, new Date('2026-10-31T12:00:00Z'))).toEqual({ since: '2026-10-31T10:00:00.000Z' });   // 1 Nov, local
    process.env.TZ = 'America/Los_Angeles';  // UTC-7 in October
    expect(periodRange({ period: 'month', from: '', to: '' }, new Date('2026-10-01T05:00:00Z'))).toEqual({ since: '2026-09-01T07:00:00.000Z' });   // still 30 Sept, local
  });
  it('a custom range includes its last day, and a backwards one is named', () => {
    process.env.TZ = 'UTC';
    expect(periodRange({ period: 'custom', from: '2026-10-01', to: '2026-10-31' })).toEqual({ since: '2026-10-01T00:00:00.000Z', until: '2026-11-01T00:00:00.000Z' });
    expect(rangeProblem({ ...EMPTY_FILTERS, period: 'custom', from: '2026-10-31', to: '2026-10-01' })).toBe('Choose an end date on or after the start date.');
    expect(periodRange({ period: 'week', from: '', to: '' }, new Date('2026-10-08T12:00:00Z'))).toEqual({ since: '2026-10-05T00:00:00.000Z' });   // Monday
  });
});

describe('request bodies', () => {
  it('send only what is set', () => {
    process.env.TZ = 'UTC';
    const f = { ...EMPTY_FILTERS, q: '  launch ', kind: 'artifact' as const, outcomes: ['approved' as const] };
    expect(searchBody(f)).toEqual({ query: 'launch', kinds: ['artifact'], outcomes: ['approved'], limit: 25 });
    expect(browseBody(EMPTY_FILTERS, 'c1')).toEqual({ limit: 50, cursor: 'c1' });
  });
});

describe('rows', () => {
  const boards = new Map([['brd_00000000000000b1', 'Marketing & Community']]);
  it('say kind, board, station and path', () => {
    const r = { itemId: 'itm_0123456789abcdef', kind: 'artifact', title: 'T', outcome: 'completed', scope: 'board:brd_00000000000000b1', snippet: 's', url: 'u', score: 1, supersededBy: null,
      provenance: { board: 'brd_00000000000000b1', station: 'stn_1', stationName: 'docs', path: 'out/report.md' } } as SearchResult;
    expect(rowOfResult(r, boards).line).toBe('Artifact · Marketing & Community · docs · out/report.md');
    const i = { id: 'itm_0123456789abcde0', kind: 'work-record', title: 'W', outcome: 'rejected', scope: 'board:brd_00000000000000b1', createdBy: 'source:superpipeline', createdAt: '2026-10-01T00:00:00.000Z', latestVersion: 0, expiresAt: null, revokedAt: null } as ItemSummary;
    expect(rowOfItem(i, boards)).toMatchObject({ line: 'Work record · Marketing & Community', snippet: null });
  });
});
