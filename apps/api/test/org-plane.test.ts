import { createJwksCache } from '@superjackfruitlabs/treaty-ecosystem-identity';
import vectors from '@superjackfruitlabs/treaty-ecosystem-identity/token_vectors.json';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import { describe, expect, it } from 'vitest';
import { checkToken } from '../src/auth/org-plane';

interface Vector {
  name: string;
  token: string;
  verifier: { issuer: string; audience: string; product: string; now: number };
  expect: { ok: true; claims: Record<string, unknown> } | { ok: false; code: string };
}
const cases = vectors.cases as unknown as Vector[];

/** A fetch that answers from a script of responses (a body, or 'down'), counting calls. */
function scripted(...steps: Array<{ keys: unknown[] } | 'down'>) {
  let n = 0;
  const fetchFn = (async () => {
    const step = steps[Math.min(n++, steps.length - 1)];
    if (step === 'down') return new Response('nope', { status: 503 });
    return new Response(JSON.stringify(step), { headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { fetchFn, calls: () => n };
}

describe("treaty's token vectors, through SuperLibrary's adapter", () => {
  it('holds the 43 published cases', () => {
    expect(cases.length).toBe(43);
  });

  for (const c of cases) {
    it(`${c.name}: ${c.expect.ok ? 'the claims' : c.expect.code}`, async () => {
      const keys = createJwksCache({ url: 'https://issuer.treaty.test/jwks', fetch: scripted({ keys: vectors.jwks.keys }).fetchFn });
      const r = await checkToken(c.token, { keys, ...c.verifier });
      // The answer in the corpus's own shape: the claims, or the refusal code alone.
      expect(r.ok ? { ok: true, claims: r.claims } : { ok: false, code: r.code }).toEqual(c.expect);
    });
  }
});

const ISS = 'https://accounts.test';
const AUD = 'https://api.test';
const ORG = 'org_00000000000000000a01';

async function keyed(kid: string) {
  const pair = await generateKeyPair('EdDSA', { extractable: true });
  const jwk = { ...(await exportJWK(pair.publicKey)), alg: 'EdDSA', kid };
  const sign = (over: Record<string, unknown> = {}, life = '5m', header: Record<string, unknown> = { alg: 'EdDSA', kid }) =>
    new SignJWT({
      sub: 'prn_000000000000000000a1', principalKind: 'human', org: ORG, ent: ['superlibrary'], mayDispatch: [], mayGrantReach: false,
      jti: crypto.randomUUID(), ...over,
    })
      .setProtectedHeader(header as { alg: string })
      .setIssuer(ISS).setAudience(AUD).setIssuedAt().setExpirationTime(life)
      .sign(pair.privateKey);
  return { jwk, sign };
}
const check = (token: string, fetchFn: typeof fetch) =>
  checkToken(token, { keys: createJwksCache({ url: `${ISS}/jwks`, fetch: fetchFn }), issuer: ISS, audience: AUD, product: 'superlibrary' });

describe('the adapter', () => {
  it('a token for another product comes back refused with its claims, so the caller can answer 403 with its org', async () => {
    const a = await keyed('kid-a');
    const r = await check(await a.sign({ ent: ['superpipeline'] }), scripted({ keys: [a.jwk] }).fetchFn);
    expect(r).toMatchObject({ ok: false, code: 'product_not_enabled', claims: { org: ORG, ent: ['superpipeline'] } });
  });

  it('a token for another product with a second fault is refused for that fault, never as product_not_enabled', async () => {
    const a = await keyed('kid-a');
    const { fetchFn } = scripted({ keys: [a.jwk] });
    const other = { ent: ['superpipeline'] };
    expect(await check(await a.sign(other, '1h'), fetchFn)).toEqual({ ok: false, code: 'lifetime_too_long' });
    expect(await check(await a.sign({ ...other, sub: 'user_1' }), fetchFn)).toEqual({ ok: false, code: 'bad_claim' });
    expect(await check(await a.sign({ ...other, mayDispatch: undefined }), fetchFn)).toEqual({ ok: false, code: 'missing_claim' });
    const b = await keyed('kid-a'); // the same kid, another key: a forgery
    expect(await check(await b.sign(other), fetchFn)).toEqual({ ok: false, code: 'bad_signature' });
  });

  it('another algorithm, a missing kid or a malformed header never fetches keys', async () => {
    const a = await keyed('kid-a');
    const { fetchFn, calls } = scripted({ keys: [a.jwk] });
    expect(await check(await a.sign({}, '5m', { alg: 'EdDSA' }), fetchFn)).toEqual({ ok: false, code: 'missing_kid' });
    const [, body, sig] = (await a.sign()).split('.');
    const hs = `${btoa(JSON.stringify({ alg: 'HS256', kid: 'kid-a' })).replace(/=+$/, '')}.${body}.${sig}`;
    expect(await check(hs, fetchFn)).toEqual({ ok: false, code: 'bad_algorithm' });
    expect(await check(`%%%.${body}.${sig}`, fetchFn)).toEqual({ ok: false, code: 'malformed' });
    expect(await check('not-a-jwt', fetchFn)).toEqual({ ok: false, code: 'malformed' });
    expect(calls()).toBe(0);
  });

  it('a rotation: a kid only the second response has verifies, after exactly one extra fetch', async () => {
    const a = await keyed('kid-a');
    const b = await keyed('kid-b');
    const { fetchFn, calls } = scripted({ keys: [a.jwk] }, { keys: [a.jwk, b.jwk] });
    const keys = createJwksCache({ url: `${ISS}/jwks`, fetch: fetchFn });
    const o = { keys, issuer: ISS, audience: AUD, product: 'superlibrary' };
    expect((await checkToken(await a.sign(), o)).ok).toBe(true);
    expect(calls()).toBe(1);
    expect((await checkToken(await b.sign(), o)).ok).toBe(true);
    expect(calls()).toBe(2);
    expect((await checkToken(await a.sign(), o)).ok).toBe(true);
    expect(calls()).toBe(2);
  });

  it('an issuer that never answered: refused as an unknown key, not thrown', async () => {
    const a = await keyed('kid-a');
    expect(await check(await a.sign(), scripted('down').fetchFn)).toEqual({ ok: false, code: 'unknown_key' });
  });
});
