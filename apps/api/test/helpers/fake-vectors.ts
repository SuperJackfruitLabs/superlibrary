import type { Embedder, VectorizeLike } from '../../src/indexing/vector-index';

type Stored = { id: string; values: number[]; namespace?: string; metadata?: Record<string, unknown> };
const cos = (a: number[], b: number[]) => {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i]! * b[i]!; na += a[i]! ** 2; nb += b[i]! ** 2; }
  return na && nb ? d / Math.sqrt(na * nb) : 0;
};
function matches(meta: Record<string, unknown> | undefined, filter: Record<string, any> | undefined): boolean {
  if (!filter) return true;
  return Object.entries(filter).every(([k, cond]) => {
    const v = meta?.[k];
    if (cond && typeof cond === 'object' && '$in' in cond) return (cond.$in as unknown[]).includes(v);
    if (cond && typeof cond === 'object' && '$eq' in cond) return v === cond.$eq;
    return v === cond;
  });
}

/** In-memory Vectorize with namespaces, $in/$eq filters and cosine ranking; records every call. */
export function fakeVectorize(): VectorizeLike & { store: Map<string, Stored>; queries: Array<{ namespace?: string; filter?: unknown }> } {
  const store = new Map<string, Stored>();
  const queries: Array<{ namespace?: string; filter?: unknown }> = [];
  return {
    store, queries,
    async upsert(v: any[]) { for (const x of v) store.set(x.id, x); return { mutationId: 'm', count: v.length } as any; },
    async getByIds(ids: string[]) { return ids.flatMap((id) => (store.has(id) ? [store.get(id)!] : [])) as any; },
    async deleteByIds(ids: string[]) { for (const id of ids) store.delete(id); return { mutationId: 'm', count: ids.length } as any; },
    async query(values: number[], o: any) {
      queries.push({ namespace: o?.namespace, filter: o?.filter });
      const hits = [...store.values()]
        .filter((x) => (o?.namespace === undefined || x.namespace === o.namespace) && matches(x.metadata, o?.filter))
        .map((x) => ({ id: x.id, score: cos(values, x.values), metadata: x.metadata }))
        .sort((a, b) => b.score - a.score).slice(0, o?.topK ?? 10);
      return { matches: hits, count: hits.length } as any;
    },
  };
}

/** Deterministic bag-of-words embedder: shared words → similar vectors. */
export function fakeEmbedder(id = 'workers-ai/bge-m3', dims = 1024): Embedder & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    id, dims, calls,
    async embed(texts) {
      calls.push(texts);
      return texts.map((t) => {
        const v = new Array<number>(dims).fill(0);
        for (const w of t.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').match(/[\p{L}\p{N}]+/gu) ?? []) {
          let h = 0;
          for (const c of w) h = (h * 31 + c.codePointAt(0)!) >>> 0;
          v[h % dims]! += 1;
        }
        return v;
      });
    },
  };
}
