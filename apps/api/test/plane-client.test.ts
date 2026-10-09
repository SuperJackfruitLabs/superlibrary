import { env } from 'cloudflare:test';
import { afterEach, describe, expect, it } from 'vitest';
import { __resetServiceTokensForTests, serviceToken } from '../src/clients/plane';

const bag = env as unknown as Record<string, unknown>;
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; __resetServiceTokensForTests(); bag.SERVICE_CREDENTIALS = ''; bag.ORG_PLANE_URL = ''; });

describe('serviceToken', () => {
  it('exchanges the org credential once and reuses the token until near expiry', async () => {
    bag.ORG_PLANE_URL = 'https://accounts.test';
    bag.SERVICE_CREDENTIALS = JSON.stringify({ org_00000000000000000a01: 'svc_x:secret' });
    const seen: Array<{ url: string; auth: string | null; body: string }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push({ url: String(input), auth: new Headers(init?.headers).get('Authorization'), body: String(init?.body) });
      return Response.json({ access_token: 'tok-1', token_type: 'Bearer', expires_in: 300 });
    }) as typeof fetch;
    expect(await serviceToken(env, 'org_00000000000000000a01', 'https://app.superpipeline.dev')).toBe('tok-1');
    expect(await serviceToken(env, 'org_00000000000000000a01', 'https://app.superpipeline.dev')).toBe('tok-1');
    expect(seen).toEqual([{ url: 'https://accounts.test/api/token/service', auth: 'Bearer svc_x:secret', body: JSON.stringify({ audience: 'https://app.superpipeline.dev' }) }]);
  });
  it('refuses a workspace it holds no credential for', async () => {
    bag.ORG_PLANE_URL = 'https://accounts.test';
    bag.SERVICE_CREDENTIALS = '{}';
    await expect(serviceToken(env, 'org_00000000000000000a01', 'https://x.test')).rejects.toThrow(/no service credential/);
  });
});
