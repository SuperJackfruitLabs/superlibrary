import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetJwksCacheForTests, verifyJws, type JwsOptions } from '../src/auth/jws';

const ISS = 'https://accounts.test';
const AUD = 'https://api.test';
const URL_ = `${ISS}/api/auth/jwks`;
const TTL = 10 * 60 * 1000;

async function keyed(kid: string) {
  const pair = await generateKeyPair('EdDSA', { extractable: true });
  const jwk = { ...(await exportJWK(pair.publicKey)), alg: 'EdDSA', kid };
  const sign = () =>
    new SignJWT({ sub: 'prn_000000000000000000a1', jti: crypto.randomUUID() })
      .setProtectedHeader({ alg: 'EdDSA', kid })
      .setIssuer(ISS).setAudience(AUD).setIssuedAt().setExpirationTime('1h')
      .sign(pair.privateKey);
  return { jwk, sign };
}

/** A fetch that answers from a script of responses (a body, or 'down'), counting calls. */
function scripted(...steps: Array<{ keys: unknown[] } | 'down'>) {
  let n = 0;
  const fetchFn = (async () => {
    const step = steps[Math.min(n++, steps.length - 1)]!;
    if (step === 'down') return new Response('nope', { status: 503 });
    return new Response(JSON.stringify(step), { headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { fetchFn, calls: () => n };
}

const opts = (fetchFn: typeof fetch): JwsOptions => ({ issuer: ISS, jwksUrl: URL_, audience: AUD, requiredClaims: ['exp', 'iat', 'jti', 'sub'], fetch: fetchFn });

describe('the key-set cache', () => {
  beforeEach(() => {
    __resetJwksCacheForTests();
    vi.useFakeTimers({ toFake: ['Date'] });
  });
  afterEach(() => {
    vi.useRealTimers();
    __resetJwksCacheForTests();
  });

  it('a rotation: a kid only the second response has verifies, after exactly one extra fetch', async () => {
    const a = await keyed('kid-a');
    const b = await keyed('kid-b');
    const { fetchFn, calls } = scripted({ keys: [a.jwk] }, { keys: [a.jwk, b.jwk] });
    expect(await verifyJws(await a.sign(), opts(fetchFn))).not.toBeNull();
    expect(calls()).toBe(1);
    expect(await verifyJws(await b.sign(), opts(fetchFn))).not.toBeNull();
    expect(calls()).toBe(2);
  });

  it('the issuer down after the TTL: the last good set still verifies the cached kid', async () => {
    const a = await keyed('kid-a');
    const { fetchFn, calls } = scripted({ keys: [a.jwk] }, 'down');
    expect(await verifyJws(await a.sign(), opts(fetchFn))).not.toBeNull();
    vi.setSystemTime(Date.now() + TTL + 1000);
    expect(await verifyJws(await a.sign(), opts(fetchFn))).not.toBeNull();
    expect(calls()).toBe(2); // the expired set was refetched, the refetch failed, the old set served
  });

  it('a fresh set is not refetched before the TTL', async () => {
    const a = await keyed('kid-a');
    const { fetchFn, calls } = scripted({ keys: [a.jwk] });
    await verifyJws(await a.sign(), opts(fetchFn));
    vi.setSystemTime(Date.now() + TTL - 1000);
    await verifyJws(await a.sign(), opts(fetchFn));
    expect(calls()).toBe(1);
  });

  it('the issuer down with a fresh set and an unknown kid: refused', async () => {
    const a = await keyed('kid-a');
    const b = await keyed('kid-b');
    const { fetchFn, calls } = scripted({ keys: [a.jwk] }, 'down');
    expect(await verifyJws(await a.sign(), opts(fetchFn))).not.toBeNull();
    expect(await verifyJws(await b.sign(), opts(fetchFn))).toBeNull();
    expect(calls()).toBe(2);
  });
});
