import { createMessageBatch, createScheduledController, env, getQueueResult, createExecutionContext } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';
import worker from '../src/index';
import wranglerRaw from '../wrangler.jsonc?raw';
import { RECONCILE_CRON } from '../src/indexing/consumer';
import type { RetentionMessage } from '../src/env';
import { deleteItem, sweep, RETENTION_CRON } from '../src/lifecycle/retention';
import { sha256Hex, upload } from './helpers/upload';

const DAY = 86_400_000;
const SECRET = 'const t = "' + 'gh' + 'p_' + 'aB3xQ9zK7mP2wR5t'.repeat(3) + '";';
const VERSIONS_IMMUTABLE = env.TEST_MIGRATIONS.flatMap((m) => m.queries).find((q) => q.includes('CREATE TRIGGER versions_immutable'))!;
/** Ages an item and every version of it. Versions are immutable, so the trigger steps aside for the test only. */
const age = (itemId: string, days: number, versions: number[] | 'all' = 'all') =>
  env.DB.batch([
    env.DB.prepare(`UPDATE items SET created_at = datetime('now', ?) WHERE id = ?`).bind(`-${days} days`, itemId),
    env.DB.prepare(`DROP TRIGGER versions_immutable`),
    versions === 'all'
      ? env.DB.prepare(`UPDATE versions SET created_at = datetime('now', ?) WHERE item_id = ?`).bind(`-${days} days`, itemId)
      : env.DB.prepare(`UPDATE versions SET created_at = datetime('now', ?) WHERE item_id = ? AND version IN (${versions.join(',')})`).bind(`-${days} days`, itemId),
    env.DB.prepare(VERSIONS_IMMUTABLE),
  ]);
const wouldDeleteRows = async (itemId: string) =>
  (await env.DB.prepare(`SELECT COUNT(*) AS n FROM audit_events WHERE action = 'retention.would_delete' AND item_id = ?`).bind(itemId).first<{ n: number }>())!.n;
const exists = async (itemId: string) => (await env.DB.prepare(`SELECT 1 FROM items WHERE id = ?`).bind(itemId).first()) !== null;
const asMode = (mode: 'report' | 'enforce') => ({ ...env, RETENTION_MODE: mode });
const keysUnder = async (prefix: string) => (await env.BLOBS.list({ prefix })).objects.map((o) => o.key);

describe('retention sweep (spec §12, plan D14)', () => {
  it('in report mode, an unreferenced 31-day-old artifact is kept and reported', async () => {
    const r = await upload([{ path: 'old.txt', body: 'old report-mode' }]);
    await age(r.body.itemId, 31);
    const report = await sweep(asMode('report'), Date.now());
    expect(report.unreferenced).toContain(r.body.itemId);
    expect(report.deletedUnreferenced).toBe(false);
    expect(await exists(r.body.itemId)).toBe(true);
    const would = await env.DB.prepare(`SELECT actor FROM audit_events WHERE action = 'retention.would_delete' AND item_id = ?`).bind(r.body.itemId).first<{ actor: string }>();
    expect(would?.actor).toBe('retention');
  });

  it('in enforce mode it is deleted with its bytes; a referenced one and a young one are kept', async () => {
    const old = await upload([{ path: 'old.txt', body: 'old enforce' }]);
    const kept = await upload([{ path: 'kept.txt', body: 'referenced' }]);
    const young = await upload([{ path: 'young.txt', body: 'young' }]);
    await age(old.body.itemId, 31);
    await age(kept.body.itemId, 31);
    await age(young.body.itemId, 29);
    await env.DB.prepare(`INSERT INTO item_references (item_id, from_kind, from_id) VALUES (?, 'card', 'crd_0000000000000001')`).bind(kept.body.itemId).run();
    const report = await sweep(asMode('enforce'), Date.now());
    expect(report.deletedUnreferenced).toBe(true);
    expect(await exists(old.body.itemId)).toBe(false);
    expect(await env.BLOBS.head(`blobs/${old.body.sha256}`)).toBeNull();
    expect(await env.BLOBS.head(`manifests/${old.body.itemId}/1.json`)).toBeNull();
    expect(await exists(kept.body.itemId)).toBe(true);
    expect(await exists(young.body.itemId)).toBe(true);
  });

  it('report mode records each would-be deletion once, not once per sweep', async () => {
    const r = await upload([{ path: 'old.txt', body: 'reported once' }]);
    await age(r.body.itemId, 31);
    await sweep(asMode('report'), Date.now());
    await sweep(asMode('report'), Date.now());
    expect(await wouldDeleteRows(r.body.itemId)).toBe(1);
  });

  it('staleness counts from the newest version: an old item with a new version is kept in enforce mode', async () => {
    const r = await upload([{ path: 'a.txt', body: 'v1 long ago' }]);
    await upload([{ path: 'a.txt', body: 'v2 yesterday' }], { item: r.body.itemId });
    await age(r.body.itemId, 40, [1]);
    await age(r.body.itemId, 1, [2]);
    await env.DB.prepare(`UPDATE items SET created_at = datetime('now', '-40 days') WHERE id = ?`).bind(r.body.itemId).run();
    const report = await sweep(asMode('enforce'), Date.now());
    expect(report.unreferenced).not.toContain(r.body.itemId);
    expect(await exists(r.body.itemId)).toBe(true);
  });

  it('abandoned uploads and quarantine are cleared before the stale step, so its failure cannot starve them', async () => {
    const s = await upload([{ path: 'a.ts', body: `starved\n${SECRET}` }], { commit: false });
    const db = env.DB;
    const failing = new Proxy(db, {
      get(target, prop) {
        if (prop === 'prepare') {
          return (sql: string) => {
            if (sql.includes('item_references r')) throw new Error('stale step failed');
            return target.prepare(sql);
          };
        }
        const v = Reflect.get(target, prop);
        return typeof v === 'function' ? v.bind(target) : v;
      },
    });
    await expect(sweep({ ...asMode('report'), DB: failing }, Date.now() + 2 * DAY)).rejects.toThrow('stale step failed');
    expect(await env.DB.prepare(`SELECT 1 FROM upload_sessions WHERE id = ?`).bind(s.uploadId).first()).toBeNull();
    expect(await keysUnder(`quarantine/${s.uploadId}/`)).toEqual([]);
  });

  it('deleting one item keeps a blob another item still uses', async () => {
    const a = await upload([{ path: 'a.txt', body: 'shared bytes' }]);
    const b = await upload([{ path: 'b.txt', body: 'shared bytes' }]);
    await env.DB.prepare(`UPDATE items SET expires_at = ? WHERE id = ?`).bind(new Date(Date.now() - 1000).toISOString(), a.body.itemId).run();
    await sweep(asMode('report'), Date.now());
    expect(await exists(a.body.itemId)).toBe(false);
    expect(await env.BLOBS.head(`blobs/${b.body.sha256}`)).not.toBeNull();
  });

  it('deleteItem removes every row of an item with versions, files and references, children first', async () => {
    const r = await upload([{ path: 'x/a.txt', body: 'fk one' }, { path: 'x/b.txt', body: 'fk two' }]);
    await upload([{ path: 'a.txt', body: 'fk three' }], { item: r.body.itemId });
    await env.DB.prepare(`INSERT INTO item_references (item_id, from_kind, from_id) VALUES (?, 'collection', 'col_0000000000000001')`).bind(r.body.itemId).run();
    const gone = await deleteItem(env, r.body.itemId, 'retention', 'test');
    expect(gone).toHaveLength(3);
    for (const t of ['versions', 'version_files', 'item_references']) {
      expect(await env.DB.prepare(`SELECT 1 FROM ${t} WHERE item_id = ?`).bind(r.body.itemId).first()).toBeNull();
    }
    expect(await exists(r.body.itemId)).toBe(false);
    expect(await keysUnder(`manifests/${r.body.itemId}/`)).toEqual([]);
  });

  it('expired items and abandoned uploads go in either mode; a second sweep changes nothing', async () => {
    const r = await upload([{ path: 'x.txt', body: 'expires' }], { expiresAt: new Date(Date.now() + 60_000).toISOString() });
    const abandoned = await upload([{ path: 'y.txt', body: 'never committed' }], { commit: false });
    const report = await sweep(asMode('report'), Date.now() + 2 * DAY);
    expect(report.expired).toContain(r.body.itemId);
    expect(report.abandonedUploads).toContain(abandoned.uploadId);
    expect(await env.DB.prepare(`SELECT 1 FROM upload_sessions WHERE id = ?`).bind(abandoned.uploadId).first()).toBeNull();
    expect(report.deletedBlobs).toContain(await sha256Hex('never committed'));
    const again = await sweep(asMode('report'), Date.now() + 2 * DAY);
    expect(again.expired).toEqual([]);
    expect(again.abandonedUploads).toEqual([]);
    const audited = await env.DB.prepare(`SELECT actor FROM audit_events WHERE action = 'item.deleted' AND item_id = ?`).bind(r.body.itemId).first<{ actor: string }>();
    expect(audited?.actor).toBe('retention');
  });

  it('an unknown cron expression does not sweep', async () => {
    const send = vi.fn();
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ctl = createScheduledController({ scheduledTime: Date.UTC(2026, 9, 9, 4), cron: '0 4 * * *' });
    await worker.scheduled!(ctl, { ...env, RETENTION: { send } as unknown as Queue<RetentionMessage> }, createExecutionContext());
    expect(send).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalledWith('no handler for cron', '0 4 * * *');
    err.mockRestore();
  });

  it('the retention cron constant is the one wrangler.jsonc declares', () => {
    // Pins the retention cron exactly; the reconcile cron (lane B) is the only other entry.
    expect(wranglerRaw).toContain(`"crons": ["${RETENTION_CRON}", "${RECONCILE_CRON}"]`);
  });

  it('the cron enqueues one sweep; the consumer runs it and acks', async () => {
    const send = vi.fn();
    const ctl = createScheduledController({ scheduledTime: Date.UTC(2026, 9, 9, 3), cron: '0 3 * * *' });
    await worker.scheduled!(ctl, { ...env, RETENTION: { send } as unknown as Queue<RetentionMessage> }, createExecutionContext());
    expect(send).toHaveBeenCalledWith({ type: 'sweep', at: '2026-10-09T03:00:00.000Z' });
    const batch = createMessageBatch<RetentionMessage>('superlibrary-retention', [{ id: 'm1', timestamp: new Date(), attempts: 1, body: { type: 'sweep', at: '2026-10-09T03:00:00.000Z' } }]);
    const ctx = createExecutionContext();
    await worker.queue!(batch, env, ctx);
    expect((await getQueueResult(batch, ctx)).explicitAcks).toEqual(['m1']);
  });
});

describe('quarantine is emptied for every session that is over (rulings T7/T8, T10)', () => {
  it('an abandoned session’s flagged bytes go with it, its rows too', async () => {
    const s = await upload([{ path: 'a.ts', body: `abandoned\n${SECRET}` }], { commit: false });
    expect(await keysUnder(`quarantine/${s.uploadId}/`)).toHaveLength(1);
    const report = await sweep(asMode('report'), Date.now() + 2 * DAY);
    expect(report.abandonedUploads).toContain(s.uploadId);
    expect(await keysUnder(`quarantine/${s.uploadId}/`)).toEqual([]);
    expect(await env.DB.prepare(`SELECT 1 FROM secret_findings WHERE session_id = ?`).bind(s.uploadId).first()).toBeNull();
    expect(await env.DB.prepare(`SELECT 1 FROM upload_files WHERE session_id = ?`).bind(s.uploadId).first()).toBeNull();
  });

  it('a live session’s quarantine is left alone', async () => {
    const s = await upload([{ path: 'a.ts', body: `live\n${SECRET}` }], { commit: false });
    const report = await sweep(asMode('report'), Date.now());
    expect(report.abandonedUploads).not.toContain(s.uploadId);
    expect(report.clearedQuarantines).not.toContain(s.uploadId);
    expect(await keysUnder(`quarantine/${s.uploadId}/`)).toHaveLength(1);
  });

  it('a committed session’s leftover quarantine is cleared without losing the version’s bytes', async () => {
    const body = `committed\n${SECRET}`;
    const sha = await sha256Hex(body);
    const c = await upload([{ path: 'a.ts', body }], { override: 'fixture' });
    expect(c.status).toBe(201);
    // A crash between the commit batch and publish: the bytes are still only in quarantine.
    await env.BLOBS.put(`quarantine/${c.uploadId}/${sha}`, body);
    await env.BLOBS.delete(`blobs/${sha}`);
    const report = await sweep(asMode('report'), Date.now());
    expect(report.clearedQuarantines).toContain(c.uploadId);
    expect(await keysUnder(`quarantine/${c.uploadId}/`)).toEqual([]);
    expect(await (await env.BLOBS.get(`blobs/${sha}`))!.text()).toBe(body);
    // Still committed: the session's record stays.
    expect(await env.DB.prepare(`SELECT state FROM upload_sessions WHERE id = ?`).bind(c.uploadId).first<{ state: string }>()).toEqual({ state: 'committed' });
  });

  it('bytes in a committed session’s quarantine that its version does not hold are not published', async () => {
    const c = await upload([{ path: 'a.txt', body: 'clean committed' }]);
    const stray = await sha256Hex('stray, never in the version');
    await env.BLOBS.put(`quarantine/${c.uploadId}/${stray}`, 'stray, never in the version');
    await sweep(asMode('report'), Date.now());
    expect(await keysUnder(`quarantine/${c.uploadId}/`)).toEqual([]);
    expect(await env.BLOBS.head(`blobs/${stray}`)).toBeNull();
  });

  it('quarantine of a session that no longer exists is deleted', async () => {
    const key = `quarantine/upl_00000000000000ff/${'0'.repeat(64)}`;
    await env.BLOBS.put(key, 'orphan');
    const report = await sweep(asMode('report'), Date.now());
    expect(report.clearedQuarantines).toContain('upl_00000000000000ff');
    expect(await env.BLOBS.head(key)).toBeNull();
    expect(await env.BLOBS.head(`blobs/${'0'.repeat(64)}`)).toBeNull();
  });
});

describe('worker entry exports guard', () => {
  it('the worker entry exports only its default handler', async () => {
    const entry = await import('../src/index');
    expect(Object.keys(entry)).toEqual(['default']);
  });
});
