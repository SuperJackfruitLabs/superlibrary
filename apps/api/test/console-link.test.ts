import { env } from 'cloudflare:test';
import { afterEach, describe, expect, it } from 'vitest';
import type { ItemSummary } from '@superlibrary/contract';
import { AGENT, HUMAN, HUMAN_2, planeToken, withOrgPlane } from './helpers/org-plane';
import { HUB_SVC, hubHeaders, upload } from './helpers/upload';
import { fakeHub } from './helpers/fake-hub';
import { B1, call, workspaceOf } from './helpers/library';
import { sourcesOf } from '../src/search/search';

const STN = 'stn_00000000000000c1';
let restore: (() => void) | null = null;
afterEach(() => { restore?.(); restore = null; });
const mine = (seen?: string[]) => { restore = fakeHub({ [STN]: { key: 'notes-station', owner: HUMAN } }, seen); };
const sessions = async () => (await env.DB.prepare(`SELECT COUNT(*) AS n FROM upload_sessions`).first<{ n: number }>())!.n;

describe("a person's console link (gap S1)", () => {
  it('records the station, its name and the path, and names the person', async () => {
    await workspaceOf();
    mine();
    const r = await upload([{ path: 'report.md', body: '# Report' }], { title: 'report.md', stationFile: { station: STN, path: 'out/report.md' } });
    expect(r.status).toBe(201);
    const src = await env.DB.prepare(`SELECT source, station, station_name, source_path, linked_by, agent_principal, via_service FROM item_sources WHERE item_id = ?`).bind(r.body.itemId).first();
    expect(src).toEqual({ source: 'agentpod', station: STN, station_name: 'notes-station', source_path: 'out/report.md', linked_by: HUMAN, agent_principal: null, via_service: null });
    const shown = await (await call(`/api/v1/items/${r.body.itemId}`)).json<{ item: ItemSummary }>();
    expect(shown.item.source).toMatchObject({ sourceKind: 'agentpod', agent: false, station: STN, stationName: 'notes-station', path: 'out/report.md', linkedBy: HUMAN });
    // Search and related name the person too (their provenance comes from sourcesOf).
    expect((await sourcesOf(env, [r.body.itemId])).get(r.body.itemId)).toMatchObject({ sourceKind: 'agentpod', agent: false, station: STN, path: 'out/report.md', linkedBy: HUMAN });
  });
  it('the same path linked again by the same person is the next version', async () => {
    await workspaceOf();
    mine();
    const first = await upload([{ path: 'a.md', body: '# one' }], { title: 'a.md', stationFile: { station: STN, path: 'docs/a.md' } });
    const again = await upload([{ path: 'a.md', body: '# two' }], { title: 'a.md', stationFile: { station: STN, path: 'docs/a.md' } });
    expect(again.body).toMatchObject({ itemId: first.body.itemId, version: 2 });
  });
  it("someone else's station, or one the hub does not know, is refused the same way and nothing is stored", async () => {
    await workspaceOf(); await workspaceOf(HUMAN_2);
    restore = fakeHub({ [STN]: { key: 'notes-station', owner: HUMAN_2 } });
    const before = await sessions();
    const theirs = await upload([{ path: 'x.md', body: '# x' }], { title: 'x', stationFile: { station: STN, path: 'x.md' } });
    const unknown = await upload([{ path: 'x.md', body: '# x' }], { title: 'x', stationFile: { station: 'stn_00000000000000ff', path: 'x.md' } });
    expect([theirs.status, unknown.status]).toEqual([403, 403]);
    expect(theirs.body).toEqual(unknown.body);   // no oracle for which stations exist
    expect(theirs.body.error).toBe('station_not_yours');
    expect(await sessions()).toBe(before);
  });
  it('a station id the hub could never hold is refused the same way, without asking the hub', async () => {
    await workspaceOf();
    const seen: string[] = [];
    mine(seen);
    const r = await upload([{ path: 'x.md', body: '# x' }], { title: 'x', stationFile: { station: '..', path: 'x.md' } });
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('station_not_yours');
    expect(seen.filter((u) => u.startsWith('https://hub.test'))).toEqual([]);
  });
  it.each(['down', 'unreachable'] as const)('the hub %s refuses with 502 and records nothing', async (mode) => {
    await workspaceOf();
    restore = fakeHub(mode);
    const before = await sessions();
    const r = await upload([{ path: 'x.md', body: '# x' }], { title: 'x', stationFile: { station: STN, path: 'x.md' } });
    expect(r.status).toBe(502);
    expect(r.body.error).toBe('hub_unreachable');
    expect(await sessions()).toBe(before);
  });
  it("the path is checked like any link's, and a station file never comes with a source or an item", async () => {
    await workspaceOf();
    mine();
    expect((await upload([{ path: 'e', body: 'K=v' }], { title: 'e', stationFile: { station: STN, path: '.env' } })).status).toBe(400);
    const a = await upload([{ path: 'b.md', body: '# b' }], { title: 'b' });
    expect((await upload([{ path: 'b.md', body: '# b2' }], { title: 'b', item: a.body.itemId, stationFile: { station: STN, path: 'b.md' } })).status).toBe(400);
  });
  it('R-H1 is unchanged: an agent may not send a station file, a person may not send a source, a delegated person token is refused', async () => {
    const bag = env as unknown as Record<string, unknown>;
    bag.HUB_SERVICE_PRINCIPAL = HUB_SVC;
    mine();   // before withOrgPlane, so each restores the fetch it wrapped
    try {
      await withOrgPlane(async () => {
        // A valid hub link in every other way (its board scope), so only the station file refuses it.
        const asAgent = await upload([{ path: 'g.md', body: '# g' }], { title: 'g', scope: `board:${B1}`, headers: await hubHeaders(AGENT), stationFile: { station: STN, path: 'g.md' }, source: { station: STN, path: 'g.md', board: B1 } });
        expect(asAgent.status).toBe(400);
        expect(asAgent.body).toMatchObject({ error: 'invalid', detail: 'an agent links through AgentPod, with its source' });
        const own = await planeToken({ sub: HUMAN, principalKind: 'human' });
        const asPerson = await upload([{ path: 'g.md', body: '# g' }], { title: 'g', headers: { Authorization: `Bearer ${own}` }, source: { station: STN, path: 'g.md', board: B1 } });
        expect(asPerson.status).toBe(403);
        const delegated = await planeToken({ sub: HUMAN, principalKind: 'human', act: { sub: HUB_SVC } });
        const r = await upload([{ path: 'g.md', body: '# g' }], { title: 'g', headers: { Authorization: `Bearer ${delegated}` }, stationFile: { station: STN, path: 'g.md' } });
        expect(r.status).toBe(403);
      });
    } finally { bag.HUB_SERVICE_PRINCIPAL = ''; }
  });
});

describe('0041: the agentpod CHECK', () => {
  it('takes an agent with the hub, or a person alone with a station and a path, and nothing in between', async () => {
    const ws = await workspaceOf();
    await env.DB.prepare(`INSERT INTO items (id, workspace_id, kind, title, scope, created_by) VALUES ('itm_00000000000025c1', ?, 'artifact', 't', 'workspace', ?)`).bind(ws, HUMAN).run();
    const put = (cols: string, vals: unknown[]) => env.DB.prepare(`INSERT INTO item_sources (item_id, source, ${cols}) VALUES ('itm_00000000000025c1', 'agentpod', ${vals.map(() => '?').join(', ')})`).bind(...vals).run();
    await expect(put('station, source_path', [STN, 'a.md'])).rejects.toThrow(/CHECK/);                                     // nobody named
    await expect(put('linked_by, agent_principal, via_service, station, source_path', [HUMAN, AGENT, HUB_SVC, STN, 'a.md'])).rejects.toThrow(/CHECK/);   // both
    await expect(put('linked_by, station', [HUMAN, STN])).rejects.toThrow(/CHECK/);                                       // no path
    await put('linked_by, station, source_path', [HUMAN, STN, 'a.md']);
  });
});

/**
 * P4-C2: 0041 rebuilds a live table. Put item_sources back as 0004 + 0040 left it, fill it with rows
 * shaped like production's (agent links with station and path, superpipeline records, a person's
 * upload row), apply 0041 exactly as D1 does (one transaction), and compare.
 */
describe('0041 on a table shaped like production', () => {
  const queries = (name: string) => env.TEST_MIGRATIONS.find((m) => m.name.startsWith(name))!.queries;
  const oldTable = () => {
    const all = [...queries('0004_'), ...queries('0040_')];
    return all.filter((q) => /CREATE TABLE item_sources\b|CREATE INDEX item_sources_/.test(q));
  };
  const indexes = async () => (await env.DB.prepare(`SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'item_sources' AND sql IS NOT NULL ORDER BY name`).all<{ name: string; sql: string }>()).results;

  it('copies every row and column, and recreates every index', async () => {
    const ws = await workspaceOf();
    const ids = ['itm_00000000000041a1', 'itm_00000000000041a2', 'itm_00000000000041a3', 'itm_00000000000041a4'];
    // Back to the pre-0041 table (0004's CREATE TABLE and indexes, 0040's agent index), and upload_sessions without station_file.
    await env.DB.batch([
      env.DB.prepare(`DROP TABLE item_sources`),
      ...oldTable().map((q) => env.DB.prepare(q)),
      env.DB.prepare(`ALTER TABLE upload_sessions DROP COLUMN station_file`),
      ...ids.map((id) => env.DB.prepare(`INSERT INTO items (id, workspace_id, kind, title, scope, created_by) VALUES (?, ?, 'artifact', 't', ?, ?)`).bind(id, ws, `board:${B1}`, HUMAN)),
    ]);
    const before = await indexes();
    expect(before.map((i) => i.name)).toEqual(['item_sources_agent', 'item_sources_card', 'item_sources_station_path']);
    expect((await env.DB.prepare(`PRAGMA table_info(item_sources)`).all<{ name: string }>()).results.map((c) => c.name)).not.toContain('linked_by');
    await env.DB.batch([
      // An agent's link through the hub, its station named, later marked removed.
      env.DB.prepare(`INSERT INTO item_sources (item_id, source, board_id, card_id, run_id, agent_principal, via_service, station, station_name, source_path, station_removed_at, created_at) VALUES (?, 'agentpod', ?, 'card_00000000000000c1', 'run_00000000000000d1', ?, ?, ?, 'notes-station', 'out/report.md', '2026-10-05T10:00:00.000Z', '2026-10-01T09:00:00.000Z')`).bind(ids[0], B1, AGENT, HUB_SVC, 'stn_00000000000000c1'),
      // An agent's link with no card, run or station name.
      env.DB.prepare(`INSERT INTO item_sources (item_id, source, board_id, agent_principal, via_service, station, source_path) VALUES (?, 'agentpod', ?, ?, ?, 'stn_00000000000000c2', 'a/b.md')`).bind(ids[1], B1, AGENT, HUB_SVC),
      // A Superpipeline work record's source.
      env.DB.prepare(`INSERT INTO item_sources (item_id, source, board_id, card_id, stage, source_id, source_url) VALUES (?, 'superpipeline', ?, 'card_00000000000000c3', 'publish', 'card_00000000000000c3', 'https://pipeline.test/b/brd_00000000000000b1/c/card_00000000000000c3')`).bind(ids[2], B1),
      // A person's upload row: no station, no path.
      env.DB.prepare(`INSERT INTO item_sources (item_id, source) VALUES (?, 'upload')`).bind(ids[3]),
    ]);
    const rowsBefore = (await env.DB.prepare(`SELECT * FROM item_sources ORDER BY item_id`).all()).results;
    expect(rowsBefore).toHaveLength(4);

    await env.DB.batch(queries('0041_').map((q) => env.DB.prepare(q)));

    const rowsAfter = (await env.DB.prepare(`SELECT * FROM item_sources ORDER BY item_id`).all()).results;
    expect(rowsAfter).toEqual(rowsBefore.map((r) => ({ ...r, linked_by: null })));
    const after = await indexes();
    expect(after).toEqual(before);
    expect((await env.DB.prepare(`PRAGMA table_info(upload_sessions)`).all<{ name: string }>()).results.map((c) => c.name)).toContain('station_file');
    expect((await env.DB.prepare(`PRAGMA foreign_key_check`).all()).results).toEqual([]);
  });
});
