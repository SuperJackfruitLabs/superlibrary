import { env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SearchQuery } from '@superlibrary/contract';
import { indexItem } from '../src/indexing/consumer';
import { setIndexingForTests } from '../src/indexing/vector-index';
import { search } from '../src/search/search';
import type { Person } from '../src/auth/caller';
import { fakeEmbedder, fakeVectorize } from './helpers/fake-vectors';
import { seedRecord } from './helpers/records';
import { knowBoard } from './helpers/library';

const WS = 'wsp_00000000000000f1';
const ORG = 'org_00000000000000000f01';
const A2 = 'prn_000000000000000000a2';
const person: Person = { kind: 'human', principalId: 'prn_000000000000000000a1', org: ORG, workspaceId: WS, role: 'member', act: null };

async function seed(id: string, o: { agent?: string; station?: string; stationName?: string; updatedAt: string }) {
  await seedRecord({ id, ws: WS, text: 'release notes for the payments service', title: `Notes ${id}` });
  await env.DB.prepare(`UPDATE item_sources SET agent_principal = ?, station = ?, station_name = ? WHERE item_id = ?`).bind(o.agent ?? null, o.station ?? null, o.stationName ?? null, id).run();
  await env.DB.prepare(`UPDATE work_records SET source_updated_at = ? WHERE item_id = ?`).bind(o.updatedAt, id).run();
  await indexItem(env, id);
}
const ids = async (q: Record<string, unknown>) => (await search(env, person, SearchQuery.parse({ query: 'release notes', ...q }))).map((r) => r.itemId).sort();

let vec: ReturnType<typeof fakeVectorize>;
beforeEach(async () => {
  vec = fakeVectorize();
  setIndexingForTests({ embedders: { 'workers-ai/bge-m3': fakeEmbedder() }, bindings: { a: vec } });
  await env.DB.prepare(`INSERT OR IGNORE INTO workspaces (id, external_source, external_id) VALUES (?, 'org-plane', ?)`).bind(WS, ORG).run();
  await knowBoard(WS);
});
afterEach(() => setIndexingForTests(null));

describe('search filters (spec §11)', () => {
  it('filters by agent, station and last activity, in both the words and the meaning paths', async () => {
    await seed('itm_00000000000000f1', { agent: A2, station: 'stn_01', stationName: 'docs-station', updatedAt: '2026-09-15T10:00:00.000Z' });
    await seed('itm_00000000000000f2', { updatedAt: '2026-10-15T10:00:00.000Z' });
    const expectFiltered = async () => {
      expect(await ids({})).toEqual(['itm_00000000000000f1', 'itm_00000000000000f2']);
      expect(await ids({ agent: A2 })).toEqual(['itm_00000000000000f1']);
      expect(await ids({ station: 'stn_01' })).toEqual(['itm_00000000000000f1']);
      expect(await ids({ station: 'docs-station' })).toEqual(['itm_00000000000000f1']);
      expect(await ids({ since: '2026-10-01T00:00:00.000Z' })).toEqual(['itm_00000000000000f2']);
      expect(await ids({ until: '2026-10-01T00:00:00.000Z' })).toEqual(['itm_00000000000000f1']);
      expect(await ids({ agent: 'prn_000000000000000000ff' })).toEqual([]);
    };
    // Each path alone, so neither can hide the other's missing filter.
    const query = vec.query;
    vec.query = (async () => { throw new Error('vectorize down'); }) as typeof vec.query;
    await expectFiltered();   // the words path only
    vec.query = query;
    await env.DB.prepare(`DELETE FROM chunks_fts WHERE item_id IN ('itm_00000000000000f1', 'itm_00000000000000f2')`).run();
    await expectFiltered();   // the meaning path only
  });
  it('names the station by its readable key in every result (reconciled, A15)', async () => {
    await seed('itm_00000000000000f3', { agent: A2, station: 'stn_03', stationName: 'notes-station', updatedAt: '2026-10-15T10:00:00.000Z' });
    const r = (await search(env, person, SearchQuery.parse({ query: 'release notes' }))).find((x) => x.itemId === 'itm_00000000000000f3');
    expect(r!.provenance).toMatchObject({ station: 'stn_03', stationName: 'notes-station' });
  });
});
