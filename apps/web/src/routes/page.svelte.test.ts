// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const calls: Array<{ path: string; body: any }> = [];
let browse: (n: number, body: any) => Response;
vi.mock('$lib/session.svelte', () => ({
  api: async (path: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ path, body });
    if (path === '/api/v1/facets') return Response.json({ boards: [], agents: [], stations: [] });
    return browse(calls.filter((c) => c.path === '/api/v1/browse').length, body);
  },
}));
import Page from './+page.svelte';

let c: ReturnType<typeof mount> | null = null;
beforeEach(() => { window.matchMedia = (() => ({ matches: false })) as unknown as typeof window.matchMedia; });
afterEach(() => { if (c) unmount(c); c = null; document.body.innerHTML = ''; calls.length = 0; });
const item = (n: number) => ({ id: `itm_00000000000000a${n}`, kind: 'artifact', title: `Item ${n}`, scope: 'workspace', outcome: 'completed', createdBy: 'p', createdAt: '2026-10-01T00:00:00.000Z', latestVersion: 1, expiresAt: null, revokedAt: null });
const settle = async () => { for (let i = 0; i < 6; i++) { await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); flushSync(); } };
const button = (t: string) => [...document.querySelectorAll('button')].find((b) => b.textContent!.trim() === t)!;

describe('the library page', () => {
  it('the Upload action is the kit button', async () => {
    browse = () => Response.json({ items: [], next: null, counts: {} });
    c = mount(Page, { target: document.body });
    await settle();
    const up = document.querySelector('.heading a[href="/upload"]')!;
    expect(up.className).toContain('kit-button--primary');
  });
  it('Try again after a failed More resumes from that cursor, not from the top', async () => {
    browse = (n) => (n === 1 ? Response.json({ items: [item(1)], next: 'c1', counts: {} }) : n === 2 ? Response.json({ error: 'unavailable' }, { status: 503 }) : Response.json({ items: [item(2)], next: null, counts: {} }));
    c = mount(Page, { target: document.body });
    await settle();
    button('More').click();
    await settle();
    expect(document.querySelector('[role="alert"]')).not.toBeNull();
    button('Try again').click();
    await settle();
    const browses = calls.filter((x) => x.path === '/api/v1/browse');
    expect(browses.map((b) => b.body.cursor)).toEqual([undefined, 'c1', 'c1']);
    expect(document.body.textContent).toContain('Item 2');
  });
  it('mounts the Daylight layout through VibeLayout with every parity item', async () => {
    browse = () => Response.json({ items: [{ ...item(1), source: { agent: 'prn_00000000000000a1', board: 'brd_x', path: 'a/b.md' }, supersededBy: 'itm_00000000000000a2', caption: 'A caption' }], next: 'c1', counts: {} });
    c = mount(Page, { target: document.body });
    await settle();
    const text = document.body.textContent!;
    expect(document.querySelector('.sl-day-hero .vk-sky')).not.toBeNull();
    expect(document.querySelector('.sl-day-hero h1')!.textContent).toBe('Library');
    expect(document.querySelector('.sl-day-hero form[role="search"] label[for="q"]')!.textContent).toBe('Search the library');
    expect(document.querySelector('.sl-day-filters')!.textContent).toContain('Filters');
    expect(document.querySelector('[role="status"]')!.textContent).toBe('1+ item, most recent activity first');
    expect(document.querySelector('ul.results[aria-label="Library"] li .result-link')!.getAttribute('href')).toBe('/a/itm_00000000000000a1');
    expect(text).toContain('A caption');
    expect(document.querySelector('.replaced')!.textContent).toBe('See what replaced it');
    expect(document.querySelector('.result-face')).not.toBeNull();
    expect(button('More')).toBeDefined();
  });
});
