import type { Env } from '../env';
import { serviceToken } from './plane';

export interface HubStation { id: string; key: string; owner: string }
export class HubUnavailable extends Error {}

/** The hub's own station id shape (Task 25H). Anything else is no station the hub holds, and never reaches its URL. */
const STATION = /^[A-Za-z0-9_-]{1,100}$/;

/**
 * Gap S1: the hub's own record of a station in this workspace, read with Superlibrary's service token
 * for the workspace's org (Task 25H; the reader allowlist the roster read uses). Null when the hub does
 * not know the station there. Anything else (network, 5xx, 401/403, a malformed answer) throws: no
 * answer is not an answer.
 */
export async function hubStation(env: Env, org: string, stationId: string): Promise<HubStation | null> {
  if (!STATION.test(stationId)) return null;
  let res: Response;
  try {
    const token = await serviceToken(env, org, env.HUB_AUDIENCE!);
    res = await fetch(`${env.HUB_URL}/api/bridge/stations/${encodeURIComponent(stationId)}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(3000) });
  } catch (e) {
    throw new HubUnavailable(e instanceof Error ? e.message : String(e));
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new HubUnavailable(`hub station ${res.status}`);
  const b = (await res.json().catch(() => null)) as Partial<HubStation> | null;
  if (!b || b.id !== stationId || typeof b.key !== 'string' || typeof b.owner !== 'string') throw new HubUnavailable('hub station answer malformed');
  return { id: b.id, key: b.key, owner: b.owner };
}
