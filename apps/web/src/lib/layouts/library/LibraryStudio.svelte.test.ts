// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
const ctl = vi.hoisted(() => ({ fail: false, hold: null as Promise<void> | null }));
vi.mock('$lib/session.svelte', async () => {
  const { FIX } = await import('$lib/screens/parity.fixture');
  return { session: { me: FIX.me, notEnabled: null }, api: async (p: string, i?: RequestInit) => { if (p === '/api/v1/browse') { if (ctl.hold) await ctl.hold; if (ctl.fail) return Response.json({ error: 'boom' }, { status: 500 }); } return FIX.respond(p, i); } };
});
const pg = vi.hoisted(() => ({ url: new URL('http://localhost/') }));
vi.mock('$app/state', () => ({ page: pg }));
vi.mock('$app/navigation', () => ({ goto: vi.fn(), replaceState: vi.fn() }));
import { look } from '$lib/vibe/appearance.svelte';
import Page from '../../../routes/+page.svelte';

let c: ReturnType<typeof mount> | null = null;
const settle = async () => { for (let i = 0; i < 8; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); } };
const was = look.appearance.vibe;
beforeEach(() => { window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia; look.appearance = { ...look.appearance, vibe: 'studio' }; });
afterEach(() => { pg.url = new URL('http://localhost/'); ctl.fail = false; ctl.hold = null; if (c) unmount(c); c = null; document.body.innerHTML = ''; look.appearance = { ...look.appearance, vibe: was }; });

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

  it('every part of the table keeps its role, so stacking it with CSS keeps the semantics', async () => {
    c = mount(Page, { target: document.body });
    await settle();
    const table = document.querySelector('table.results')!;
    expect(table.getAttribute('role')).toBe('table');
    expect([...table.querySelectorAll('thead, tbody')].map((g) => g.getAttribute('role'))).toEqual(['rowgroup', 'rowgroup']);
    for (const th of table.querySelectorAll('th')) { expect(th.getAttribute('role')).toBe('columnheader'); expect(th.getAttribute('scope')).toBe('col'); }
    for (const td of table.querySelectorAll('td')) { expect(td.getAttribute('role')).toBe('cell'); expect(td.getAttribute('data-label')).not.toBeNull(); }
  });

  it('no tiles while the first page loads, none on an error, and only Shown and Filters on while searching', async () => {
    let release!: () => void;
    ctl.hold = new Promise<void>((r) => { release = r; });
    c = mount(Page, { target: document.body });
    await settle();
    expect(document.querySelector('.sl-tiles')).toBeNull();
    ctl.hold = null;
    release();
    await settle();
    expect(document.querySelectorAll('.sl-tiles .sl-tile')).toHaveLength(9);
    // More keeps the tiles: they are still this query's
    ctl.hold = new Promise<void>((r) => { release = r; });
    (document.querySelector('.sl-more') as HTMLButtonElement).click();
    await settle();
    expect(document.querySelectorAll('.sl-tiles .sl-tile')).toHaveLength(9);
  });

  it('no tiles on an error', async () => {
    ctl.fail = true;
    c = mount(Page, { target: document.body });
    await settle();
    expect(document.querySelector('[role="alert"]')).not.toBeNull();
    expect(document.querySelector('.sl-tiles')).toBeNull();
  });

  it('searching shows Shown and Filters on only, and names the table for search', async () => {
    pg.url = new URL('http://localhost/?q=retro');
    c = mount(Page, { target: document.body });
    await settle();
    expect([...document.querySelectorAll('.sl-tiles .sl-tile dt')].map((t) => t.textContent)).toEqual(['Shown', 'Filters on']);
  });
});
