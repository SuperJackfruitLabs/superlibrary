import type { PlaneDiscovery } from './auth/org-plane';

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

/** Every call asks for a token: a refresh happens whenever one is due, mid-upload included. */
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
    const res = await (deps.fetchFn ?? fetch)(path, { ...init, headers });
    if (res.status === 401) deps.onUnauthorized(sent);
    return res;
  };
}
