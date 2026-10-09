import { describe, expect, it } from 'vitest';
import type { Client } from './artifacts.ts';
import { collectAddWith, resolveCollection, resultLines, scopeWith, searchBody } from './library.ts';

const NONE = { kind: null, outcome: null, board: null, agent: null, station: null, since: null, until: null, limit: null };
function fake(answers: Record<string, unknown>): { c: Client; calls: Array<[string, string, unknown]> } {
  const calls: Array<[string, string, unknown]> = [];
  const c: Client = async (method, path, body) => {
    calls.push([method, path, body]);
    const a = answers[`${method} ${path}`];
    return a === undefined ? Response.json({ error: 'not_found' }, { status: 404 }) : Response.json(a);
  };
  return { c, calls };
}
const COLS = { collections: [{ id: 'col_0123456789abcdef', name: 'Week 41', description: '', createdBy: 'p', createdAt: 't', updatedAt: 't', itemCount: 0, canEdit: true }] };

describe('suli search (spec §11)', () => {
  it('turns flags into the search body; --until includes its day', () => {
    expect(searchBody('deploy checklist', { ...NONE, kind: 'work-record', outcome: 'rejected,failed', board: 'brd_00000000000000b1', since: '2026-10-01', until: '2026-10-31', limit: '5' })).toEqual({
      query: 'deploy checklist', kinds: ['work-record'], outcomes: ['rejected', 'failed'], board: 'brd_00000000000000b1',
      since: '2026-10-01T00:00:00.000Z', until: '2026-11-01T00:00:00.000Z', limit: 5,
    });
  });
  it('refuses what the server would refuse, before sending', () => {
    expect(() => searchBody('', NONE)).toThrow('say what to look for');
    expect(() => searchBody('x', { ...NONE, outcome: 'great' })).toThrow('unknown outcome: great');
    expect(() => searchBody('x', { ...NONE, kind: 'folder' })).toThrow('--kind is artifact or work-record');
    expect(() => searchBody('x', { ...NONE, since: '1 Oct' })).toThrow('YYYY-MM-DD');
    expect(() => searchBody('x', { ...NONE, limit: '30' })).toThrow('--limit is 1 to 25');
  });
  it('prints one line per result with its outcome', () => {
    expect(resultLines([{ itemId: 'itm_0123456789abcdef', kind: 'artifact', title: 'Plan', outcome: 'rejected', scope: 'workspace', provenance: {}, snippet: 'too  costly\nfor now', url: 'u', score: 1, supersededBy: 'itm_0123456789abcde0' }]))
      .toEqual(['itm_0123456789abcdef  [rejected]  Plan', '    too costly for now', '    superseded by itm_0123456789abcde0']);
    expect(resultLines([])).toEqual(['Nothing matches.']);
  });
});

describe('suli collect', () => {
  it('finds a collection by id or by name, in any case', async () => {
    const { c } = fake({ 'GET /api/v1/collections': COLS });
    expect((await resolveCollection(c, 'week 41')).id).toBe('col_0123456789abcdef');
    expect((await resolveCollection(c, 'col_0123456789abcdef')).name).toBe('Week 41');
    await expect(resolveCollection(c, 'Week 42')).rejects.toThrow('no collection called Week 42');
  });
  it('adds an item to the collection it names', async () => {
    const { c, calls } = fake({ 'GET /api/v1/collections': COLS, 'POST /api/v1/collections/col_0123456789abcdef/items': { added: true } });
    await collectAddWith(c, 'Week 41', 'itm_0123456789abcdef', 'the keeper');
    expect(calls.at(-1)).toEqual(['POST', '/api/v1/collections/col_0123456789abcdef/items', { itemId: 'itm_0123456789abcdef', note: 'the keeper' }]);
  });
});

describe('suli scope', () => {
  it('widens to the workspace only, and refuses anything else without a request', async () => {
    const { c, calls } = fake({ 'POST /api/v1/items/itm_0123456789abcdef/scope': { item: { scope: 'workspace' } } });
    await expect(scopeWith(c, 'itm_0123456789abcdef', 'board')).rejects.toThrow('only workspace');
    expect(calls).toEqual([]);
    await scopeWith(c, 'itm_0123456789abcdef', 'workspace');
    expect(calls).toEqual([['POST', '/api/v1/items/itm_0123456789abcdef/scope', { scope: 'workspace' }]]);
  });
});
