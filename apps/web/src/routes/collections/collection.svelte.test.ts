// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

let canEdit = false;
const col = () => ({ id: 'col_0123456789abcdef', name: '<img src=x onerror=alert(1)>Week 41', description: '<script>x</script>', createdBy: 'p', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', itemCount: 0, canEdit, entries: [] });
vi.mock('$lib/session.svelte', () => ({ api: async () => Response.json(col()) }));
vi.mock('$app/state', () => ({ page: { params: { id: 'col_0123456789abcdef' }, url: new URL('http://localhost/collections/col_0123456789abcdef') } }));
vi.mock('$app/navigation', () => ({ goto: vi.fn(), replaceState: vi.fn() }));
import Page from './[id]/+page.svelte';

let c: ReturnType<typeof mount> | null = null;
afterEach(() => { if (c) unmount(c); c = null; document.body.innerHTML = ''; });
const settle = async () => { for (let i = 0; i < 5; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); } };

describe('a collection page', () => {
  it('shows its name and description as text', async () => {
    c = mount(Page, { target: document.body });
    await settle();
    expect(document.querySelector('img, script')).toBeNull();
    expect(document.querySelector('h1')!.textContent).toBe('<img src=x onerror=alert(1)>Week 41');
  });
  it('offers rename and delete only to those who may (the server still decides)', async () => {
    canEdit = false;
    c = mount(Page, { target: document.body });
    await settle();
    expect(document.body.textContent).not.toContain('Delete collection');
    unmount(c); document.body.innerHTML = '';
    canEdit = true;
    c = mount(Page, { target: document.body });
    await settle();
    expect(document.body.textContent).toContain('Delete collection');
  });
  it('rename needs a name, and focus returns to the Rename button afterwards', async () => {
    canEdit = true;
    c = mount(Page, { target: document.body });
    await settle();
    const rename = () => [...document.querySelectorAll('button')].find((b) => b.textContent === 'Rename or describe')!;
    rename().click(); flushSync();
    const name = document.querySelector<HTMLInputElement>('form input')!;
    name.value = '  '; name.dispatchEvent(new Event('input', { bubbles: true })); flushSync();
    document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await settle();
    expect(document.querySelector('[role=alert]')!.textContent).toBe('Give the collection a name.');
    [...document.querySelectorAll('button')].find((b) => b.textContent === 'Cancel')!.click();
    await settle();
    expect(document.activeElement).toBe(rename());
  });
});
