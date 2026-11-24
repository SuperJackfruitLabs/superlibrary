// apps/api/test/helpers/fake-pipeline.ts
import { env } from 'cloudflare:test';
import type { CardBundle, PipelineAttempt, PipelineCard, PipelineComment, PipelineGate, PipelineLink, PipelineReference } from '../../src/sources/superpipeline';

export interface FakeBoard { id: string; name: string; cards: Map<string, Omit<CardBundle, 'references'> & { references: CardBundle['references'] }> }
export interface FakeState {
  boards: Map<string, FakeBoard>; pushConfigs: Array<{ boardId: string; url: string; token: string; events: string[] }>; calls: string[];
  /** Any `/v1/boards/<id>…` path of that board answers this status (0: the request itself fails). */
  boardStatus?: Map<string, number>;
  /** The `/v1/boards` list answers this status. */
  listStatus?: number;
  /** Rewrites an answer before it is sent: a SuperPipeline whose answers drift from the contract. */
  answer?: (path: string, body: unknown) => unknown;
}
export const ORG = 'org_00000000000000000a01';

export function card(id: string, over: Partial<PipelineCard> = {}): PipelineCard {
  return { id, title: `Card ${id}`, spec: { goal: 'Do the thing' }, state: 'working', currentStageKey: 'build', archivedAt: null, needsHuman: null, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z', ...over };
}

/*
 * Tests write the fields SuperLibrary reads; SuperPipeline answers with whole views. These fill in
 * the rest as treaty's board-read.v1 requires, so every answer below is one the contract holds and
 * the client's validation passes on real shapes, not on a fake's shorthand.
 */
const T = '2026-10-01T00:00:00.000Z';
const wireCard = (c: PipelineCard) => ({
  ownerUserId: 'usr_0000000000000001', queuedBy: null, queuedByAgentId: null, queuedGrant: null, labels: [], projectId: null, milestoneId: null,
  dueAt: null, delegateAgentId: null, lastAgentId: null, queuedGrantOwner: null, stageSince: c.createdAt, currentRunId: null, priority: 0,
  contextId: `ctx_${c.id}`, stateSince: c.createdAt, costUsd: 0, overBudget: false, attemptCount: 0, parentCardId: null, openChildCount: 0,
  costUsdRollup: 0, blockedBy: [],
  ...c, currentStageKey: c.currentStageKey ?? 'build', ...(c.needsHuman ? { needsHuman: c.needsHuman } : { needsHuman: undefined }),
});
const wireAttempt = (cardId: string, a: PipelineAttempt) => ({
  cardId, costUsd: 0, model: null, profileKey: null, completion: null, ...a, agentId: a.agentId ?? 'agt_0000000000000001', startedAt: a.startedAt ?? T,
});
const wireComment = (cardId: string, c: PipelineComment) => ({ cardId, ...c });
const wireLink = (l: PipelineLink) => ({ createdAt: T, createdBy: null, enforced: l.kind === 'blocks' || l.kind === 'parent', ...l });
const wireGate = (g: PipelineGate) => ({ options: [], producedBy: 'agt_0000000000000001', createdAt: T, decidedBy: null, comment: null, references: [], ...g });
const wireReference = (r: PipelineReference, i: number) => ({
  id: `ref_${i}`, subtitle: null, sourceType: 'url', metadata: null, syncState: 'synced', lastSyncedAt: null, addedBy: 'user', runId: null, createdAt: T, updatedAt: null, ...r,
});
const snapshotOf = (b: FakeBoard) => ({
  boardId: b.id, tenantId: null, name: b.name, stages: [], gates: [], elicitations: [],
  cards: [...b.cards.values()].map((x) => wireCard(x.card)),
  references: [...b.cards.values()].flatMap((x) => x.references).map(wireReference),
  usage: { totalCostUsd: 0, estimatedCostUsd: 0, budgetUsd: null, cardUsdCap: null, overBudget: false },
  github: { issueTrigger: false, webhookConfigured: false, webhookUrl: `https://pipeline.test/v1/boards/${b.id}/webhooks/github`, triggerGrantCount: null },
  stale: { enabled: false, afterHours: 48 },
});

/** Serves Superpipeline's service routes and the plane's token exchange from `state`; restore with the returned function. */
export function fakePipeline(state: FakeState): () => void {
  const bag = env as unknown as Record<string, unknown>;
  bag.ORG_PLANE_URL = 'https://accounts.test';
  bag.SERVICE_CREDENTIALS = JSON.stringify({ [ORG]: 'svc_lib:secret' });
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const u = new URL(req.url);
    state.calls.push(`${req.method} ${u.pathname}`);
    if (u.origin === 'https://accounts.test' && u.pathname === '/api/token/service') return Response.json({ access_token: 'svc-token', expires_in: 300 });
    if (u.origin !== 'https://pipeline.test') return real(input, init);
    if (req.headers.get('Authorization') !== 'Bearer svc-token') return new Response(null, { status: 401 });
    const reply = (body: unknown, opts?: ResponseInit) => Response.json(state.answer ? state.answer(u.pathname, body) : body, opts);
    const m = u.pathname.match(/^\/v1\/boards(?:\/([^/]+)(?:\/cards\/([^/]+)(?:\/(\w+))?|\/(push-configs))?)?$/);
    if (!m) return new Response(null, { status: 404 });
    const [, b, c, sub, push] = m;
    if (!b && state.listStatus !== undefined) return new Response(null, { status: state.listStatus });
    const forced = b ? state.boardStatus?.get(b) : undefined;
    if (forced === 0) throw new TypeError('fetch failed');
    if (forced !== undefined) return new Response(null, { status: forced });
    if (!b) return reply({ boards: [...state.boards.values()].map((x) => ({ id: x.id, name: x.name, updatedAt: null })) });
    const board = state.boards.get(b);
    if (!board) return new Response(null, { status: 404 });
    if (push) {
      const body = await req.json() as { url: string; token: string; events: string[] };
      state.pushConfigs.push({ boardId: b, ...body });
      return reply({ configId: `push_${state.pushConfigs.length.toString(16).padStart(16, '0')}` }, { status: 201 });
    }
    if (!c) return reply(snapshotOf(board));
    const bundle = board.cards.get(c);
    if (!bundle) return reply({ error: { code: 'NOT_FOUND' } }, { status: 404 });
    if (!sub) return reply({ card: wireCard(bundle.card) });
    if (sub === 'attempts') return reply({ attempts: bundle.attempts.map((a) => wireAttempt(c, a)) });
    if (sub === 'comments') return reply({ comments: bundle.comments.map((x) => wireComment(c, x)) });
    if (sub === 'links') return reply({ links: bundle.links.map(wireLink), externalLinks: [] });
    if (sub === 'activities') return reply({ activities: [], handoff: null, gates: bundle.gates.map(wireGate) });
    return new Response(null, { status: 404 });
  });
  return () => { globalThis.fetch = real; bag.ORG_PLANE_URL = ''; bag.SERVICE_CREDENTIALS = ''; };
}
