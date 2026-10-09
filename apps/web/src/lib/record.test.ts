// apps/web/src/lib/record.test.ts
import { describe, expect, it } from 'vitest';
import type { WorkRecord } from '@superlibrary/contract';
import { handoffText, specRows, timelineOf } from './record';

const rec = (over: Partial<WorkRecord> = {}): WorkRecord => ({
  schema: 'work-record/1', boardId: 'brd_00000000000000b1', cardId: 'card_00000000000000c1', title: 'Launch post', spec: { goal: 'Write it', audience: ['press'] },
  state: 'completed', stage: 'publish', archivedAt: null, createdAt: '2026-10-01T09:00:00.000Z', updatedAt: '2026-10-03T17:00:00.000Z',
  handoffs: [
    { runId: 'run_2', stage: 'draft', agent: 'prn_000000000000000000a2', startedAt: '2026-10-02T10:00:00.000Z', endedAt: null, attempt: 2, status: 'completed', handoff: { summary: 'Draft ready' }, failureReason: null },
    { runId: 'run_1', stage: 'draft', agent: 'prn_000000000000000000a2', startedAt: '2026-10-01T10:00:00.000Z', endedAt: null, attempt: 1, status: 'failed', handoff: null, failureReason: 'timed out' },
  ],
  comments: [{ id: 'c1', author: { kind: 'human', name: null }, body: 'Ship it', createdAt: '2026-10-02T12:00:00.000Z' }],
  references: [], gates: [{ id: 'g1', stage: 'review', decision: 'request_changes', resolvedAt: '2026-10-02T13:00:00.000Z' }, { id: 'g2', stage: 'final', decision: null, resolvedAt: null }],
  supersededByCard: null, outcome: 'approved', redactions: [], truncated: false, ...over,
});

describe('the work-record timeline (spec §11: stages, agents, handoffs, comments)', () => {
  it('timelineOf orders attempts, comments and gates by time, undated last', () => {
    const t = timelineOf(rec());
    expect(t.map((e) => e.title)).toEqual([
      'Card created', 'draft · attempt 1 · failed', 'draft · attempt 2 · completed', 'Comment', 'Gate at review: sent back for changes', 'Gate at final: waiting',
    ]);
    expect(t[1]).toMatchObject({ who: 'prn_000000000000000000a2', detail: 'Failed: timed out', tone: 'bad' });
    expect(t[2]).toMatchObject({ detail: 'Draft ready', tone: 'good' });
    expect(t[3]).toMatchObject({ who: 'A person', detail: 'Ship it' });
    expect(timelineOf(rec({ archivedAt: '2026-10-04T00:00:00.000Z' })).at(-1)!.title).toBe('Gate at final: waiting');
  });
  it('a handoff is text: a string, a summary, else its JSON, capped', () => {
    expect(handoffText('  done ')).toBe('done');
    expect(handoffText({ text: 'ok' })).toBe('ok');
    expect(handoffText({ files: 2 })).toBe('{\n  "files": 2\n}');
    expect(handoffText({ blob: 'x'.repeat(5000) })!.length).toBeLessThanOrEqual(2001);
    expect(handoffText(null)).toBeNull();
  });
  it('the spec reads as labelled rows', () => {
    expect(specRows(rec().spec)).toEqual([{ label: 'goal', value: 'Write it' }, { label: 'audience', value: '[\n  "press"\n]' }]);
    expect(specRows('free text')).toEqual([{ label: 'Spec', value: 'free text' }]);
    expect(specRows(null)).toEqual([]);
  });
});
