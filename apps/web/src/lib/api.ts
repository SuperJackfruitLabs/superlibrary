import type { PlaneDiscovery } from './auth/org-plane';
import { withReadTimeout } from './loading';

/** The local-dev person (API DEV_AUTH, plane off). Never sent when a plane is configured. */
export const DEV_PRINCIPAL = 'prn_0000000000000000de01';
export const DEV_ORG = 'org_0000000000000000de01';

export interface ApiDeps {
  plane: () => PlaneDiscovery | null;
  token: (p: PlaneDiscovery) => Promise<string | null>;
  onUnauthorized: (sent: string | null) => void;
  dev: boolean;
  fetchFn?: typeof fetch;
}

/**
 * Every call asks for a token: a refresh happens whenever one is due, mid-upload included. A read
 * (GET) unanswered after 20 s is aborted (loading.ts), so no screen waits forever.
 */
export function createApi(deps: ApiDeps) {
  return async function api(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    const plane = deps.plane();
    let sent: string | null = null;
    if (plane) {
      sent = await deps.token(plane);
      if (sent) headers.set('Authorization', `Bearer ${sent}`);
    } else if (deps.dev) {
      headers.set('X-Dev-Principal', DEV_PRINCIPAL);
      headers.set('X-Dev-Org', DEV_ORG);
    }
    const res = await withReadTimeout(deps.fetchFn ?? ((i, o) => fetch(i, o)))(path, { ...init, headers });
    if (res.status === 401) deps.onUnauthorized(sent);
    return res;
  };
}

export interface Me { principalId: string; org: string; workspaceId: string; role: 'owner' | 'member' }

/** `/api/v1/me`'s body, or null when it is anything else (an HTML page from a missing route, say). */
export function parseMe(body: unknown): Me | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  const str = (k: string) => typeof b[k] === 'string' && b[k] !== '';
  if (!str('principalId') || !str('org') || !str('workspaceId') || (b.role !== 'owner' && b.role !== 'member')) return null;
  return { principalId: b.principalId as string, org: b.org as string, workspaceId: b.workspaceId as string, role: b.role };
}
