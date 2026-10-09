import { env } from 'cloudflare:test';
import { __resetServiceTokensForTests } from '../../src/clients/plane';
import { ORG } from './org-plane';

/**
 * The hub's station-owner read (Task 25H) and the plane's service token; restore with the returned function.
 * `down`: the hub answers 503. `unreachable`: the request itself fails (network, timeout).
 */
export function fakeHub(stations: Record<string, { key: string; owner: string }> | 'down' | 'unreachable', seen: string[] = []): () => void {
  const bag = env as unknown as Record<string, unknown>;
  bag.ORG_PLANE_URL = 'https://accounts.test';
  bag.SERVICE_CREDENTIALS = JSON.stringify({ [ORG]: 'svc_lib:secret' });
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = new URL(input instanceof Request ? input.url : String(input));
    seen.push(`${u.origin}${u.pathname}`);
    if (u.origin === 'https://accounts.test' && u.pathname === '/api/token/service') return Response.json({ access_token: 'svc-token', expires_in: 300 });
    if (u.origin !== 'https://hub.test') return real(input as RequestInfo, init);
    if (stations === 'unreachable') throw new TypeError('fetch failed');
    if (stations === 'down') return new Response(null, { status: 503 });
    const m = /^\/api\/bridge\/stations\/([^/]+)$/.exec(u.pathname);
    const id = m ? decodeURIComponent(m[1]!) : '';
    const s = stations[id];
    return s ? Response.json({ id, key: s.key, owner: s.owner }) : Response.json({ error: 'not found' }, { status: 404 });
  }) as typeof fetch;
  return () => { globalThis.fetch = real; bag.ORG_PLANE_URL = ''; bag.SERVICE_CREDENTIALS = ''; __resetServiceTokensForTests(); };
}
