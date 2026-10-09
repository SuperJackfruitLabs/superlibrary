import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

const ws = 'wsp_00000000000000f1';
async function seedItem(id: string, kind: 'artifact' | 'work-record' = 'artifact') {
  await env.DB.prepare(`INSERT OR IGNORE INTO workspaces (id, external_source, external_id) VALUES (?, 'org-plane', 'org_00000000000000000f01')`).bind(ws).run();
  await env.DB.prepare(`INSERT INTO items (id, workspace_id, kind, title, scope, outcome, created_by) VALUES (?, ?, ?, 't', 'board:brd_00000000000000b1', 'in-progress', 'source:superpipeline')`).bind(id, ws, kind).run();
}

describe('foundation schema', () => {
  it('keeps one work record per card per workspace', async () => {
    await seedItem('itm_00000000000000a1', 'work-record');
    await seedItem('itm_00000000000000a2', 'work-record');
    const put = (item: string) => env.DB.prepare(`INSERT INTO work_records (item_id, workspace_id, board_id, card_id, digest, body, text) VALUES (?, ?, 'brd_00000000000000b1', 'card_00000000000000c1', 'd', '{}', '')`).bind(item, ws).run();
    await put('itm_00000000000000a1');
    await expect(put('itm_00000000000000a2')).rejects.toThrow(/UNIQUE/);
  });
  it('searches chunks with FTS5, folding diacritics', async () => {
    await env.DB.prepare(`INSERT INTO chunks_fts (text, chunk_id, item_id) VALUES ('Le café est fermé', 'c1', 'itm_00000000000000a1')`).run();
    const r = await env.DB.prepare(`SELECT chunk_id FROM chunks_fts WHERE chunks_fts MATCH ?`).bind('"cafe"').all<{ chunk_id: string }>();
    expect(r.results.map((x) => x.chunk_id)).toEqual(['c1']);
  });
  it('seeds slot a active with bge-m3 at 1024 dims, slot b idle', async () => {
    const r = await env.DB.prepare(`SELECT slot, embedder_id, dims, state FROM vector_slots ORDER BY slot`).all();
    expect(r.results).toEqual([
      { slot: 'a', embedder_id: 'workers-ai/bge-m3', dims: 1024, state: 'active' },
      { slot: 'b', embedder_id: null, dims: null, state: 'idle' },
    ]);
  });
  it('allows at most one active slot', async () => {
    await expect(env.DB.prepare(`UPDATE vector_slots SET state = 'active' WHERE slot = 'b'`).run()).rejects.toThrow(/one active slot/);
  });
  it('refuses an unknown source', async () => {
    await seedItem('itm_00000000000000a3');
    await expect(env.DB.prepare(`INSERT INTO item_sources (item_id, source) VALUES ('itm_00000000000000a3', 'gist')`).run()).rejects.toThrow(/CHECK/);
  });

  describe('agentpod provenance names both the agent and the hub', () => {
    const put = (item: string, agent: string | null, via: string | null) =>
      env.DB.prepare(`INSERT INTO item_sources (item_id, source, agent_principal, via_service) VALUES (?, 'agentpod', ?, ?)`).bind(item, agent, via).run();
    it('refuses an agentpod row with the agent but no acting service', async () => {
      await seedItem('itm_00000000000000a4');
      await expect(put('itm_00000000000000a4', 'prn_000000000000000000a2', null)).rejects.toThrow(/CHECK/);
    });
    it('refuses an agentpod row with the acting service but no agent', async () => {
      await seedItem('itm_00000000000000a5');
      await expect(put('itm_00000000000000a5', null, 'prn_0000000000000000c0b1')).rejects.toThrow(/CHECK/);
    });
    it('refuses a value that is not a prn', async () => {
      await seedItem('itm_00000000000000a7');
      await expect(put('itm_00000000000000a7', 'prn_000000000000000000a2', 'svc:hub')).rejects.toThrow(/CHECK/);
      await expect(put('itm_00000000000000a7', 'agent:one', 'prn_0000000000000000c0b1')).rejects.toThrow(/CHECK/);
    });
    it('accepts an agentpod row naming both', async () => {
      await seedItem('itm_00000000000000a6');
      await put('itm_00000000000000a6', 'prn_000000000000000000a2', 'prn_0000000000000000c0b1');
      const r = await env.DB.prepare(`SELECT agent_principal, via_service FROM item_sources WHERE item_id = 'itm_00000000000000a6'`).first();
      expect(r).toEqual({ agent_principal: 'prn_000000000000000000a2', via_service: 'prn_0000000000000000c0b1' });
    });
  });
  it('stores the station name the hub gave', async () => {
    await seedItem('itm_00000000000000a8');
    await env.DB.prepare(`INSERT INTO item_sources (item_id, source, station, station_name) VALUES ('itm_00000000000000a8', 'upload', 'stn_1', 'readable-key')`).run();
    const r = await env.DB.prepare(`SELECT station_name FROM item_sources WHERE item_id = 'itm_00000000000000a8'`).first();
    expect(r).toEqual({ station_name: 'readable-key' });
  });
});
