// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const col = { id: 'col_0123456789abcdef', name: 'Week 41', description: 'd', createdBy: 'p', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', itemCount: 0, canEdit: true, entries: [] };
vi.mock('$lib/session.svelte', () => ({ api: async (_p: string, i?: RequestInit) => (i?.method === 'PATCH' ? new Response(null, { status: 204 }) : Response.json(col)) }));
vi.mock('$app/state', () => ({ page: { params: { id: 'col_0123456789abcdef' }, url: new URL('http://localhost/collections/col_0123456789abcdef') } }));
vi.mock('$app/navigation', () => ({ goto: vi.fn(), replaceState: vi.fn() }));
import Page from './[id]/+page.svelte';

let c: ReturnType<typeof mount> | null = null;
afterEach(() => { if (c) unmount(c); c = null; document.body.innerHTML = ''; });
const settle = async () => { for (let i = 0; i < 6; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); } };
const btn = (t: string) => [...document.querySelectorAll('button')].find((b) => b.textContent!.trim() === t)!;

describe('collection focus', () => {
  it('saving a rename returns focus to the Rename button', async () => {
    c = mount(Page, { target: document.body, props: {} });
    await settle();
    btn('Rename or describe').click(); flushSync();
    document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();
    expect(document.activeElement).toBe(btn('Rename or describe'));
  });

  it('the delete dialog holds focus, and Cancel returns it to Delete collection', async () => {
    c = mount(Page, { target: document.body });
    await settle();
    const del = btn('Delete collection');
    del.click();  // like Safari: a click does not focus the button
    await settle();
    const dialog = document.querySelector<HTMLElement>('[role=alertdialog]')!;
    expect(dialog.contains(document.activeElement)).toBe(true);
    // Tab from the last control wraps inside the dialog.
    const last = [...dialog.querySelectorAll<HTMLElement>('button')].at(-1)!;
    last.focus();
    last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(dialog.contains(document.activeElement)).toBe(true);
    [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Cancel')!.click();
    await settle();
    expect(document.querySelector('[role=alertdialog]')).toBeNull();
    expect(document.activeElement).toBe(btn('Delete collection'));
  });
});
