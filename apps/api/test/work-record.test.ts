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
const cmt = (i: number, body: string) => ({ id: `cmt_${i}`, author: { kind: 'human' as const, id: 'u', name: null }, body, createdAt: `2026-10-02T00:00:${String(i % 60).padStart(2, '0')}Z`, deletedAt: null });
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
