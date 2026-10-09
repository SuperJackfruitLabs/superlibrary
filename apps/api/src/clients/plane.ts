import type { Env } from '../env';

const cache = new Map<string, { token: string; until: number }>();
export function __resetServiceTokensForTests(): void { cache.clear(); }

/**
 * Superlibrary's own token for another product (issuer contract §3.3, `POST /api/token/service`),
 * minted with the workspace org's service credential (plan P20). Cached until 30 s before expiry.
 */
export async function serviceToken(env: Env, org: string, audience: string): Promise<string> {
  const key = `${org} ${audience}`;
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.token;
  const creds = JSON.parse(env.SERVICE_CREDENTIALS || '{}') as Record<string, string>;
  const credential = creds[org];
  if (!credential) throw new Error(`no service credential for ${org}`);
  if (!env.ORG_PLANE_URL) throw new Error('ORG_PLANE_URL is not set');
  const res = await fetch(`${env.ORG_PLANE_URL}/api/token/service`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${credential}`, 'content-type': 'application/json' },
    body: JSON.stringify({ audience }),
  });
  if (!res.ok) throw new Error(`service token refused: ${res.status}`);
  const body = (await res.json()) as { access_token: string; expires_in: number };
  cache.set(key, { token: body.access_token, until: Date.now() + (body.expires_in - 30) * 1000 });
  return body.access_token;
}
