import { env } from 'cloudflare:test';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkersAiEmbedder, embedderFor } from '../src/indexing/embedder';
import { indexFor, readSlots, setIndexingForTests } from '../src/indexing/vector-index';
import { fakeEmbedder, fakeVectorize } from './helpers/fake-vectors';

afterEach(() => setIndexingForTests(null));
const meta = (embedder: string, dims = 1024) => ({ itemId: 'itm_00000000000000a1', scope: 'workspace', kind: 'artifact', outcome: 'completed', embedder, dims, version: 1, position: 0 });

describe('slots', () => {
  it('reads slot a as active with bge-m3', async () => {
    const s = await readSlots(env);
    expect(s.active).toMatchObject({ slot: 'a', embedder_id: 'workers-ai/bge-m3', dims: 1024 });
    expect(s.building).toBeNull();
  });
});

describe('two embedders never mix (spec §15)', () => {
  it('a slot refuses vectors from another embedder', async () => {
    const a = fakeVectorize();
    setIndexingForTests({ bindings: { a } });
    const idx = indexFor(env, (await readSlots(env)).active);
    await expect(idx.upsert([{ id: 'x', values: new Array(1024).fill(0.1), namespace: 'wsp_1', metadata: meta('foundry/other') }])).rejects.toThrow(/embedder mismatch/);
    await expect(idx.upsert([{ id: 'x', values: [1, 2, 3], namespace: 'wsp_1', metadata: meta('workers-ai/bge-m3') }])).rejects.toThrow(/embedder mismatch/);
    await expect(idx.upsert([{ id: 'x', values: new Array(1024).fill(0.1), namespace: 'wsp_1', metadata: meta('workers-ai/bge-m3', 768) }])).rejects.toThrow(/embedder mismatch/);
    expect(a.store.size).toBe(0);
  });
  it('queries filter on the slot\'s embedder', async () => {
    const a = fakeVectorize();
    setIndexingForTests({ bindings: { a } });
    const idx = indexFor(env, (await readSlots(env)).active);
    await idx.query(new Array(1024).fill(0.1), { namespace: 'wsp_1', topK: 5, filter: { scope: { $in: ['workspace'] } } });
    expect(a.queries[0]).toEqual({ namespace: 'wsp_1', filter: { scope: { $in: ['workspace'] }, embedder: { $eq: 'workers-ai/bge-m3' } } });
  });
  it('refuses a query vector of the wrong length', async () => {
    const a = fakeVectorize();
    setIndexingForTests({ bindings: { a } });
    const idx = indexFor(env, (await readSlots(env)).active);
    await expect(idx.query([1, 2, 3], { namespace: 'wsp_1', topK: 5, filter: { scope: { $in: ['workspace'] } } })).rejects.toThrow(/embedder mismatch/);
    expect(a.queries).toEqual([]);
  });
  it('a stray vector from another embedder in the same index is never returned', async () => {
    const a = fakeVectorize();
    a.store.set('stray', { id: 'stray', values: new Array(1024).fill(0.1), namespace: 'wsp_1', metadata: meta('foundry/other') });
    setIndexingForTests({ bindings: { a } });
    const idx = indexFor(env, (await readSlots(env)).active);
    expect(await idx.query(new Array(1024).fill(0.1), { namespace: 'wsp_1', topK: 5, filter: { scope: { $in: ['workspace'] } } })).toEqual([]);
  });
  it('sends at most 1,000 vectors per upsert', async () => {
    const a = fakeVectorize();
    const sizes: number[] = [];
    const up = a.upsert.bind(a);
    a.upsert = (async (v: any[]) => { sizes.push(v.length); return up(v); }) as any;
    setIndexingForTests({ bindings: { a } });
    const idx = indexFor(env, (await readSlots(env)).active);
    await idx.upsert(Array.from({ length: 2500 }, (_, i) => ({ id: `v${i}`, values: new Array(1024).fill(0.1), namespace: 'wsp_1', metadata: meta('workers-ai/bge-m3') })));
    expect(sizes).toEqual([1000, 1000, 500]);
  });
});

describe('WorkersAiEmbedder', () => {
  it('calls bge-m3 in batches of 32 and returns 1024-d vectors', async () => {
    const calls: number[] = [];
    const ai = { run: async (model: string, input: { text: string[] }) => { expect(model).toBe('@cf/baai/bge-m3'); calls.push(input.text.length); return { shape: [input.text.length, 1024], data: input.text.map(() => new Array(1024).fill(0.5)) }; } };
    const e = new WorkersAiEmbedder(ai as unknown as Ai);
    const out = await e.embed(Array.from({ length: 70 }, (_, i) => `t${i}`));
    expect(calls).toEqual([32, 32, 6]);
    expect(out).toHaveLength(70);
    expect(out[0]).toHaveLength(1024);
  });
  it('refuses an answer of the wrong dimension', async () => {
    const ai = { run: async () => ({ shape: [1, 768], data: [new Array(768).fill(0)] }) };
    await expect(new WorkersAiEmbedder(ai as unknown as Ai).embed(['x'])).rejects.toThrow(/dimension/);
  });
  it('embedderFor knows bge-m3 and refuses an unknown id', () => {
    setIndexingForTests({ embedders: { 'workers-ai/bge-m3': fakeEmbedder() } });
    expect(embedderFor(env, 'workers-ai/bge-m3').dims).toBe(1024);
    expect(() => embedderFor(env, 'nope/none')).toThrow(/unknown embedder/);
  });
});
