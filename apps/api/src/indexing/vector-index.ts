import type { Env } from '../env';
import type { Embedder } from './embedder';

export type { Embedder };

export interface VectorMeta { itemId: string; scope: string; kind: string; outcome: string; embedder: string; dims: number; version: number; position: number }
export interface VectorRecord { id: string; values: number[]; namespace: string; metadata: VectorMeta }
export interface VectorFilter { scope: { $in: string[] }; kind?: { $in: string[] }; outcome?: { $in: string[] } }
export interface VectorMatch { id: string; score: number; itemId: string }
export interface VectorIndex {
  readonly slot: 'a' | 'b'; readonly embedderId: string; readonly dims: number;
  upsert(v: VectorRecord[]): Promise<void>;
  delete(ids: string[]): Promise<void>;
  query(values: number[], o: { namespace: string; topK: number; filter: VectorFilter }): Promise<VectorMatch[]>;
}
export interface SlotRow { slot: 'a' | 'b'; embedder_id: string | null; dims: number | null; state: 'active' | 'building' | 'idle'; cursor: string | null }
export type VectorizeLike = Pick<VectorizeIndex, 'upsert' | 'deleteByIds' | 'query'>;

let overrides: { embedders?: Record<string, Embedder>; bindings?: Partial<Record<'a' | 'b', VectorizeLike>> } | null = null;
export function setIndexingForTests(o: typeof overrides): void { overrides = o; }
export const testOverrides = () => overrides;

export async function readSlots(env: Env): Promise<{ active: SlotRow; building: SlotRow | null }> {
  const rows = (await env.DB.prepare(`SELECT slot, embedder_id, dims, state, cursor FROM vector_slots`).all<SlotRow>()).results;
  const active = rows.find((r) => r.state === 'active');
  if (!active) throw new Error('no active vector slot');
  return { active, building: rows.find((r) => r.state === 'building') ?? null };
}

/** A slot's index, guarded so one index only ever holds one embedder's vectors (spec §7). */
export function indexFor(env: Env, s: SlotRow): VectorIndex {
  if (!s.embedder_id || !s.dims) throw new Error(`slot ${s.slot} has no embedder`);
  const raw = overrides?.bindings?.[s.slot] ?? (s.slot === 'a' ? env.VEC_A : env.VEC_B);
  if (!raw) throw new Error(`the vectorize binding for slot ${s.slot} is missing`);
  const embedderId = s.embedder_id;
  const dims = s.dims;
  return {
    slot: s.slot, embedderId, dims,
    async upsert(v) {
      if (v.some((x) => x.metadata.embedder !== embedderId || x.values.length !== dims || x.metadata.dims !== dims)) throw new Error(`embedder mismatch for slot ${s.slot}`);
      for (let i = 0; i < v.length; i += 1000) await raw.upsert(v.slice(i, i + 1000) as unknown as VectorizeVector[]);
    },
    async delete(ids) {
      for (let i = 0; i < ids.length; i += 1000) await raw.deleteByIds(ids.slice(i, i + 1000));
    },
    async query(values, o) {
      if (values.length !== dims) throw new Error(`embedder mismatch for slot ${s.slot}`);
      const r = await raw.query(values, { topK: o.topK, namespace: o.namespace, returnMetadata: 'indexed', filter: { ...o.filter, embedder: { $eq: embedderId } } as VectorizeVectorMetadataFilter });
      return r.matches.map((m) => ({ id: m.id, score: m.score, itemId: String((m.metadata as Record<string, unknown> | undefined)?.itemId ?? m.id.split(':')[0]) }));
    },
  };
}
