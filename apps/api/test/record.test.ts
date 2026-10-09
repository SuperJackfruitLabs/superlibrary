import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import type { WorkRecordView } from '@superlibrary/contract';
import { AGENT, HUMAN_2, devHeaders, planeToken, withOrgPlane } from './helpers/org-plane';
import { upload } from './helpers/upload';
import { B1, call, knowBoard, recordBody, seedWorkRecord, workspaceOf } from './helpers/library';

let ws: string;
beforeEach(async () => {
  ws = await workspaceOf();
  await knowBoard(ws, B1, 'Marketing & Community');
});
const linkTo = (recordId: string, itemId: string) =>
  env.DB.prepare(`INSERT OR IGNORE INTO item_references (item_id, from_kind, from_id) VALUES (?, 'work-record', ?)`).bind(itemId, recordId).run();

describe('the work-record view (spec §11 "work-record timelines")', () => {
  it('a person reads the whole record with the artifacts it links that they can see', async () => {
    await seedWorkRecord({ id: 'itm_00000000000002a1', ws });
    const mine = await upload([{ path: 'post.md', body: '# Launch' }], { title: 'Launch draft' });
    const hidden = await upload([{ path: 'x.md', body: '# x' }], { title: 'Not yours', scope: 'board:brd_00000000000000b9', headers: devHeaders(HUMAN_2) });
    await linkTo('itm_00000000000002a1', mine.body.itemId);
    await linkTo('itm_00000000000002a1', hidden.body.itemId);
    const res = await call('/api/v1/items/itm_00000000000002a1/record');
    expect(res.status).toBe(200);
    const v = await res.json<WorkRecordView>();
    expect(v.item).toMatchObject({ id: 'itm_00000000000002a1', kind: 'work-record' });
    expect(v.boardName).toBe('Marketing & Community');
    expect(v.record.handoffs.map((h) => [h.stage, h.attempt, h.status])).toEqual([['draft', 1, 'failed'], ['draft', 2, 'completed']]);
    expect(v.record.comments[0]!.body).toContain('<img src=x');   // stored as text; the app renders it as text
    expect(v.artifacts.map((a) => a.id)).toEqual([mine.body.itemId]);
    const audited = await env.DB.prepare(`SELECT detail FROM audit_events WHERE item_id = ? AND action = 'item.read' ORDER BY rowid DESC LIMIT 1`).bind('itm_00000000000002a1').first<{ detail: string }>();
    expect(JSON.parse(audited!.detail)).toEqual({ via: 'record' });
  });
  it('an artifact is not a work record', async () => {
    const a = await upload([{ path: 'a.md', body: '# a' }], { title: 'An artifact' });
    // Even with a record body on file (a corrupt row), the kind decides.
    await env.DB.prepare(`INSERT INTO work_records (item_id, workspace_id, board_id, card_id, digest, body, text) VALUES (?, ?, ?, 'card_00000000000000e9', 'd', ?, 't')`)
      .bind(a.body.itemId, ws, B1, JSON.stringify(recordBody())).run();
    expect((await call(`/api/v1/items/${a.body.itemId}/record`)).status).toBe(404);
  });
  it('a record on a board the person cannot see is not found', async () => {
    await seedWorkRecord({ id: 'itm_00000000000002a2', ws, board: 'brd_00000000000000b9' });
    expect((await call('/api/v1/items/itm_00000000000002a2/record')).status).toBe(404);
  });
  it('an agent is refused', async () => {
    await seedWorkRecord({ id: 'itm_00000000000002a3', ws });
    await withOrgPlane(async () => {
      const t = await planeToken({ sub: AGENT, principalKind: 'agent' });
      expect((await call('/api/v1/items/itm_00000000000002a3/record', { headers: { Authorization: `Bearer ${t}` } })).status).toBe(403);
    });
  });
  it('an expired record is gone (410), as for any read', async () => {
    await seedWorkRecord({ id: 'itm_00000000000002a4', ws });
    await env.DB.prepare(`UPDATE items SET expires_at = '2020-01-01T00:00:00.000Z' WHERE id = ?`).bind('itm_00000000000002a4').run();
    const res = await call('/api/v1/items/itm_00000000000002a4/record');
    expect(res.status).toBe(410);
    expect(await res.json()).toMatchObject({ error: 'expired' });
  });
});
