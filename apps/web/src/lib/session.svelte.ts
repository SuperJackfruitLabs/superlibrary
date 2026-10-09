import { discardToken, discoverPlane, hasTokens, planeAccessToken, type PlaneDiscovery } from './auth/org-plane';
import { createApi } from './api';

export interface Me { principalId: string; org: string; workspaceId: string; role: 'owner' | 'member' }

let plane: PlaneDiscovery | null = null;
export const session = $state<{ me: Me | null; notEnabled: { org: string } | null }>({ me: null, notEnabled: null });

export const currentPlane = () => plane;
export const devMode = () => import.meta.env.DEV && plane === null;

/** A 401 for `sent` (null: none sent). Not a sign-out: the guard re-authorizes (console #698). */
export function planeSessionLost(sent: string | null): void {
  discardToken(sent);
  if (!hasTokens()) session.me = null;
}

export const api = createApi({ plane: currentPlane, token: (p) => planeAccessToken(p), onUnauthorized: planeSessionLost, dev: import.meta.env.DEV });

export async function refreshMe(): Promise<void> {
  if (plane && !hasTokens()) { session.me = null; return; }
  const res = await api('/api/v1/me');
  if (res.ok) {
    session.me = (await res.json()) as Me;
    session.notEnabled = null;
    return;
  }
  session.me = null;
  if (res.status === 403) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; org?: string };
    if (body.error === 'product_not_enabled' && body.org) session.notEnabled = { org: body.org };
  }
}

export async function initSession(): Promise<void> {
  plane = await discoverPlane(window.location.origin);
  await refreshMe();
}

/** Issuer contract §2: a browser product links the person to the plane's enable page. */
export function enableUrl(org: string): string | null {
  return plane ? `${plane.url}/enable?product=superlibrary&workspace=${encodeURIComponent(org)}&return=${encodeURIComponent(window.location.href)}` : null;
}
