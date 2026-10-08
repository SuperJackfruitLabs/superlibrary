import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { audit } from '../src/audit';

const db = () => env.DB;

async function seedVersion(itemId: string) {
  await db().batch([
    db().prepare(`INSERT OR IGNORE INTO workspaces (id, external_source, external_id) VALUES ('wsp_0000000000000001', 'org-plane', 'org_00000000000000000a01')`),
    db().prepare(`INSERT INTO items (id, workspace_id, kind, title, scope, created_by) VALUES (?, 'wsp_0000000000000001', 'artifact', 't', 'workspace', 'prn_000000000000000000a1')`).bind(itemId),
    db().prepare(`INSERT INTO versions (item_id, version, entry, view, media_type, total_bytes, file_count, sha256, created_by) VALUES (?, 1, 'a.md', 'markdown', 'text/markdown; charset=utf-8', 3, 1, ?, 'prn_000000000000000000a1')`).bind(itemId, 'a'.repeat(64)),
    db().prepare(`INSERT INTO version_files (item_id, version, path, sha256, bytes, media_type, view) VALUES (?, 1, 'a.md', ?, 3, 'text/markdown; charset=utf-8', 'markdown')`).bind(itemId, 'a'.repeat(64)),
  ]);
}

describe('schema', () => {
  it('versions are immutable: content columns cannot change', async () => {
    await seedVersion('itm_00000000000000a1');
    await expect(db().prepare(`UPDATE versions SET sha256 = ? WHERE item_id = 'itm_00000000000000a1'`).bind('b'.repeat(64)).run()).rejects.toThrow(/versions are immutable/);
    await expect(db().prepare(`UPDATE version_files SET sha256 = ? WHERE item_id = 'itm_00000000000000a1'`).bind('b'.repeat(64)).run()).rejects.toThrow(/versions are immutable/);
    // Revocation is not a content change: it succeeds, and it is the only thing that changed.
    await db().prepare(`UPDATE versions SET revoked_at = datetime('now'), revoked_by = 'prn_000000000000000000a1' WHERE item_id = 'itm_00000000000000a1'`).run();
    const row = await db().prepare(`SELECT revoked_at, revoked_by, sha256 FROM versions WHERE item_id = 'itm_00000000000000a1'`).first<{ revoked_at: string | null; revoked_by: string | null; sha256: string }>();
    expect(row?.revoked_at).toBeTruthy();
    expect(row?.revoked_by).toBe('prn_000000000000000000a1');
    expect(row?.sha256).toBe('a'.repeat(64));
  });

  it('the audit log is append-only', async () => {
    await audit(db(), { workspaceId: 'wsp_0000000000000001', actor: 'prn_000000000000000000a1', action: 'item.read', itemId: 'itm_00000000000000a1' }).run();
    await expect(db().prepare(`UPDATE audit_events SET action = 'x'`).run()).rejects.toThrow(/append-only/);
    await expect(db().prepare(`DELETE FROM audit_events`).run()).rejects.toThrow(/append-only/);
  });

  it('one workspace per organization-plane org', async () => {
    // Seeds its own pair, so it fails without the unique index however the other tests ran.
    await db().prepare(`INSERT INTO workspaces (id, external_source, external_id) VALUES ('wsp_0000000000000003', 'org-plane', 'org_00000000000000000b01')`).run();
    await expect(
      db().prepare(`INSERT INTO workspaces (id, external_source, external_id) VALUES ('wsp_0000000000000004', 'org-plane', 'org_00000000000000000b01')`).run(),
    ).rejects.toThrow(/UNIQUE/);
    const n = await db().prepare(`SELECT COUNT(*) AS n FROM workspaces WHERE external_id = 'org_00000000000000000b01'`).first<{ n: number }>();
    expect(n?.n).toBe(1);
  });

  it('refuses an unknown scope or outcome', async () => {
    await expect(db().prepare(`INSERT INTO items (id, workspace_id, kind, title, scope, created_by) VALUES ('itm_00000000000000a2', 'wsp_0000000000000001', 'artifact', 't', 'public', 'prn_000000000000000000a1')`).run()).rejects.toThrow(/CHECK/);
    await expect(db().prepare(`INSERT INTO items (id, workspace_id, kind, title, scope, outcome, created_by) VALUES ('itm_00000000000000a3', 'wsp_0000000000000001', 'artifact', 't', 'workspace', 'great', 'prn_000000000000000000a1')`).run()).rejects.toThrow(/CHECK/);
  });
});
