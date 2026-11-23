import { SIGNATURE_HEADER, verifyDelivery } from '@superjackfruitlabs/treaty-cloudevents';

/**
 * True when a push delivery is signed with the push config's `secret`.
 *
 * Only `x-treaty-signature` (treaty's delivery contract) counts: `t.id.body`, the id from `ce-id`,
 * within 300 s of `nowMs`. A delivery without it is refused, whatever else it carries; SuperPipeline's
 * old `X-Superpipeline-Signature` is no longer read.
 */
export async function verifyPush(headers: Headers, body: Uint8Array, secret: string, nowMs = Date.now()): Promise<boolean> {
  const treaty = headers.get(SIGNATURE_HEADER);
  if (treaty === null) return false;
  try {
    await verifyDelivery(secret, treaty, headers.get('ce-id') ?? '', body, { nowMs });
    return true;
  } catch {
    return false;
  }
}
