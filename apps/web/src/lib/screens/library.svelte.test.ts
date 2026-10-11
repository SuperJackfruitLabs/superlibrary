// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';

const calls: Array<{ path: string; body: any }> = [];
let browse: (n: number, body: any) => Response = () => Response.json({ items: [], next: null, counts: {} });
vi.mock('$lib/session.svelte', () => ({
  api: async (path: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ path, body });
    if (path === '/api/v1/facets') return Response.json({ boards: [{ id: 'brd_00000000000000b1', name: 'Press' }], agents: [], stations: [] });
    if (path === '/api/v1/search') return Response.json({ results: [] });
    return browse(calls.filter((c) => c.path === '/api/v1/browse').length, body);
  },
}));
import { LibraryModel } from './library.svelte';

const item = (n: number) => ({ id: `itm_00000000000000a${n}`, kind: 'artifact', title: `Item ${n}`, scope: 'workspace', outcome: 'completed', createdBy: 'p', createdAt: '2026-10-01T00:00:00.000Z', latestVersion: 1, expiresAt: null, revokedAt: null });
const settle = async () => { for (let i = 0; i < 6; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); } };
let stop: (() => void) | null = null;
afterEach(() => { stop?.(); stop = null; calls.length = 0; });
function make(qs = '') {
  const params = $state({ url: new URL(`http://localhost/${qs}`) });
  const navigate = vi.fn((href: string) => { params.url = new URL(`http://localhost${href}`); });
  let m!: LibraryModel;
  stop = $effect.root(() => { m = new LibraryModel(() => params.url.searchParams, navigate); });
  return { m, navigate };
}

describe('the library home model', () => {
  it('browses by default and says how many, most recent first', async () => {
    browse = () => Response.json({ items: [item(1), item(2)], next: 'c1', counts: { approved: 0, completed: 2, 'in-progress': 0, superseded: 0, rejected: 0, failed: 0, abandoned: 0 } });
    const { m } = make();
    await settle();
    expect(m.rows.map((r) => r.title)).toEqual(['Item 1', 'Item 2']);
    expect(m.status).toBe('2+ items, most recent activity first');
    expect(m.listLabel).toBe('Library');
    expect(m.counts?.completed).toBe(2);
    expect(m.empty).toBe('none');
  });

  it('a search goes into the address, and an empty answer says so', async () => {
    const { m, navigate } = make();
    await settle();
    m.words = 'retro';
    m.submit();
    expect(navigate).toHaveBeenCalledWith('/?q=retro');
    await settle();
    expect(m.searching).toBe(true);
    expect(m.empty).toBe('no-match');
    expect(m.listLabel).toBe('Search results');
  });

  it('Try again after a failed More resumes from that cursor', async () => {
    browse = (n) => (n === 1 ? Response.json({ items: [item(1)], next: 'c1', counts: {} }) : n === 2 ? Response.json({ error: 'unavailable' }, { status: 503 }) : Response.json({ items: [item(2)], next: null, counts: {} }));
    const { m } = make();
    await settle();
    await m.more();
    expect(m.error).not.toBeNull();
    await m.retry();
    expect(calls.filter((c) => c.path === '/api/v1/browse').at(-1)!.body.cursor).toBe('c1');
    expect(m.rows.map((r) => r.title)).toEqual(['Item 1', 'Item 2']);
  });

  it('a backwards date range asks for an end date and sends nothing', async () => {
    const { m } = make('?period=custom&from=2026-10-10&to=2026-10-01');
    await settle();
    expect(calls.filter((c) => c.path === '/api/v1/browse')).toHaveLength(0);
    expect(m.rows).toEqual([]);
  });
});
