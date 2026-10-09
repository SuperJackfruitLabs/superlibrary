// apps/web/src/lib/WorkRecordView.svelte.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import type { WorkRecordView as View } from '@superlibrary/contract';
import WorkRecordView from './WorkRecordView.svelte';

let c: ReturnType<typeof mount> | null = null;
afterEach(() => { if (c) unmount(c); c = null; document.body.innerHTML = ''; });

const view: View = {
  item: { id: 'itm_0123456789abcdef', kind: 'work-record', title: 'Launch post', scope: 'board:brd_00000000000000b1', outcome: 'rejected', createdBy: 'source:superpipeline', createdAt: '2026-10-01T09:00:00.000Z', latestVersion: 0, expiresAt: null, revokedAt: null, source: { sourceUrl: 'https://app.superpipeline.dev/b/brd_00000000000000b1/c/card_00000000000000c1' } },
  record: {
    schema: 'work-record/1', boardId: 'brd_00000000000000b1', cardId: 'card_00000000000000c1', title: 'Launch post', spec: { goal: '<b>bold</b>' }, state: 'rejected', stage: 'review', archivedAt: null,
    createdAt: '2026-10-01T09:00:00.000Z', updatedAt: '2026-10-03T17:00:00.000Z',
    handoffs: [{ runId: 'run_1', stage: 'draft', agent: null, startedAt: '2026-10-01T10:00:00.000Z', endedAt: null, attempt: 1, status: 'completed', handoff: '<script>alert(1)</script>', failureReason: null }],
    comments: [{ id: 'c1', author: { kind: 'agent', name: null }, body: 'Looks good <img src=x onerror=alert(1)>', createdAt: '2026-10-02T12:00:00.000Z' }],
    references: [], gates: [], supersededByCard: null, outcome: 'rejected', redactions: [{ field: 'comments[0].body', rule: 'github-token' }], truncated: false,
  },
  artifacts: [{ id: 'itm_0123456789abcde0', kind: 'artifact', title: 'Draft', scope: 'workspace', outcome: 'completed', createdBy: 'prn_000000000000000000a2', createdAt: '2026-10-02T00:00:00.000Z', latestVersion: 2, expiresAt: null, revokedAt: null }],
  boardName: 'Marketing & Community',
};

describe('WorkRecordView', () => {
  it('comments and handoffs are text, never markup', () => {
    c = mount(WorkRecordView, { target: document.body, props: { view } });
    flushSync();
    expect(document.querySelector('img, script, b')).toBeNull();
    expect(document.body.textContent).toContain('Looks good <img src=x onerror=alert(1)>');
    expect(document.body.textContent).toContain('<script>alert(1)</script>');
    expect(document.body.textContent).toContain('Some text was hidden because it looked like a secret.');
    expect(document.body.textContent).toContain('Marketing & Community');
    expect([...document.querySelectorAll('ol.timeline > li')].length).toBe(3);
    expect(document.querySelector('a[href="/a/itm_0123456789abcde0"]')!.textContent).toContain('Draft');
    expect(document.querySelector('a[target="_blank"]')!.getAttribute('rel')).toBe('noopener noreferrer');
  });
});
