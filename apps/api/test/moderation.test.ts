import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ItemSummary } from '@superlibrary/contract';
import { extractText } from '../src/indexing/extract';
import { loadItem } from '../src/items/visibility';
import { supersededByMap } from '../src/search/search';
import { AGENT, HUMAN_2, devHeaders, planeToken, withOrgPlane } from './helpers/org-plane';
import { upload } from './helpers/upload';
import { B1, call, knowBoard, seedWorkRecord, workspaceOf } from './helpers/library';

const HUMAN_3 = 'prn_000000000000000000a6';
let ws: string;
beforeEach(async () => { ws = await workspaceOf(); await workspaceOf(HUMAN_2); await workspaceOf(HUMAN_3); await knowBoard(ws, B1); });
const art = async (title: string, principal?: string) => (await upload([{ path: `${title}.md`, body: `# ${title}` }], { title, ...(principal ? { headers: devHeaders(principal) } : {}) })).body.itemId as string;
const supersede = (id: string, by: string | null, principal?: string) => call(`/api/v1/items/${id}/supersede`, { method: 'POST', body: { by }, ...(principal ? { principal } : {}) });

describe('mark superseded by another item (spec §11)', () => {
  it('supersede marks the outcome, names the replacement, and clears back to the prior outcome', async () => {
    const old = await art('Old plan');
    const next = await art('New plan');
    const send = vi.spyOn(env.INDEX, 'send');
    const res = await supersede(old, next);
    expect(res.status).toBe(200);
    expect((await res.json<{ item: ItemSummary }>()).item).toMatchObject({ outcome: 'superseded', supersededBy: next });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ itemId: old, change: 'upserted' }));
    expect((await supersededByMap(env, [old])).get(old)).toBe(next);   // search results name it too
    const audited = await env.DB.prepare(`SELECT detail FROM audit_events WHERE item_id = ? AND action = 'item.superseded'`).bind(old).first<{ detail: string }>();
    expect(JSON.parse(audited!.detail)).toEqual({ by: next, prior: 'completed' });
    const undone = await (await supersede(old, null)).json<{ item: ItemSummary }>();
    expect(undone.item.outcome).toBe('completed');
    expect(undone.item.supersededBy ?? null).toBeNull();
    send.mockRestore();
  });
  it('refuses itself, a loop, and a replacement the person cannot see', async () => {
    const a = await art('A');
    const b = await art('B');
    expect((await supersede(a, a)).status).toBe(400);
    expect((await supersede(a, b)).status).toBe(200);
    const loop = await supersede(b, a);
    expect(loop.status).toBe(400);
    expect(await loop.json()).toMatchObject({ error: 'invalid', detail: 'that would make a loop of replacements' });
    const hidden = (await upload([{ path: 'h.md', body: '# h' }], { title: 'H', scope: 'board:brd_00000000000000b9', headers: devHeaders(HUMAN_2) })).body.itemId as string;
    expect((await supersede(b, hidden)).status).toBe(404);
    expect((await loadItem(env, b))!.outcome).toBe('completed');
  });
  it('a replacement revoked later is no longer named (spec §4; reconciled, A3)', async () => {
    const old = await art('Old guide');
    const next = await art('New guide');
    expect((await supersede(old, next)).status).toBe(200);
    expect((await call(`/api/v1/items/${next}/revoke`, { method: 'POST', body: {} })).status).toBe(200);
    const shown = await (await call(`/api/v1/items/${old}`)).json<{ item: ItemSummary }>();
    expect(shown.item).toMatchObject({ outcome: 'superseded', supersededBy: null });
  });
  it('a work record keeps its card-derived replacement unless a person sets one', async () => {
    await seedWorkRecord({ id: 'itm_00000000000003a1', ws });
    const next = await art('Replacement');
    expect((await supersede('itm_00000000000003a1', next)).status).toBe(200);   // HUMAN is the owner
    expect((await loadItem(env, 'itm_00000000000003a1'))).toMatchObject({ outcome: 'superseded', superseded_by: next, superseded_prior: 'approved' });
    // The displayed replacement is the person's, not the card's (COALESCE order).
    await seedWorkRecord({ id: 'itm_00000000000003a4', ws });
    await env.DB.prepare(`UPDATE work_records SET superseded_by_card = 'card_00000000000003a4' WHERE item_id = 'itm_00000000000003a1'`).run();
    const shown = await (await call('/api/v1/items/itm_00000000000003a1')).json<{ item: ItemSummary }>();
    expect(shown.item.supersededBy).toBe(next);
  });
  it('only the uploader or an owner; an agent never', async () => {
    const theirs = await art('Theirs', HUMAN_2);
    const other = await art('Other', HUMAN_2);
    expect((await supersede(theirs, other, HUMAN_3)).status).toBe(403);
    expect((await supersede(theirs, other, HUMAN_2)).status).toBe(200);
    await seedWorkRecord({ id: 'itm_00000000000003a2', ws });
    expect((await supersede('itm_00000000000003a2', other, HUMAN_2)).status).toBe(403);   // records: owners only (O1)
    await withOrgPlane(async () => {
      const t = await planeToken({ sub: AGENT, principalKind: 'agent' });
      const res = await call(`/api/v1/items/${theirs}/supersede`, { method: 'POST', body: { by: null }, headers: { Authorization: `Bearer ${t}` } });
      expect(res.status).toBe(403);
    });
  });
});

describe('replacement chains', () => {
  it('a loop through a card link is refused, as is a three-link chain closed', async () => {
    await seedWorkRecord({ id: 'itm_00000000000003c1', ws });
    await seedWorkRecord({ id: 'itm_00000000000003c2', ws });
    await env.DB.prepare(`UPDATE work_records SET superseded_by_card = 'card_00000000000003c2' WHERE item_id = 'itm_00000000000003c1'`).run();
    const rev = await supersede('itm_00000000000003c2', 'itm_00000000000003c1');
    expect(rev.status).toBe(400);
    expect(await rev.json()).toMatchObject({ detail: 'that would make a loop of replacements' });
    const a = await art('Chain A'); const b = await art('Chain B'); const c = await art('Chain C');
    expect((await supersede(a, b)).status).toBe(200);
    expect((await supersede(b, c)).status).toBe(200);
    expect((await supersede(c, a)).status).toBe(400);
  });
  it('re-pointing then clearing restores the original outcome, not superseded', async () => {
    const a = await art('Repoint A'); const b = await art('Repoint B'); const c = await art('Repoint C');
    expect((await supersede(a, b)).status).toBe(200);
    expect((await supersede(a, c)).status).toBe(200);
    expect((await (await supersede(a, null)).json<{ item: ItemSummary }>()).item.outcome).toBe('completed');
    const audited = await env.DB.prepare(`SELECT detail FROM audit_events WHERE item_id = ? AND action = 'item.supersede_cleared'`).bind(a).first<{ detail: string }>();
    expect(JSON.parse(audited!.detail)).toEqual({ was: c, restored: 'completed' });
  });
});

describe('review fixes', () => {
  it('superseded_prior is computed in SQL, so a concurrent outcome change is not lost', async () => {
    const a = await art('Racy A'); const b = await art('Racy B');
    const real = env.DB.prepare.bind(env.DB);
    let fired = false;
    const spy = vi.spyOn(env.DB, 'prepare').mockImplementation(((q: string) => {
      if (!fired && q.includes('AS next FROM items i')) {
        fired = true;
        // Between the handler's read and its write, the card's own sync changes the outcome.
        void real(`UPDATE items SET outcome = 'rejected' WHERE id = ?`).bind(a).run();
      }
      return real(q);
    }) as typeof env.DB.prepare);
    const res = await supersede(a, b);
    spy.mockRestore();
    expect(res.status).toBe(200);
    expect(fired).toBe(true);
    expect((await loadItem(env, a))).toMatchObject({ outcome: 'superseded', superseded_prior: 'rejected' });
  });
  it('removing a replacement frees the items that named it, restoring their outcome', async () => {
    const old = await art('Old thing'); const next = await art('Replacement thing');
    expect((await supersede(old, next)).status).toBe(200);
    expect((await call(`/api/v1/items/${next}/remove`, { method: 'POST', body: { reason: 'wrong replacement' } })).status).toBe(200);
    expect(await loadItem(env, old)).toMatchObject({ outcome: 'completed', superseded_by: null, superseded_prior: null });
  });
  it('a chain through an item the person cannot see reveals nothing', async () => {
    const a = await art('Chain head'); const x = await art('Chain X');
    const hidden = (await upload([{ path: 'h2.md', body: '# h2' }], { title: 'Hidden link', scope: 'board:brd_00000000000000b9', headers: devHeaders(HUMAN_2) })).body.itemId as string;
    await env.DB.prepare(`UPDATE items SET superseded_by = ? WHERE id = ?`).bind(hidden, x).run();
    await env.DB.prepare(`UPDATE items SET superseded_by = ? WHERE id = ?`).bind(a, hidden).run();
    expect((await supersede(a, x)).status).toBe(200);   // the same answer as if the chain ended at X
  });
});

describe('caption (spec §7, §11)', () => {
  it('a caption is indexed, shown and audited', async () => {
    const id = await art('Queue diagram');
    const send = vi.spyOn(env.INDEX, 'send');
    const res = await call(`/api/v1/items/${id}/caption`, { method: 'PATCH', body: { caption: 'Three workers drain one queue' } });
    expect(res.status).toBe(200);
    expect((await res.json<{ item: ItemSummary }>()).item.caption).toBe('Three workers drain one queue');
    expect((await extractText(env, (await loadItem(env, id))!))!.text).toContain('Three workers drain one queue');
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ itemId: id, change: 'upserted' }));
    expect(await env.DB.prepare(`SELECT 1 FROM audit_events WHERE item_id = ? AND action = 'item.caption_set'`).bind(id).first()).not.toBeNull();
    const cleared = await (await call(`/api/v1/items/${id}/caption`, { method: 'PATCH', body: { caption: null } })).json<{ item: ItemSummary }>();
    expect(cleared.item.caption ?? null).toBeNull();
    send.mockRestore();
  });
  it('an empty or whitespace-only caption clears it (stored as NULL)', async () => {
    const id = await art('Clearable');
    for (const blank of ['', '   ']) {
      expect((await call(`/api/v1/items/${id}/caption`, { method: 'PATCH', body: { caption: 'Something' } })).status).toBe(200);
      expect((await loadItem(env, id))!.caption).toBe('Something');
      expect((await call(`/api/v1/items/${id}/caption`, { method: 'PATCH', body: { caption: blank } })).status).toBe(200);
      expect((await loadItem(env, id))!.caption).toBeNull();
    }
  });
  it('a work record takes no caption', async () => {
    await seedWorkRecord({ id: 'itm_00000000000003b1', ws });
    expect((await call('/api/v1/items/itm_00000000000003b1/caption', { method: 'PATCH', body: { caption: 'x' } })).status).toBe(400);
  });
});
