// apps/web/src/lib/ItemHeader.svelte.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import type { ItemSummary } from '@superlibrary/contract';
import ItemHeader from './ItemHeader.svelte';

let c: ReturnType<typeof mount> | null = null;
afterEach(() => { if (c) unmount(c); c = null; document.body.innerHTML = ''; });
const item = { id: 'itm_0123456789abcdef', kind: 'artifact', title: 'Queue diagram', scope: 'workspace', outcome: 'completed', createdBy: 'p', createdAt: '2026-10-01T00:00:00.000Z', latestVersion: 3, expiresAt: null, revokedAt: null } as ItemSummary;

describe('the item header (operator phone review: the title block was too tall)', () => {
  it('is the title and one meta line, then actions with their words', () => {
    c = mount(ItemHeader, { target: document.body, props: { item, version: 3, latest: 3, actions: [{ label: 'Upload a new version', icon: 'upload', href: '/upload?item=x', primary: true }] } });
    flushSync();
    const header = document.querySelector('header.item-header')!;
    expect([...header.children].map((e) => e.tagName.toLowerCase())).toEqual(['h1', 'p', 'div']);   // title, meta, then the toolbar (its wrapper holds the More panel)
    const meta = header.querySelector('p.item-meta')!;
    expect(meta.textContent).toContain('Completed');
    expect(meta.textContent).toContain('v3 (latest)');
    expect(meta.textContent).toContain('Everyone in the workspace');
    expect(header.querySelector('[role="toolbar"]')!.textContent).toContain('Upload a new version');
  });
});
