import type { Env } from '../env';
import { serviceToken } from '../clients/plane';

export interface PipelineCard {
  id: string; title: string; spec: unknown; state: string; currentStageKey: string | null;
  archivedAt: string | null; needsHuman: { reason: string } | null; createdAt: string; updatedAt: string;
}
export interface PipelineAttempt {
  runId: string; stageKey: string; agentId: string | null; status: string; outcome: string | null;
  startedAt: string | null; endedAt: string | null; handoff: unknown; failureReason: string | null;
}
export interface PipelineComment { id: string; author: { kind: 'human' | 'agent'; id: string; name: string | null }; body: string; createdAt: string; deletedAt: string | null }
export interface PipelineLink { fromCardId: string; toCardId: string; kind: string }
export interface PipelineGate { id: string; cardId: string; stageKey: string; status: string; decision: 'approve' | 'request_changes' | 'reject' | null; resolvedAt: string | null }
export interface PipelineReference { cardId: string; url: string; title: string | null; provider: string; externalId: string | null }
export interface CardBundle { card: PipelineCard; attempts: PipelineAttempt[]; comments: PipelineComment[]; links: PipelineLink[]; gates: PipelineGate[]; references: PipelineReference[] }

export class PipelineError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export type SnapshotCache = Map<string, Promise<{ cards: PipelineCard[]; references: PipelineReference[] }>>;

export interface SuperpipelineClient {
  boards(): Promise<Array<{ id: string; name: string }>>;
  snapshot(boardId: string): Promise<{ cards: PipelineCard[]; references: PipelineReference[] }>;
  /** `snapshots`: a per-batch cache of board snapshots, so many cards of one board read it once. */
  cardBundle(boardId: string, cardId: string, snapshots?: SnapshotCache): Promise<CardBundle | null>;
  registerPush(boardId: string, url: string, token: string, events: string[]): Promise<string>;
}

/** Superpipeline as Superlibrary's own service (cards:read, push:write; plan P8). */
export function pipelineFor(env: Env, org: string): SuperpipelineClient {
  const base = env.SUPERPIPELINE_URL!;
  async function call<T>(method: string, path: string, body?: unknown): Promise<{ status: number; json: T | null }> {
    const token = await serviceToken(env, org, env.SUPERPIPELINE_AUDIENCE!);
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 404) return { status: 404, json: null };
    if (!res.ok) throw new PipelineError(res.status, `superpipeline ${method} ${path}: ${res.status}`);
    return { status: res.status, json: (await res.json()) as T };
  }
  const b = (id: string) => `/v1/boards/${encodeURIComponent(id)}`;
  function snapshotOf(boardId: string, cache?: SnapshotCache) {
    if (!cache) return client.snapshot(boardId);
    let p = cache.get(boardId);
    if (!p) { p = client.snapshot(boardId); cache.set(boardId, p); p.catch(() => cache.delete(boardId)); }
    return p;
  }
  const client: SuperpipelineClient = {
    async boards() { return (await call<{ boards: Array<{ id: string; name: string }> }>('GET', '/v1/boards')).json?.boards ?? []; },
    async snapshot(boardId) {
      const s = (await call<{ cards: PipelineCard[]; references: PipelineReference[] }>('GET', b(boardId))).json;
      return { cards: s?.cards ?? [], references: s?.references ?? [] };
    },
    async cardBundle(boardId, cardId, snapshots) {
      const c = `${b(boardId)}/cards/${encodeURIComponent(cardId)}`;
      const card = (await call<{ card: PipelineCard }>('GET', c)).json?.card;
      if (!card) return null;
      const [attempts, comments, links, activities, snap] = await Promise.all([
        call<{ attempts: PipelineAttempt[] }>('GET', `${c}/attempts`),
        call<{ comments: PipelineComment[] }>('GET', `${c}/comments`),
        call<{ links: PipelineLink[] }>('GET', `${c}/links`),
        call<{ gates: PipelineGate[] }>('GET', `${c}/activities`),
        snapshotOf(boardId, snapshots),
      ]);
      return {
        card,
        attempts: attempts.json?.attempts ?? [],
        comments: (comments.json?.comments ?? []).filter((x) => !x.deletedAt),
        links: links.json?.links ?? [],
        gates: activities.json?.gates ?? [],
        references: snap.references.filter((r) => r.cardId === cardId),
      };
    },
    async registerPush(boardId, url, token, events) {
      const r = await call<{ configId: string }>('POST', `${b(boardId)}/push-configs`, { url, token, events });
      if (!r.json) throw new PipelineError(404, `board ${boardId} not found`);
      return r.json.configId;
    },
  };
  return client;
}
