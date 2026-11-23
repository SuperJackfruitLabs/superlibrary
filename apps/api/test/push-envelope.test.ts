// Treaty's push-delivery vectors (fixtures/cloudevents/push-delivery.json) through the receiver's
// own signature check, and record.v1 as the receiver reads it.
import { describe, expect, it } from 'vitest';
import vectors from '@superjackfruitlabs/treaty-contracts/data/fixtures/cloudevents/push-delivery.json';
import { verifyPush } from '../src/sources/push-signature';
import { isRecordBody } from '../src/sources/record-event';

const UTF8 = new TextEncoder();
/** A vector's headers, without the keys JSON imports type as possibly undefined. */
const headersOf = (h: Record<string, string | undefined>) => new Headers(Object.entries(h).filter((e): e is [string, string] => e[1] !== undefined));

describe("treaty's push-delivery vectors", () => {
  it('every signed delivery verifies at its second and at the edge of the window', async () => {
    expect(vectors.deliveries.length).toBeGreaterThan(0);
    for (const d of vectors.deliveries) {
      for (const at of [d.t, d.t + vectors.toleranceSeconds]) {
        const ok = await verifyPush(headersOf(d.http.headers), UTF8.encode(d.http.body), d.secret, at * 1000);
        expect({ name: d.name, ok }).toEqual({ name: d.name, ok: true });
      }
    }
  });
  it('every delivery a receiver must refuse is refused', async () => {
    expect(vectors.refuse.map((r) => r.name)).toContain('old-header-only');
    for (const r of vectors.refuse) {
      const ok = await verifyPush(headersOf(r.http.headers), UTF8.encode(r.http.body), r.secret, r.nowSeconds * 1000);
      expect({ name: r.name, ok }).toEqual({ name: r.name, ok: false });
    }
  });
  it('a treaty signature that fails is not rescued by a valid old header', async () => {
    const d = vectors.deliveries[0];
    const body = UTF8.encode(d.http.body);
    const key = await crypto.subtle.importKey('raw', UTF8.encode(d.secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const old = 'sha256=' + [...new Uint8Array(await crypto.subtle.sign('HMAC', key, body))].map((x) => x.toString(16).padStart(2, '0')).join('');
    expect(await verifyPush(new Headers({ 'X-Superpipeline-Signature': old }), body, d.secret, d.t * 1000)).toBe(true);
    const both = headersOf({ ...d.http.headers, 'X-Superpipeline-Signature': old, 'ce-id': 'brd_134a0ddb6d434478:99' });
    expect(await verifyPush(both, body, d.secret, d.t * 1000)).toBe(false);
  });
});

describe('record.v1', () => {
  it('reads a body by the schema', () => {
    const ok = { event: 'card.moved', boardId: 'brd_00000000000000b1', seq: 3, ts: '2026-11-23T09:30:00.000Z', cardIds: ['card_00000000000000c1'] };
    expect(isRecordBody(ok)).toBe(true);
    const { seq: _s, ...noSeq } = ok;
    for (const bad of [noSeq, { ...ok, ts: 't' }, { ...ok, seq: -1 }, { ...ok, cardIds: [7] }, { ...ok, event: 'work.available' }, null, []]) {
      expect(isRecordBody(bad)).toBe(false);
    }
  });
});
