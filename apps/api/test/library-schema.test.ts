import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

const WS = 'wsp_00000000000000e1';
const ensureWs = () =>
  env.DB.prepare(
    `INSERT OR IGNORE INTO workspaces (id, external_source, external_id) VALUES (?, 'org-plane', 'org_000000000000000000e1')`,
  )
    .bind(WS)
    .run();

describe('0040_library', () => {
  it('adds a caption and a person-set replacement to items', async () => {
    const cols = (await env.DB.prepare(`PRAGMA table_info(items)`).all<{ name: string }>()).results.map((c) => c.name);
    expect(cols).toEqual(expect.arrayContaining(['caption', 'superseded_by', 'superseded_prior']));
  });
  it('a collection name is unique in its workspace, ignoring case', async () => {
    await ensureWs();
    await env.DB.prepare(
      `INSERT INTO collections (id, workspace_id, name, created_by) VALUES ('col_00000000000000e1', ?, 'Week 41', 'prn_000000000000000000a1')`,
    )
      .bind(WS)
      .run();
    await expect(
      env.DB.prepare(
        `INSERT INTO collections (id, workspace_id, name, created_by) VALUES ('col_00000000000000e2', ?, 'week 41', 'prn_000000000000000000a1')`,
      )
        .bind(WS)
        .run(),
    ).rejects.toThrow(/UNIQUE/);
  });
  it('an item is in a collection once', async () => {
    await ensureWs();
    await env.DB.prepare(
      `INSERT INTO items (id, workspace_id, kind, title, scope, created_by) VALUES ('itm_00000000000000e1', ?, 'artifact', 't', 'workspace', 'prn_000000000000000000a1')`,
    )
      .bind(WS)
      .run();
    await env.DB.prepare(
      `INSERT OR IGNORE INTO collections (id, workspace_id, name, created_by) VALUES ('col_00000000000000e3', ?, 'Other', 'prn_000000000000000000a1')`,
    )
      .bind(WS)
      .run();
    const add = () =>
      env.DB.prepare(
        `INSERT INTO collection_items (collection_id, item_id, added_by) VALUES ('col_00000000000000e3', 'itm_00000000000000e1', 'prn_000000000000000000a1')`,
      ).run();
    await add();
    await expect(add()).rejects.toThrow(/UNIQUE|PRIMARY/);
  });
  it('a removed card is remembered once per workspace', async () => {
    await ensureWs();
    const put = () =>
      env.DB.prepare(
        `INSERT INTO removed_cards (workspace_id, card_id, item_id, reason, removed_by) VALUES (?, 'card_00000000000000e1', 'itm_00000000000000e9', 'duplicate', 'prn_000000000000000000a1')`,
      )
        .bind(WS)
        .run();
    await put();
    await expect(put()).rejects.toThrow(/UNIQUE|PRIMARY/);
  });
});
