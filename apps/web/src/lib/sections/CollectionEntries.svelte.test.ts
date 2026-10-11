// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import CollectionEntries from './CollectionEntries.svelte';
import type { CollectionModel } from '$lib/screens/collections.svelte';

let c: ReturnType<typeof mount> | null = null;
afterEach(() => { if (c) unmount(c); c = null; document.body.innerHTML = ''; });
const item = (id: string, title: string, outcome: string) => ({ id, title, outcome });
const model = { c: { entries: [{ item: item('itm_1', 'First', 'completed'), addedAt: '2026-10-01T00:00:00.000Z', note: 'Keep this one' }, { item: item('itm_2', 'Second', 'rejected'), addedAt: '2026-10-02T00:00:00.000Z', note: null }] }, remove: () => {} } as unknown as CollectionModel;

describe('CollectionEntries, table variant', () => {
  it('has a column for each part and puts a note in its own cell', () => {
    c = mount(CollectionEntries, { target: document.body, props: { model, variant: 'table' } });
    flushSync();
    const table = document.querySelector('table[aria-label="Items in this collection"]')!;
    expect([...table.querySelectorAll('thead th')].map((th) => th.textContent!.trim())).toEqual(['Title', 'Outcome', 'Added', 'Note', 'Action']);
    const rows = [...table.querySelectorAll('tbody tr')];
    expect(rows).toHaveLength(2);
    expect(rows[0]!.querySelector('td[data-label="Note"]')!.textContent).toBe('Keep this one');
    expect(rows[1]!.querySelector('td[data-label="Note"]')!.textContent).toBe('');
    expect(rows[0]!.querySelector('td[data-label="Action"]')!.textContent).toContain('“First”');
  });
});
