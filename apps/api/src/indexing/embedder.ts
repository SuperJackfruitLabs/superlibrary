import type { Env } from '../env';
import { testOverrides } from './vector-index';

export interface Embedder { readonly id: string; readonly dims: number; embed(texts: string[]): Promise<number[][]> }

/** Spec §7: Workers AI `@cf/baai/bge-m3`, multilingual, 1024 dimensions. */
export class WorkersAiEmbedder implements Embedder {
  readonly id = 'workers-ai/bge-m3';
  readonly dims = 1024;
  constructor(private readonly ai: Ai, private readonly model = '@cf/baai/bge-m3', private readonly batch = 32) {}
  async embed(texts: string[]): Promise<number[][]> {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += this.batch) {
      const r = (await this.ai.run(this.model as keyof AiModels, { text: texts.slice(i, i + this.batch) } as never)) as unknown as { data: number[][] };
      const want = Math.min(this.batch, texts.length - i);
      if (!Array.isArray(r.data) || r.data.length !== want) throw new Error(`embedder returned ${r.data?.length} vectors for ${want} texts`);
      for (const v of r.data) {
        if (v.length !== this.dims) throw new Error(`embedding dimension ${v.length}, expected ${this.dims}`);
        out.push(v);
      }
    }
    return out;
  }
}

/** The embedders this deployment can use, by id. Moving to own hardware adds one here (spec §7). */
export function embedderFor(env: Env, id: string): Embedder {
  const fake = testOverrides()?.embedders?.[id];
  if (fake) return fake;
  if (id === 'workers-ai/bge-m3') {
    if (!env.AI) throw new Error('the AI binding is missing');
    return new WorkersAiEmbedder(env.AI);
  }
  throw new Error(`unknown embedder ${id}`);
}
