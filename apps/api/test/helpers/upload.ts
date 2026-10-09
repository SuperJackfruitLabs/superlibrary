import { SELF } from 'cloudflare:test';
import { devHeaders, planeToken } from './org-plane';

export const API = 'https://api.test';
const enc = (b: string | Uint8Array) => (typeof b === 'string' ? new TextEncoder().encode(b) : b);

export async function sha256Hex(b: Uint8Array | string): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc(b)))].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export interface UploadOpts {
  headers?: Record<string, string>;
  title?: string;
  scope?: string;
  item?: string;
  entry?: string;
  expiresAt?: string;
  override?: string;
  commit?: boolean;
  /** A station link's provenance (Task A10); only the hub acting for an agent may send it. */
  source?: unknown;
}

/** Declare, send every file, optionally override, then commit — the whole client protocol. */
export async function upload(files: Array<{ path: string; body: string | Uint8Array }>, opts: UploadOpts = {}) {
  const headers = { ...(opts.headers ?? devHeaders()), 'content-type': 'application/json' };
  const declared = await Promise.all(files.map(async (f) => ({ path: f.path, bytes: enc(f.body).length, sha256: await sha256Hex(enc(f.body)) })));
  const created = await SELF.fetch(`${API}/api/v1/uploads`, {
    method: 'POST', headers,
    body: JSON.stringify({ title: opts.title ?? 'Test upload', scope: opts.scope, item: opts.item, entry: opts.entry, expiresAt: opts.expiresAt, source: opts.source, files: declared }),
  });
  if (created.status !== 201) return { status: created.status, body: await created.json<any>(), uploadId: '' };
  const { uploadId } = await created.json<{ uploadId: string }>();
  const puts: any[] = [];
  for (const f of files) {
    const res = await SELF.fetch(`${API}/api/v1/uploads/${uploadId}/files?path=${encodeURIComponent(f.path)}`, { method: 'PUT', headers: opts.headers ?? devHeaders(), body: enc(f.body) });
    puts.push(await res.json());
    if (res.status !== 200) return { status: res.status, body: puts.at(-1), uploadId };
  }
  if (opts.commit === false) return { status: 200, body: { puts }, uploadId };
  if (opts.override) {
    await SELF.fetch(`${API}/api/v1/uploads/${uploadId}/override`, { method: 'POST', headers, body: JSON.stringify({ reason: opts.override }) });
  }
  const committed = await SELF.fetch(`${API}/api/v1/uploads/${uploadId}/commit`, { method: 'POST', headers });
  return { status: committed.status, body: await committed.json<any>(), uploadId };
}

export const HUB_SVC = 'prn_0000000000000000c0b1';
/**
 * Headers of the hub acting for the agent `who` (plan P1): the hub's service token, the agent named,
 * and the agent's own plane token minted for the hub as proof. Agents only: the hub never acts for a
 * person (operator ruling R-H1). Use inside withOrgPlane with HUB_SERVICE_PRINCIPAL = HUB_SVC.
 */
export async function hubHeaders(who: string): Promise<Record<string, string>> {
  const svc = await planeToken({ sub: HUB_SVC, principalKind: 'service' });
  const proof = await planeToken({ sub: who, principalKind: 'agent', act: { sub: HUB_SVC } });
  return { Authorization: `Bearer ${svc}`, 'X-On-Behalf-Of': who, 'X-On-Behalf-Kind': 'agent', 'X-On-Behalf-Token': proof };
}
