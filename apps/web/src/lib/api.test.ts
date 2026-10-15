import { describe, expect, it, vi } from 'vitest';
import { DEV_ORG, DEV_PRINCIPAL, createApi } from './api';

const PLANE = { issuer: 'https://accounts.test', url: 'https://accounts.test', audience: 'https://app.test' };
const ok = () => new Response('{}', { status: 200 });

describe('createApi', () => {
  it('asks for a token on every request, so a long upload outlives a 5-minute token', async () => {
    let n = 0;
    const token = vi.fn(async () => `t${++n}`);
    const seen: string[] = [];
    const api = createApi({ plane: () => PLANE, token, onUnauthorized: () => {}, dev: false, fetchFn: (async (_u: string, init: RequestInit) => { seen.push(new Headers(init.headers).get('authorization')!); return ok(); }) as never });
    await api('/api/v1/me');
    await api('/api/v1/me');
    expect(token).toHaveBeenCalledTimes(2);
    expect(seen).toEqual(['Bearer t1', 'Bearer t2']);
  });

  it('a 401 reports the token it sent — not a sign-out (the AgentPod console, SuperJackfruitLabs/agentpod#698)', async () => {
    const onUnauthorized = vi.fn();
    const api = createApi({ plane: () => PLANE, token: async () => 'sent-token', onUnauthorized, dev: false, fetchFn: (async () => new Response('{}', { status: 401 })) as never });
    expect((await api('/api/v1/me')).status).toBe(401);
    expect(onUnauthorized).toHaveBeenCalledWith('sent-token');
  });

  it('sends the dev headers only in dev with no plane, never alongside a plane', async () => {
    const heads: Headers[] = [];
    const fetchFn = (async (_u: string, init: RequestInit) => { heads.push(new Headers(init.headers)); return ok(); }) as never;
    await createApi({ plane: () => null, token: async () => null, onUnauthorized: () => {}, dev: true, fetchFn })('/x');
    await createApi({ plane: () => PLANE, token: async () => 't', onUnauthorized: () => {}, dev: true, fetchFn })('/x');
    await createApi({ plane: () => null, token: async () => null, onUnauthorized: () => {}, dev: false, fetchFn })('/x');
    expect([heads[0]!.get('x-dev-principal'), heads[0]!.get('x-dev-org')]).toEqual([DEV_PRINCIPAL, DEV_ORG]);
    expect(heads[1]!.get('x-dev-principal')).toBeNull();
    expect(heads[2]!.get('x-dev-principal')).toBeNull();
  });
});

describe('createApi deadlines', () => {
  it('a read that never answers is aborted (catch-up S1/S2), a write is not', async () => {
    const signals: (AbortSignal | null | undefined)[] = [];
    const fetchFn = (async (_u: string, init: RequestInit) => { signals.push(init.signal); return ok(); }) as never;
    const api = createApi({ plane: () => null, token: async () => null, onUnauthorized: () => {}, dev: true, fetchFn });
    await api('/api/v1/me');
    await api('/api/v1/collections', { method: 'POST', body: '{}' });
    expect(signals[0]).toBeInstanceOf(AbortSignal);
    expect(signals[1]).toBeUndefined();
  });
});
