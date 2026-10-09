// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const calls: Array<{ path: string; method?: string; body?: string }> = [];
let listAnswer: () => Response;
vi.mock('$lib/session.svelte', () => ({
  api: async (path: string, init?: RequestInit) => {
    calls.push({ path, method: init?.method, body: init?.body as string | undefined });
    if (path === '/api/v1/collections') return listAnswer();
    return new Response('{}', { status: 201 });
  },
}));
import AddToCollection from './AddToCollection.svelte';

let c: ReturnType<typeof mount> | null = null;
afterEach(() => { if (c) unmount(c); c = null; document.body.innerHTML = ''; calls.length = 0; });
const settle = async () => { for (let i = 0; i < 5; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); } };
const col = (n: number, name: string) => ({ id: `col_000000000000000${n}`, name, description: '', createdBy: 'p', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', itemCount: 0, canEdit: true });

describe('Add to collection', () => {
  it('adds the item to the chosen collection with the kit button', async () => {
    listAnswer = () => Response.json({ collections: [col(1, 'Week 41'), col(2, 'Pricing')] });
    c = mount(AddToCollection, { target: document.body, props: { itemId: 'itm_0123456789abcdef' } });
    await settle();
    const btn = document.querySelector<HTMLButtonElement>('button.kit-button')!;
    expect(btn.textContent).toBe('Add to collection');
    btn.click();
    await settle();
    expect(calls.at(-1)).toMatchObject({ path: '/api/v1/collections/col_0000000000000001/items', method: 'POST' });
    expect(document.body.textContent).toContain('Added to “Week 41”.');
  });
  it('says so, with a retry, when the list cannot be loaded (not "No collections yet")', async () => {
    listAnswer = () => Response.json({ error: 'unavailable' }, { status: 503 });
    c = mount(AddToCollection, { target: document.body, props: { itemId: 'itm_0123456789abcdef' } });
    await settle();
    expect(document.body.textContent).not.toContain('No collections yet');
    expect(document.querySelector('[role=alert]')).not.toBeNull();
    listAnswer = () => Response.json({ collections: [col(1, 'Week 41')] });
    [...document.querySelectorAll('button')].find((b) => b.textContent === 'Try again')!.click();
    await settle();
    expect(document.querySelector('select')).not.toBeNull();
  });
});
