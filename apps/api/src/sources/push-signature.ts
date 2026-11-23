import { SIGNATURE_HEADER, verifyDelivery } from '@superjackfruitlabs/treaty-cloudevents';

/** SuperPipeline's old push signature, still accepted until every receiver verifies treaty's. */
export const LEGACY_SIGNATURE_HEADER = 'X-Superpipeline-Signature';

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function legacySignature(secret: string, body: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return 'sha256=' + [...new Uint8Array(await crypto.subtle.sign('HMAC', key, body))].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/**
 * True when a push delivery is signed with the push config's `secret`.
 *
 * With `x-treaty-signature` (treaty's delivery contract), it alone decides: `t.id.body`, the id
 * from `ce-id`, within 300 s of `nowMs`. A failing treaty signature is never rescued by the old
 * header. Without it, the old `X-Superpipeline-Signature: sha256=<HMAC of the body>` is checked,
 * until SuperPipeline stops sending it.
 */
export async function verifyPush(headers: Headers, body: Uint8Array, secret: string, nowMs = Date.now()): Promise<boolean> {
  const treaty = headers.get(SIGNATURE_HEADER);
  if (treaty !== null) {
    try {
      await verifyDelivery(secret, treaty, headers.get('ce-id') ?? '', body, { nowMs });
      return true;
    } catch {
      return false;
    }
  }
  const legacy = headers.get(LEGACY_SIGNATURE_HEADER);
  if (legacy === null) return false;
  return timingSafeEqual(legacy, await legacySignature(secret, body));
}
