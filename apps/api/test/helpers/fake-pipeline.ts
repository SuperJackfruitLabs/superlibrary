// apps/api/test/helpers/fake-pipeline.ts
import { env } from 'cloudflare:test';
import type { CardBundle, PipelineCard } from '../../src/sources/superpipeline';

export interface FakeBoard { id: string; name: string; cards: Map<string, Omit<CardBundle, 'references'> & { references: CardBundle['references'] }> }
export interface FakeState { boards: Map<string, FakeBoard>; pushConfigs: Array<{ boardId: string; url: string; token: string; events: string[] }>; calls: string[] }
export const ORG = 'org_00000000000000000a01';

export function card(id: string, over: Partial<PipelineCard> = {}): PipelineCard {
  return { id, title: `Card ${id}`, spec: { goal: 'Do the thing' }, state: 'working', currentStageKey: 'build', archivedAt: null, needsHuman: null, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z', ...over };
}

/** Serves Superpipeline's service routes and the plane's token exchange from `state`; restore with the returned function. */
export function fakePipeline(state: FakeState): () => void {
  const bag = env as unknown as Record<string, unknown>;
  bag.ORG_PLANE_URL = 'https://accounts.test';
  bag.SERVICE_CREDENTIALS = JSON.stringify({ [ORG]: 'svc_lib:secret' });
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input as RequestInfo, init);
    const u = new URL(req.url);
    state.calls.push(`${req.method} ${u.pathname}`);
    if (u.origin === 'https://accounts.test' && u.pathname === '/api/token/service') return Response.json({ access_token: 'svc-token', expires_in: 300 });
    if (u.origin !== 'https://pipeline.test') return real(input as RequestInfo, init);
    if (req.headers.get('Authorization') !== 'Bearer svc-token') return new Response(null, { status: 401 });
    const m = u.pathname.match(/^\/v1\/boards(?:\/([^/]+)(?:\/cards\/([^/]+)(?:\/(\w+))?|\/(push-configs))?)?$/);
    if (!m) return new Response(null, { status: 404 });
    const [, b, c, sub, push] = m;
    if (!b) return Response.json({ boards: [...state.boards.values()].map((x) => ({ id: x.id, name: x.name })) });
    const board = state.boards.get(b);
    if (!board) return new Response(null, { status: 404 });
    if (push) {
      const body = await req.json() as { url: string; token: string; events: string[] };
      state.pushConfigs.push({ boardId: b, ...body });
      return Response.json({ configId: `push_${state.pushConfigs.length}` }, { status: 201 });
    }
    if (!c) return Response.json({ boardId: b, name: board.name, cards: [...board.cards.values()].map((x) => x.card), references: [...board.cards.values()].flatMap((x) => x.references) });
    const bundle = board.cards.get(c);
    if (!bundle) return Response.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
    if (!sub) return Response.json({ card: bundle.card });
    if (sub === 'attempts') return Response.json({ attempts: bundle.attempts });
    if (sub === 'comments') return Response.json({ comments: bundle.comments });
    if (sub === 'links') return Response.json({ links: bundle.links, externalLinks: [] });
    if (sub === 'activities') return Response.json({ activities: [], handoff: null, gates: bundle.gates });
    return new Response(null, { status: 404 });
  }) as typeof fetch;
  return () => { globalThis.fetch = real; bag.ORG_PLANE_URL = ''; bag.SERVICE_CREDENTIALS = ''; };
}
