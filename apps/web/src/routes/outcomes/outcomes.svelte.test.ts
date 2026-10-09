// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const calls: Array<{ path: string; body: any }> = [];
let browse: (n: number) => Response;
const loc = $state({ search: 'outcome=rejected' });
vi.mock('$lib/session.svelte', () => ({
  api: async (path: string, init?: RequestInit) => {
    calls.push({ path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (path === '/api/v1/facets') return Response.json({ boards: [], agents: [], stations: [] });
    return browse(calls.filter((c) => c.path === '/api/v1/browse').length);
  },
}));
vi.mock('$app/state', () => ({ page: { get url() { return new URL(`http://localhost/outcomes?${loc.search}`); } } }));
vi.mock('$app/navigation', () => ({ goto: vi.fn(), replaceState: vi.fn() }));
import Page from './+page.svelte';

let c: ReturnType<typeof mount> | null = null;
beforeEach(() => { window.matchMedia = (() => ({ matches: false })) as unknown as typeof window.matchMedia; loc.search = 'outcome=rejected'; });
afterEach(() => { if (c) unmount(c); c = null; document.body.innerHTML = ''; calls.length = 0; });
const settle = async () => { for (let i = 0; i < 6; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); } };
const counts = { approved: 14, completed: 6, 'in-progress': 3, superseded: 2, rejected: 2, failed: 1, abandoned: 0 };
const item = (n: number) => ({ id: `itm_00000000000000a${n}`, kind: 'artifact', title: `Item ${n}`, scope: 'workspace', outcome: 'rejected', createdBy: 'p', createdAt: '2026-10-01T00:00:00.000Z', latestVersion: 1, expiresAt: null, revokedAt: null });

describe('the outcomes page', () => {
  it('tabs link to each outcome view, show counts, and mark the current one', async () => {
    browse = () => Response.json({ items: [item(1)], next: null, counts });
    c = mount(Page, { target: document.body });
    await settle();
    const tabs = [...document.querySelectorAll<HTMLAnchorElement>('nav[aria-label="Outcome"] a')];
    expect(tabs.map((a) => a.textContent!.replace(/\s+/g, ' ').trim())).toEqual(['Everything 28', 'Approved 14', 'Completed 6', 'In progress 3', 'Superseded 2', 'Rejected 2', 'Failed 1', 'Abandoned 0']);
    expect(tabs[1]!.getAttribute('href')).toBe('/outcomes?outcome=approved');
    expect(tabs[0]!.getAttribute('href')).toBe('/outcomes');
    expect(document.querySelector('[aria-current="page"]')!.textContent).toContain('Rejected');
    expect(calls.find((x) => x.path === '/api/v1/browse')!.body.outcomes).toEqual(['rejected']);
  });
  it('an empty view says so in words', async () => {
    browse = () => Response.json({ items: [], next: null, counts });
    c = mount(Page, { target: document.body });
    await settle();
    expect(document.body.textContent).toContain('Nothing rejected here in this period.');
  });
  it('an error clears the stale rows and counts, and Try again retries', async () => {
    browse = (n) => (n === 1 ? Response.json({ items: [item(1)], next: null, counts }) : n === 2 ? Response.json({ error: 'unavailable' }, { status: 503 }) : Response.json({ items: [item(2)], next: null, counts }));
    c = mount(Page, { target: document.body });
    await settle();
    expect(document.body.textContent).toContain('Item 1');
    loc.search = 'outcome=failed';   // navigating to another view loads again, and that load fails
    await settle();
    expect(document.querySelector('[role=alert]')).not.toBeNull();
    expect(document.body.textContent).not.toContain('Item 1');
    expect(document.body.textContent).not.toContain('Approved 14');
    [...document.querySelectorAll('button')].find((b) => b.textContent === 'Try again')!.click();
    await settle();
    expect(document.body.textContent).toContain('Item 2');
  });
});
