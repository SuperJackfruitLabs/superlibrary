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
beforeEach(() => { window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia; look.appearance = { ...look.appearance, vibe: 'studio' }; });
afterEach(() => { if (c) unmount(c); c = null; document.body.innerHTML = ''; look.appearance = { ...look.appearance, vibe: was }; });

describe('Studio: the library as a dashboard', () => {
  it('tiles for what is shown and each outcome, and the rows as a table with every part in its column', async () => {
    c = mount(Page, { target: document.body });
    await settle();
    const tiles = [...document.querySelectorAll('.sl-tiles .sl-tile')].map((t) => `${t.querySelector('dt')!.textContent}=${t.querySelector('dd')!.textContent}`);
    expect(tiles).toEqual(['Shown=2+', 'Filters on=0', 'Approved=0', 'Completed=1', 'In progress=0', 'Superseded=0', 'Rejected=1', 'Failed=0', 'Abandoned=0']);
    const table = document.querySelector('table.results[aria-label="Library"]')!;
    expect([...table.querySelectorAll('thead th')].map((th) => th.textContent!.trim())).toEqual(['Status', 'Title', 'Outcome', 'Kind', 'Board', 'Station', 'Source path', 'Visible to', 'Excerpt', 'Replaced by']);
    const first = [...table.querySelectorAll('tbody tr')[0]!.querySelectorAll('td')].map((td) => td.textContent!.trim());
    expect(first).toEqual(['', 'Parity report', 'Completed', 'Artifact', 'Parity board', 'docs', 'out/report', 'Everyone in the workspace', 'A caption for search', '']);
    expect(table.querySelector('tbody tr:nth-child(2) a.replaced')!.textContent).toBe('See what replaced it');
    for (const el of table.querySelectorAll('tr')) expect(el.getAttribute('role')).toBe('row');
  });
});
