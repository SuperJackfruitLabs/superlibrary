import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import type { BrowsePage, Facets } from '@superlibrary/contract';
import { AGENT, planeToken, withOrgPlane } from './helpers/org-plane';
import { B1, B2, call, knowBoard, seedWorkRecord, workspaceOf } from './helpers/library';

let ws: string;
beforeEach(async () => {
  ws = await workspaceOf();
  await knowBoard(ws, B1, 'Marketing & Community');
  await knowBoard(ws, B2, 'Build');
});
const browse = async (body: unknown) => {
  const res = await call('/api/v1/browse', { method: 'POST', body });
  expect(res.status).toBe(200);
  return res.json<BrowsePage>();
};

describe('browse (spec §11)', () => {
  it('lists newest activity first, pages with a cursor, and counts every outcome', async () => {
    // Each test uses its own board, so the suite holds whether or not storage is isolated per test.
    const BA = 'brd_000000000000a000';
    await knowBoard(ws, BA, 'Paging');
    await seedWorkRecord({ id: 'itm_00000000000001a1', ws, board: BA, outcome: 'approved', updatedAt: '2026-10-01T10:00:00.000Z' });
    await seedWorkRecord({ id: 'itm_00000000000001a2', ws, board: BA, outcome: 'rejected', updatedAt: '2026-10-02T10:00:00.000Z' });
    await seedWorkRecord({ id: 'itm_00000000000001a3', ws, board: BA, outcome: 'rejected', updatedAt: '2026-10-03T10:00:00.000Z' });
    const first = await browse({ limit: 2, kinds: ['work-record'], board: BA });
    expect(first.items.map((i) => i.id)).toEqual(['itm_00000000000001a3', 'itm_00000000000001a2']);
    expect(first.counts).toMatchObject({ approved: 1, rejected: 2, failed: 0 });
    const second = await browse({ limit: 2, kinds: ['work-record'], board: BA, cursor: first.next });
    expect(second.items.map((i) => i.id)).toEqual(['itm_00000000000001a1']);
    expect(second.next).toBeNull();
  });
  it('an outcome view: everything rejected on one board this month', async () => {
    const BB = 'brd_000000000000b000';
    await knowBoard(ws, BB, 'Outcome view');
    await seedWorkRecord({ id: 'itm_00000000000001b1', ws, board: BB, outcome: 'rejected', updatedAt: '2026-10-05T10:00:00.000Z' });
    await seedWorkRecord({ id: 'itm_00000000000001b2', ws, board: BB, outcome: 'rejected', updatedAt: '2026-09-30T23:00:00.000Z' });
    await seedWorkRecord({ id: 'itm_00000000000001b3', ws, board: B2, outcome: 'rejected', updatedAt: '2026-10-05T10:00:00.000Z' });
    await seedWorkRecord({ id: 'itm_00000000000001b4', ws, board: BB, outcome: 'approved', updatedAt: '2026-10-05T10:00:00.000Z' });
    const page = await browse({ outcomes: ['rejected'], board: BB, since: '2026-10-01T00:00:00.000Z', until: '2026-11-01T00:00:00.000Z' });
    expect(page.items.map((i) => i.id)).toEqual(['itm_00000000000001b1']);
    // Counts drop the outcome filter only: the approved one on the same board and month is counted.
    expect(page.counts).toMatchObject({ rejected: 1, approved: 1 });
  });
  it('never lists or counts what the person cannot see', async () => {
    const B3 = 'brd_00000000000000b3';   // a board Superlibrary does not know
    await seedWorkRecord({ id: 'itm_00000000000001c1', ws, board: B3, outcome: 'failed' });
    const page = await browse({ outcomes: ['failed'] });
    expect(page.items.map((i) => i.id)).not.toContain('itm_00000000000001c1');
    expect(page.counts.failed).toBe(0);
  });
  it('refuses a cursor it did not issue', async () => {
    const res = await call('/api/v1/browse', { method: 'POST', body: { cursor: "x' OR 1=1 --" } });
    expect(res.status).toBe(400);
  });
  it('an agent is refused (people only, P13)', async () => {
    await withOrgPlane(async () => {
      const t = await planeToken({ sub: AGENT, principalKind: 'agent' });
      const res = await call('/api/v1/browse', { method: 'POST', body: {}, headers: { Authorization: `Bearer ${t}` } });
      expect(res.status).toBe(403);
      expect((await call('/api/v1/facets', { headers: { Authorization: `Bearer ${t}` } })).status).toBe(403);
    });
  });
});

describe('facets', () => {
  it('offers the known boards by name, and only agents and stations of visible items', async () => {
    await seedWorkRecord({ id: 'itm_00000000000001d1', ws });
    await seedWorkRecord({ id: 'itm_00000000000001d2', ws, board: 'brd_00000000000000b3' });   // unknown board: hidden
    await env.DB.prepare(`UPDATE item_sources SET agent_principal = 'prn_000000000000000000a2', station = 'stn_01', station_name = 'docs-station' WHERE item_id = 'itm_00000000000001d1'`).run();
    await env.DB.prepare(`UPDATE item_sources SET agent_principal = 'prn_0000000000000000a9a9', station = 'stn_09' WHERE item_id = 'itm_00000000000001d2'`).run();
    const res = await call('/api/v1/facets');
    const f = await res.json<Facets>();
    const names = f.boards.map((b) => b.name);
    expect(names.indexOf('Build')).toBeLessThan(names.indexOf('Marketing & Community'));   // by name
    expect(f.boards).toEqual(expect.arrayContaining([{ id: B2, name: 'Build' }, { id: B1, name: 'Marketing & Community' }]));
    expect(f.agents).toContain('prn_000000000000000000a2');
    expect(f.agents).not.toContain('prn_0000000000000000a9a9');
    expect(f.stations).toContainEqual({ id: 'stn_01', name: 'docs-station' });
    expect(f.stations.map((s) => s.id)).not.toContain('stn_09');
  });
});
