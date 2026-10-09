import { describe, expect, it } from 'vitest';
import { BODY_CAP, buildWorkRecord, flattenSpec, outcomeOf, supersededByOf } from '../src/ingest/work-record';
import { REDACTED, redactSecrets, scanText } from '../src/guard/secrets';
import type { CardBundle } from '../src/sources/superpipeline';

const C = 'card_00000000000000c1';
const APP = 'https://app.superlibrary.dev';
function bundle(over: Partial<CardBundle['card']> = {}, extra: Partial<CardBundle> = {}): CardBundle {
  return {
    card: { id: C, title: 'Plan the launch', spec: { goal: 'Launch', steps: ['a', 'b'] }, state: 'working', currentStageKey: 'build', archivedAt: null, needsHuman: null, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z', ...over },
    attempts: [], comments: [], links: [], gates: [], references: [], ...extra,
  };
}
const gate = (decision: 'approve' | 'reject' | 'request_changes' | null) => ({ id: 'gate_1', cardId: C, stageKey: 'review', status: decision ? 'resolved' : 'pending', decision, resolvedAt: decision ? '2026-10-03T00:00:00Z' : null });
const sup = { fromCardId: 'card_00000000000000c9', toCardId: C, kind: 'supersedes' };
const cmt = (i: number, body: string) => ({ id: `cmt_${i}`, author: { kind: 'human' as const, id: 'u', name: null }, body, createdAt: new Date(Date.UTC(2026, 9, 2) + i * 1000).toISOString(), deletedAt: null });
const attempt = (n: number, handoff: unknown) => ({ runId: `run_000000000000000${n}`, stageKey: 'build', agentId: 'agt_1', status: 'completed', outcome: 'completed', startedAt: `2026-10-01T0${n}:00:00Z`, endedAt: null, handoff, failureReason: null });

describe('outcomeOf: every row of the P6 table', () => {
  it.each([
    ['a supersedes link points at it', bundle({ state: 'completed' }, { links: [sup] }), 'superseded'],
    ['rejected and later superseded', bundle({ state: 'rejected' }, { links: [sup] }), 'superseded'],
    ['rejected at a gate', bundle({ state: 'rejected' }, { gates: [gate('reject')] }), 'rejected'],
    ['completed after an approved gate', bundle({ state: 'completed' }, { gates: [gate('request_changes'), { ...gate('approve'), id: 'gate_2' }] }), 'approved'],
    ['completed with no gate', bundle({ state: 'completed' }), 'completed'],
    ['completed with only a changes-requested gate', bundle({ state: 'completed' }, { gates: [gate('request_changes')] }), 'completed'],
    ['the circuit breaker tripped', bundle({ state: 'input-required', needsHuman: { reason: 'repeated-failure' } }), 'failed'],
    ['a terminal failed state', bundle({ state: 'failed' }), 'failed'],
    ['canceled', bundle({ state: 'canceled' }), 'abandoned'],
    ['archived without completing', bundle({ state: 'working', archivedAt: '2026-10-05T00:00:00Z' }), 'abandoned'],
    ['archived after completing stays completed', bundle({ state: 'completed', archivedAt: '2026-10-05T00:00:00Z' }), 'completed'],
    ['waiting on a question', bundle({ state: 'input-required', needsHuman: { reason: 'question' } }), 'in-progress'],
    ['working', bundle(), 'in-progress'],
  ])('%s', (_, b, want) => expect(outcomeOf(b)).toBe(want));
  it('a supersedes link FROM this card does not supersede it', () => {
    const b = bundle({ state: 'completed' }, { links: [{ fromCardId: C, toCardId: 'card_00000000000000c0', kind: 'supersedes' }] });
    expect(outcomeOf(b)).toBe('completed');
    expect(supersededByOf(b)).toBeNull();
  });
  it('a link of another kind does not supersede', () => {
    expect(outcomeOf(bundle({ state: 'completed' }, { links: [{ ...sup, kind: 'relates' }] }))).toBe('completed');
  });
  it('supersededByOf names the superseding card', () => {
    expect(supersededByOf(bundle({}, { links: [sup] }))).toBe('card_00000000000000c9');
  });
});

describe('buildWorkRecord', () => {
  it('holds spec, handoffs in run order, comments and references, and indexes them as text', () => {
    const b = bundle({ state: 'completed' }, {
      attempts: [
        { runId: 'run_00000000000000d2', stageKey: 'review', agentId: 'agt_2', status: 'completed', outcome: 'completed', startedAt: '2026-10-02T00:00:00Z', endedAt: '2026-10-02T01:00:00Z', handoff: { summary: 'Reviewed' }, failureReason: null },
        { runId: 'run_00000000000000d1', stageKey: 'build', agentId: 'agt_1', status: 'completed', outcome: 'completed', startedAt: '2026-10-01T00:00:00Z', endedAt: '2026-10-01T01:00:00Z', handoff: { summary: 'Built the page' }, failureReason: null },
      ],
      comments: [{ id: 'cmt_1', author: { kind: 'human', id: 'usr_1', name: 'A person' }, body: 'Looks good', createdAt: '2026-10-02T02:00:00Z', deletedAt: null }],
      references: [{ cardId: C, url: 'https://app.superlibrary.dev/a/itm_0000000000000001', title: 'Mockup', provider: 'superlibrary', externalId: 'itm_0000000000000001' }],
    });
    const { record, text } = buildWorkRecord(b, APP);
    expect(record.handoffs.map((h) => [h.runId, h.attempt])).toEqual([['run_00000000000000d1', 1], ['run_00000000000000d2', 2]]);
    expect(record.references[0]).toMatchObject({ itemId: 'itm_0000000000000001' });
    expect(record.outcome).toBe('completed');
    for (const s of ['Plan the launch', 'goal: Launch', 'Built the page', 'Looks good', 'Mockup']) expect(text).toContain(s);
  });
  it('redactSecrets replaces matches and flags the record', () => {
    const b = bundle({ spec: { note: 'token ghp_' + 'a'.repeat(36) } }, { comments: [{ id: 'cmt_1', author: { kind: 'agent', id: 'agt', name: null }, body: 'AKIAABCDEFGHIJKLMNOP leaked', createdAt: 't', deletedAt: null }] });
    const { record, text } = buildWorkRecord(b, APP);
    expect(text).not.toMatch(/ghp_a{36}|AKIAABCDEFGHIJKLMNOP/);
    expect(text).toContain('[redacted secret]');
    expect(JSON.stringify(record)).not.toMatch(/ghp_a{36}|AKIAABCDEFGHIJKLMNOP/);
    expect(record.redactions).toEqual(expect.arrayContaining([{ field: 'spec', rule: 'github-token' }, { field: 'comments.cmt_1', rule: 'aws-access-key' }]));
  });
  it('redacts titles, handoffs, failure reasons and reference titles too', () => {
    const k = 'AKIAABCDEFGHIJKLMNOP';
    const b = bundle({ title: `t ${k}` }, {
      attempts: [{ ...attempt(1, { s: k }), failureReason: `f ${k}` }],
      references: [{ cardId: C, url: 'https://x.example/', title: `r ${k}`, provider: 'url', externalId: null }],
    });
    const { record, text } = buildWorkRecord(b, APP);
    expect(JSON.stringify(record)).not.toContain(k);
    expect(text).not.toContain(k);
    expect(record.redactions.map((r) => r.field).sort()).toEqual(['handoffs.run_0000000000000001', 'references', 'title']);
  });
  it('a clean record is not flagged', () => {
    const { record } = buildWorkRecord(bundle(), APP);
    expect(record.redactions).toEqual([]);
    expect(record.truncated).toBe(false);
  });
  it('a referenced item is linked only for an item link, not for any URL that mentions one', () => {
    const b = bundle({}, { references: [{ cardId: C, url: 'https://evil.example/a/itm_0000000000000001', title: null, provider: 'url', externalId: null }] });
    expect(buildWorkRecord(b, APP).record.references[0]!.itemId).toBeNull();
  });
  it('stays under the body cap (in bytes) by dropping the oldest comments first, and says so', () => {
    const comments = Array.from({ length: 400 }, (_, i) => cmt(i, 'x'.repeat(4000)));
    const { record } = buildWorkRecord(bundle({}, { comments }), APP);
    expect(new TextEncoder().encode(JSON.stringify(record)).length).toBeLessThanOrEqual(BODY_CAP);
    expect(record.truncated).toBe(true);
    expect(record.comments.at(-1)!.id).toBe('cmt_399');
    expect(record.comments[0]!.id).not.toBe('cmt_0');
  });
  it('measures bytes, not characters', () => {
    // 300 000 three-byte characters are 300 000 UTF-16 units but 900 000 bytes.
    const comments = Array.from({ length: 3 }, (_, i) => cmt(i, '€'.repeat(100_000)));
    const { record } = buildWorkRecord(bundle({}, { comments }), APP);
    expect(JSON.stringify(record).length).toBeLessThan(BODY_CAP);
    expect(new TextEncoder().encode(JSON.stringify(record)).length).toBeLessThanOrEqual(BODY_CAP);
    expect(record.truncated).toBe(true);
  });
  it('drops handoff bodies only after every comment is gone, oldest first, then the spec', () => {
    const big = 'y'.repeat(500_000);
    const b = bundle({ spec: { s: 'z'.repeat(400_000) } }, { comments: [cmt(1, 'keep?')], attempts: [attempt(1, { b: big }), attempt(2, { b: big }), attempt(3, { b: 'small' })] });
    const { record } = buildWorkRecord(b, APP);
    expect(record.comments).toEqual([]);
    expect(record.handoffs[0]!.handoff).toMatch(/left out/);
    expect(record.handoffs[2]!.handoff).toEqual({ b: 'small' });
    expect(record.truncated).toBe(true);
    const only = buildWorkRecord(bundle({}, { comments: [cmt(1, 'x'.repeat(600_000)), cmt(2, 'x'.repeat(600_000))], attempts: [attempt(1, { b: 'kept' })] }), APP).record;
    expect(only.handoffs[0]!.handoff).toEqual({ b: 'kept' });
  });
  it('trims the spec last when nothing else is left to drop', () => {
    const { record } = buildWorkRecord(bundle({ spec: { s: 'z'.repeat(950_000) } }), APP);
    expect(new TextEncoder().encode(JSON.stringify(record)).length).toBeLessThanOrEqual(BODY_CAP);
    expect(record.truncated).toBe(true);
    expect(typeof record.spec).toBe('string');
  });
});

describe('review fixes', () => {
  const K = 'AKIAABCDEFGHIJKLMNOP';
  const V = 'Zx9kQ2vL8pW4mN7rT1aB5cD6';
  it('redacts a token that starts a line or follows a tab inside a handoff', () => {
    const { record, text } = buildWorkRecord(bundle({}, { attempts: [attempt(1, { a: 'x\n' + K, b: 'x\t' + K, [K]: 1 })] }), APP);
    expect(JSON.stringify(record)).not.toContain(K);
    expect(text).not.toContain(K);
    expect(record.redactions).toContainEqual({ field: 'handoffs.run_0000000000000001', rule: 'aws-access-key' });
  });
  it('redacts a quoted assignment inside a handoff and a spec', () => {
    const { record, text } = buildWorkRecord(bundle({ spec: { n: `api_key = "${V}"` } }, { attempts: [attempt(1, { n: `api_key = "${V}"` })] }), APP);
    expect(JSON.stringify(record)).not.toContain(V);
    expect(text).not.toContain(V);
    expect(text).toContain(`api_key = "${REDACTED}"`);
  });
  it('redacts a reference url, after the item link is read from the original', () => {
    const url = `https://app.superlibrary.dev/a/itm_0000000000000001?t=${K}`;
    const { record, text } = buildWorkRecord(bundle({}, { references: [{ cardId: C, url, title: null, provider: 'url', externalId: null }] }), APP);
    expect(JSON.stringify(record)).not.toContain(K);
    expect(text).not.toContain(K);
    expect(record.references[0]!.itemId).toBe('itm_0000000000000001');
  });
  it('redacts a private key body, not only its header', () => {
    const pem = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEAxyz\nabcdefg\n-----END RSA PRIVATE KEY-----';
    const r = redactSecrets(`before\n${pem}\nafter`);
    expect(r).toEqual({ text: `before\n${REDACTED}\nafter`, rules: ['pem-private-key'] });
    expect(redactSecrets('-----BEGIN PRIVATE KEY-----\nMIIEabc').text).toBe(REDACTED);
    expect(scanText(pem)).toEqual([{ line: 1, rule: 'pem-private-key' }]);
  });
  it('stays under the cap when the spec inflates under JSON escaping', () => {
    const { record } = buildWorkRecord(bundle({ spec: { s: '\u0001'.repeat(900_000) } }), APP);
    expect(new TextEncoder().encode(JSON.stringify(record)).length).toBeLessThanOrEqual(BODY_CAP);
    expect(record.truncated).toBe(true);
  });
  it('stays under the cap with many large failure reasons and titles', () => {
    const attempts = Array.from({ length: 9 }, (_, i) => ({ ...attempt(i + 1, null), failureReason: 'f'.repeat(200_000) }));
    const refs = Array.from({ length: 5 }, () => ({ cardId: C, url: 'https://x.example/' + 'u'.repeat(100_000), title: 't'.repeat(100_000), provider: 'url', externalId: null }));
    const { record } = buildWorkRecord(bundle({ title: 'T'.repeat(300_000) }, { attempts, references: refs }), APP);
    expect(new TextEncoder().encode(JSON.stringify(record)).length).toBeLessThanOrEqual(BODY_CAP);
    expect(record.truncated).toBe(true);
  });
  it('re-measures after the first spec cut: escaped characters inflate and other fields share the budget', () => {
    const b = bundle({ spec: { s: '\u0001'.repeat(300_000) } }, { attempts: [{ ...attempt(1, null), failureReason: 'f'.repeat(500_000) }] });
    const { record } = buildWorkRecord(b, APP);
    expect(new TextEncoder().encode(JSON.stringify(record)).length).toBeLessThanOrEqual(BODY_CAP);
    expect(record.handoffs[0]!.failureReason!.length).toBe(500_000);
  });
  it('clips an oversized title and drops surplus references as a last resort', () => {
    const t = buildWorkRecord(bundle({ title: 'T'.repeat(950_000) }), APP).record;
    expect(new TextEncoder().encode(JSON.stringify(t)).length).toBeLessThanOrEqual(BODY_CAP);
    const refs = Array.from({ length: 1500 }, (_, i) => ({ cardId: C, url: 'https://x.example/' + 'u'.repeat(1000) + i, title: 't'.repeat(1000), provider: 'url', externalId: null }));
    const r = buildWorkRecord(bundle({}, { references: refs }), APP).record;
    expect(new TextEncoder().encode(JSON.stringify(r)).length).toBeLessThanOrEqual(BODY_CAP);
    expect(r.truncated).toBe(true);
  });
  it('no app host means no item links, even for a hostless url', () => {
    const b = bundle({}, { references: [{ cardId: C, url: 'file:///a/itm_0000000000000001', title: null, provider: 'url', externalId: null }] });
    expect(buildWorkRecord(b, 'not a url').record.references[0]!.itemId).toBeNull();
  });
  it('drops oldest by time even when the bundle is out of order, and skips deleted comments', () => {
    const comments = [cmt(5, 'x'.repeat(500_000)), cmt(1, 'x'.repeat(500_000)), { ...cmt(9, 'gone'), deletedAt: '2026-10-03T00:00:00Z' }];
    const { record } = buildWorkRecord(bundle({}, { comments }), APP);
    expect(record.comments.map((c) => c.id)).toEqual(['cmt_5']);
  });
  it('a malformed app url yields no item links instead of throwing', () => {
    const b = bundle({}, { references: [{ cardId: C, url: 'https://app.superlibrary.dev/a/itm_0000000000000001', title: null, provider: 'url', externalId: null }] });
    expect(buildWorkRecord(b, 'not a url').record.references[0]!.itemId).toBeNull();
  });
});

describe('flattenSpec', () => {
  it('turns structured fields into readable lines', () => {
    expect(flattenSpec({ goal: 'Launch', steps: ['a', 'b'], owner: { team: 'web' } })).toBe('goal: Launch\nsteps: a; b\nowner.team: web');
    expect(flattenSpec('plain text')).toBe('plain text');
    expect(flattenSpec(null)).toBe('');
  });
});

describe('redactSecrets', () => {
  const value = 'Zx9kQ2vL8pW4mN7rT1aB5cD6';
  it('the test value really trips the phase-1 rule', () => {
    expect(scanText(`api_key = "${value}"`)).toEqual([{ line: 1, rule: 'high-entropy-assignment' }]);
  });
  it('keeps the name of an assignment and hides only the value', () => {
    const r = redactSecrets(`api_key = "${value}"`);
    expect(r.text).toBe(`api_key = "${REDACTED}"`);
    expect(r.rules).toEqual(['high-entropy-assignment']);
  });
  it('leaves a placeholder assignment alone', () => {
    expect(redactSecrets('api_key = "your-api-key-here-please"')).toEqual({ text: 'api_key = "your-api-key-here-please"', rules: [] });
  });
  it('leaves a low-entropy assignment alone', () => {
    expect(redactSecrets('token = "aaaaaaaaaaaaaaaaaaaa1111"').rules).toEqual([]);
  });
  it('replaces every match, not the first only', () => {
    const k = 'AKIAABCDEFGHIJKLMNOP';
    expect(redactSecrets(`${k} and ${k}`)).toEqual({ text: `${REDACTED} and ${REDACTED}`, rules: ['aws-access-key'] });
  });
  it('leaves ordinary text alone', () => {
    expect(redactSecrets('nothing to see')).toEqual({ text: 'nothing to see', rules: [] });
  });
});
