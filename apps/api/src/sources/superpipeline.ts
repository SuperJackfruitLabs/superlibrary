import { createBundle, openApi, validateResponse } from '@superjackfruitlabs/treaty-contracts';
import boardRead from '@superjackfruitlabs/treaty-contracts/data/schemas/http/superpipeline/board-read.v1.openapi.json';
import push from '@superjackfruitlabs/treaty-contracts/data/schemas/http/superpipeline/push.v1.openapi.json';
import errorV1 from '@superjackfruitlabs/treaty-contracts/data/schemas/common/error.v1.json';
import cardRepositories from '@superjackfruitlabs/treaty-contracts/data/schemas/superpipeline-api/card-repositories.v1.json';
import runCheckpointPolicy from '@superjackfruitlabs/treaty-contracts/data/schemas/superpipeline-api/run-checkpoint-policy.v1.json';
import runCheckpointPolicyV2 from '@superjackfruitlabs/treaty-contracts/data/schemas/superpipeline-api/run-checkpoint-policy.v2.json';
import type { Env } from '../env';
import { serviceToken } from '../clients/plane';

/**
 * The parts of SuperPipeline's board reads SuperLibrary uses, as treaty's `board-read.v1` holds them
 * (`push.v1` for the push config). Every answer is validated against the contract before it is
 * read, so these name fields the contract guarantees; `spec` and `handoff` stay `unknown` because
 * the contract leaves them open.
 */
export interface PipelineCard {
  id: string; title: string; spec: unknown; state: string; currentStageKey: string | null;
  archivedAt: string | null; needsHuman?: { reason: string } | null; createdAt: string; updatedAt: string | null;
}
export interface PipelineAttempt {
  runId: string; stageKey: string; agentId: string | null; status: string; outcome: string | null;
  startedAt: string | null; endedAt: string | null; handoff: unknown; failureReason: string | null;
}
export interface PipelineComment { id: string; author: { kind: 'human' | 'agent'; id: string; name: string | null }; body: string; createdAt: string; deletedAt: string | null }
export interface PipelineLink { fromCardId: string; toCardId: string; kind: string }
/**
 * `decision` is an open string in the contract: besides approve, request_changes and reject the
 * board writes approve_manual, approve_automatic and an expired marker, and may add more.
 */
export interface PipelineGate { id: string; cardId: string; stageKey: string; status: string; decision: string | null; resolvedAt: string | null }
export interface PipelineReference { cardId: string; url: string; title: string | null; provider: string; externalId: string | null }
export interface CardBundle { card: PipelineCard; attempts: PipelineAttempt[]; comments: PipelineComment[]; links: PipelineLink[]; gates: PipelineGate[]; references: PipelineReference[] }

const BOARD_READ = 'schemas/http/superpipeline/board-read.v1.openapi.json';
const PUSH = 'schemas/http/superpipeline/push.v1.openapi.json';
const bundle = createBundle({
  [BOARD_READ]: boardRead,
  [PUSH]: push,
  'schemas/common/error.v1.json': errorV1,
  'schemas/superpipeline-api/card-repositories.v1.json': cardRepositories,
  'schemas/superpipeline-api/run-checkpoint-policy.v1.json': runCheckpointPolicy,
  'schemas/superpipeline-api/run-checkpoint-policy.v2.json': runCheckpointPolicyV2,
});
const APIS = { boardRead: openApi(bundle, BOARD_READ), push: openApi(bundle, PUSH) };

/** The answers SuperLibrary reads, by operation in treaty's documents. */
interface Answers {
  listBoards: { boards: Array<{ id: string; name: string }> };
  readBoard: { cards: PipelineCard[]; references: PipelineReference[] };
  readCard: { card: PipelineCard };
  listCardAttempts: { attempts: PipelineAttempt[] };
  listCardComments: { comments: PipelineComment[] };
  listCardLinks: { links: PipelineLink[] };
  listCardActivities: { gates: PipelineGate[] };
  registerPushConfig: { configId: string };
}
const DOCUMENT_OF: Record<keyof Answers, keyof typeof APIS> = {
  listBoards: 'boardRead', readBoard: 'boardRead', readCard: 'boardRead', listCardAttempts: 'boardRead',
  listCardComments: 'boardRead', listCardLinks: 'boardRead', listCardActivities: 'boardRead', registerPushConfig: 'push',
};

/**
 * True when `body` is what the contract says `operation` answers with `status`. When it is not,
 * `why` gets the JSON pointers that failed, never the values: a card's text stays out of logs.
 */
function conforms<O extends keyof Answers>(operation: O, status: number, body: unknown, why: string[]): body is Answers[O] {
  const result = validateResponse(bundle, APIS[DOCUMENT_OF[operation]], operation, status, body);
  why.push(...result.errors.slice(0, 5).map((e) => e.split(' ')[0]));
  return result.valid;
}

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
  /**
   * One call, its answer checked against treaty's contract for `operation`. 404 is no such board or
   * card (null). Any other refusal, an answer that is not JSON, or one the contract refuses is a
   * PipelineError: SuperPipeline is unavailable for this read, and the caller keeps its own rules
   * for that (the ingest retries; a subscription notes it).
   */
  async function call<O extends keyof Answers>(operation: O, method: string, path: string, body?: unknown): Promise<Answers[O] | null> {
    const token = await serviceToken(env, org, env.SUPERPIPELINE_AUDIENCE!);
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new PipelineError(res.status, `superpipeline ${method} ${path}: ${res.status}`);
    const json: unknown = await res.json().catch(() => undefined);
    const why: string[] = [];
    if (!conforms(operation, res.status, json, why)) throw new PipelineError(502, `superpipeline ${operation} ${res.status}: the answer does not match treaty's contract at ${why.join(' ')}`);
    return json;
  }
  const b = (id: string) => `/v1/boards/${encodeURIComponent(id)}`;
  function snapshotOf(boardId: string, cache?: SnapshotCache) {
    if (!cache) return client.snapshot(boardId);
    let p = cache.get(boardId);
    if (!p) { p = client.snapshot(boardId); cache.set(boardId, p); p.catch(() => cache.delete(boardId)); }
    return p;
  }
  const client: SuperpipelineClient = {
    async boards() { return (await call('listBoards', 'GET', '/v1/boards'))?.boards ?? []; },
    async snapshot(boardId) {
      const s = await call('readBoard', 'GET', b(boardId));
      // A missing board is an error, never an empty one: callers must not read "no cards" from it.
      if (!s) throw new PipelineError(404, `board ${boardId} not found`);
      return { cards: s.cards, references: s.references };
    },
    async cardBundle(boardId, cardId, snapshots) {
      const c = `${b(boardId)}/cards/${encodeURIComponent(cardId)}`;
      const card = (await call('readCard', 'GET', c))?.card;
      if (!card) return null;
      const [attempts, comments, links, activities, snap] = await Promise.all([
        call('listCardAttempts', 'GET', `${c}/attempts`),
        call('listCardComments', 'GET', `${c}/comments`),
        call('listCardLinks', 'GET', `${c}/links`),
        call('listCardActivities', 'GET', `${c}/activities`),
        snapshotOf(boardId, snapshots),
      ]);
      return {
        card,
        attempts: attempts?.attempts ?? [],
        comments: (comments?.comments ?? []).filter((x) => !x.deletedAt),
        links: links?.links ?? [],
        gates: activities?.gates ?? [],
        references: snap.references.filter((r) => r.cardId === cardId),
      };
    },
    async registerPush(boardId, url, token, events) {
      const r = await call('registerPushConfig', 'POST', `${b(boardId)}/push-configs`, { url, token, events });
      if (!r) throw new PipelineError(404, `board ${boardId} not found`);
      return r.configId;
    },
  };
  return client;
}
