// packages/contract/test/library.test.ts
import { describe, expect, it } from 'vitest';
import { BrowseQuery, CaptionBody, CollectionAdd, CollectionCreate, CollectionPatch, RemoveBody, SearchQuery, SupersedeBody } from '../src';

const A = 'prn_000000000000000000a2';

describe('library filters (spec §11)', () => {
  it('search takes kind, outcome, board, agent, station and a date range', () => {
    const q = SearchQuery.parse({
      query: 'deploy', kinds: ['artifact'], outcomes: ['rejected'], board: 'brd_00000000000000b1', agent: A, station: 'stn-1',
      since: '2026-10-01T00:00:00.000Z', until: '2026-11-01T00:00:00.000Z',
    });
    expect(q).toMatchObject({ agent: A, station: 'stn-1', since: '2026-10-01T00:00:00.000Z', limit: 10 });
  });
  it('refuses a range that ends before or when it starts', () => {
    expect(SearchQuery.safeParse({ query: 'x', since: '2026-11-01T00:00:00.000Z', until: '2026-10-01T00:00:00.000Z' }).success).toBe(false);
    expect(BrowseQuery.safeParse({ since: '2026-11-01T00:00:00.000Z', until: '2026-11-01T00:00:00.000Z' }).success).toBe(false);
  });
  it('stays strict: an unknown filter is refused, never dropped (contract-boundary rule)', () => {
    expect(SearchQuery.safeParse({ query: 'x', owner: 'me' }).success).toBe(false);
    expect(BrowseQuery.safeParse({ query: 'x' }).success).toBe(false);
  });
  it('refuses an agent that is not a principal id and an empty station', () => {
    expect(SearchQuery.safeParse({ query: 'x', agent: 'some-agent' }).success).toBe(false);
    expect(BrowseQuery.safeParse({ station: '   ' }).success).toBe(false);
  });
  it('browse needs no words and pages at most 100', () => {
    expect(BrowseQuery.parse({})).toEqual({ limit: 50 });
    expect(BrowseQuery.safeParse({ limit: 101 }).success).toBe(false);
    expect(BrowseQuery.safeParse({ collection: 'col_0123456789abcdef', cursor: 'x' }).success).toBe(true);
    expect(BrowseQuery.safeParse({ collection: 'week-41' }).success).toBe(false);
  });
});

describe('collections and moderation bodies', () => {
  it('collections', () => {
    expect(CollectionCreate.parse({ name: ' Week 41 ' })).toEqual({ name: 'Week 41', description: '' });
    expect(CollectionCreate.safeParse({ name: '' }).success).toBe(false);
    expect(CollectionPatch.safeParse({}).success).toBe(false);
    expect(CollectionAdd.safeParse({ itemId: 'itm_0123456789abcdef', extra: 1 }).success).toBe(false);
  });
  it('moderation', () => {
    expect(SupersedeBody.safeParse({ by: null }).success).toBe(true);
    expect(SupersedeBody.safeParse({ by: 'itm_x' }).success).toBe(false);
    expect(CaptionBody.parse({ caption: '  A diagram of the queue  ' })).toEqual({ caption: 'A diagram of the queue' });
    expect(RemoveBody.safeParse({ reason: '  ' }).success).toBe(false);
    expect(RemoveBody.parse({ reason: 'posted by mistake' })).toEqual({ reason: 'posted by mistake' });
  });
});
