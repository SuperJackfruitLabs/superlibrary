// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
vi.mock('$lib/session.svelte', async () => { const { FIX } = await import('$lib/screens/parity.fixture'); return { session: { me: FIX.me, notEnabled: null }, api: async (p: string, i?: RequestInit) => FIX.respond(p, i) }; });
vi.mock('$app/navigation', () => ({ goto: vi.fn(), replaceState: vi.fn() }));
import { look } from '$lib/vibe/appearance.svelte';
import Page from '../../../routes/+page.svelte';

let c: ReturnType<typeof mount> | null = null;
const settle = async () => { for (let i = 0; i < 8; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); } };
const was = look.appearance.vibe;
beforeEach(() => { window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia; look.appearance = { ...look.appearance, vibe: 'paper' }; });
afterEach(() => { if (c) unmount(c); c = null; document.body.innerHTML = ''; look.appearance = { ...look.appearance, vibe: was }; });

describe('Paper: the library as a front page', () => {
  it('a masthead, the filters beside the results, and the rows as an index', async () => {
    c = mount(Page, { target: document.body });
    await settle();
    expect(document.querySelector('.sl-masthead h1')!.textContent).toBe('Library');
    expect(document.querySelector('.sl-paper-side details.filters')).not.toBeNull();
    expect(document.querySelector('.sl-paper-side .sl-status')).not.toBeNull();
    const list = document.querySelector('ul.results--index[aria-label="Library"]')!;
    expect(list.querySelectorAll(':scope > li')).toHaveLength(2);
    expect(list.querySelector('blockquote.snippet')!.textContent).toBe('A caption for search');
    expect(document.querySelector('.vk-sky')).toBeNull();
  });
});
