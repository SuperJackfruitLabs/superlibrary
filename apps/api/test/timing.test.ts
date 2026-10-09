import { env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setIndexingForTests } from '../src/indexing/vector-index';
import { indexItem } from '../src/indexing/consumer';
import { fakeEmbedder, fakeVectorize } from './helpers/fake-vectors';
import { upload } from './helpers/upload';
import { call, workspaceOf } from './helpers/library';

const stages = (h: string | null) => (h ?? '').split(',').map((s) => s.trim().split(';')[0]);

beforeEach(async () => {
  setIndexingForTests({ embedders: { 'workers-ai/bge-m3': fakeEmbedder() }, bindings: { a: fakeVectorize() } });
  await workspaceOf();
});
afterEach(() => setIndexingForTests(null));

describe('stage timings (gap S4)', () => {
  it('related answers its stage timings beside the request cost', async () => {
    const a = (await upload([{ path: 'q.md', body: '# Queue workers drain the backlog' }], { title: 'Queue workers' })).body.itemId as string;
    await indexItem(env, a);
    // Gap S2: related never returns the item itself, so a second item gives it something to hydrate.
    const b = (await upload([{ path: 'r.md', body: '# Queue workers and the backlog they drain' }], { title: 'Backlog' })).body.itemId as string;
    await indexItem(env, b);
    const res = await call('/api/v1/related', { method: 'POST', body: { itemId: a } });
    expect(res.status).toBe(200);
    expect(stages(res.headers.get('Server-Timing'))).toEqual(expect.arrayContaining(['auth', 'scopes', 'basis', 'slots', 'embed', 'vector', 'fts', 'hydrate', 'fit', 'audit', 'd1rt', 'app']));
  });
  it('search answers the same stages', async () => {
    const a = (await upload([{ path: 's.md', body: '# Queue workers in search' }], { title: 'Queue search' })).body.itemId as string;
    await indexItem(env, a);
    const res = await call('/api/v1/search', { method: 'POST', body: { query: 'queue workers' } });
    expect(stages(res.headers.get('Server-Timing'))).toEqual(expect.arrayContaining(['auth', 'scopes', 'slots', 'embed', 'vector', 'fts', 'hydrate', 'audit', 'd1rt', 'app']));
  });
  it('timings name stages only: no ids and no query text', async () => {
    const a = (await upload([{ path: 'z.md', body: '# Zephyr notes' }], { title: 'Zephyr' })).body.itemId as string;
    const res = await call('/api/v1/related', { method: 'POST', body: { itemId: a } });
    const h = res.headers.get('Server-Timing')!;
    expect(h).not.toContain(a);
    expect(h.toLowerCase()).not.toContain('zephyr');
    expect(h).toMatch(/^[a-z0-9]+;(dur=\d+|desc="\d+")(, [a-z0-9]+;(dur=\d+|desc="\d+"))*$/);
  });
});
