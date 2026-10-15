import { discardToken, discoverPlane, hasTokens, planeAccessToken, type PlaneDiscovery } from './auth/org-plane';
import { createApi, parseMe, type Me } from './api';
import { withReadTimeout } from './loading';

export type { Me };

let plane: PlaneDiscovery | null = null;
export const session = $state<{ me: Me | null; notEnabled: { org: string } | null }>({ me: null, notEnabled: null });

/** The boot screen's failure, in words: never a raw code or "(HTTP n)" (catch-up S4). */
export const UNREACHABLE_BOOT = "Couldn't reach Superlibrary. Try again in a moment.";

export const currentPlane = () => plane;
export const devMode = () => import.meta.env.DEV && plane === null;

/** A 401 for `sent` (null: none sent). Not a sign-out: the guard re-authorizes (SuperJackfruitLabs/agentpod issue 698). */
export function planeSessionLost(sent: string | null): void {
  discardToken(sent);
  if (!hasTokens()) session.me = null;
}

export const api = createApi({ plane: currentPlane, token: (p) => planeAccessToken(p), onUnauthorized: planeSessionLost, dev: import.meta.env.DEV });

/**
 * Who is signed in. Resolves with `session.me` set, or null after a 401 (the guard signs in again)
 * or with `session.notEnabled` set; rejects, with a sentence to show, on anything else, so the
 * layout can offer a retry instead of waiting forever.
 */
export async function refreshMe(): Promise<void> {
  if (plane && !hasTokens()) { session.me = null; return; }
  let res: Response;
  try { res = await api('/api/v1/me'); } catch { session.me = null; throw new Error(UNREACHABLE_BOOT); }
  if (res.ok) {
    const me = parseMe(await res.json().catch(() => null));
    if (!me) { session.me = null; throw new Error('The library service answered, but not as expected.'); }
    session.me = me;
    session.notEnabled = null;
    return;
  }
  session.me = null;
  if (res.status === 401) return;
  if (res.status === 403) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; org?: string };
    if (body.error === 'product_not_enabled' && body.org) { session.notEnabled = { org: body.org }; return; }
    throw new Error('This account cannot use Superlibrary.');
  }
  throw new Error(UNREACHABLE_BOOT);
}

let discovering: Promise<PlaneDiscovery | null> | null = null;

export async function initSession(): Promise<void> {
  // Discovery that never answers counts as no plane (discoverPlane catches the abort).
  discovering = discoverPlane(window.location.origin, withReadTimeout((i, o) => fetch(i, o)));
  plane = await discovering;
  await refreshMe();
}

/**
 * The sign-in service, once discovery has answered. /login renders before the session has started
 * (it is outside the boot gate), so its button waits for this rather than reading a plane not yet found.
 */
export async function planeReady(): Promise<PlaneDiscovery | null> {
  if (discovering) await discovering;
  return plane;
}

/** Issuer contract §2: a browser product links the person to the plane's enable page. */
export function enableUrl(org: string): string | null {
  return plane ? `${plane.url}/enable?product=superlibrary&workspace=${encodeURIComponent(org)}&return=${encodeURIComponent(window.location.href)}` : null;
}
