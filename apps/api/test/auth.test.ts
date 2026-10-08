import { SELF, env } from 'cloudflare:test';
import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { AGENT, APP_AUD, HUMAN, HUMAN_2, ORG, OTHER_ORG, PLANE, KID, devHeaders, planeKeys, planeToken, withOrgPlane } from './helpers/org-plane';

const me = (headers: Record<string, string>) => SELF.fetch(`${APP_AUD}/api/v1/me`, { headers });
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('the organization plane, offline', () => {
  it('a valid token resolves the person, and verification makes no network call once the key set is warm', async () => {
    await withOrgPlane(async (calls) => {
      const res = await me(bearer(await planeToken()));
      expect(res.status).toBe(200);
      const body = await res.json<{ principalId: string; org: string; role: string; workspaceId: string }>();
      expect(body).toMatchObject({ principalId: HUMAN, org: ORG, role: 'owner' });
      expect(body.workspaceId).toMatch(/^wsp_[0-9a-f]{16}$/);
      const before = calls.length;
      expect((await me(bearer(await planeToken()))).status).toBe(200);
      expect(calls.length).toBe(before);
    });
  });

  it('refuses: wrong issuer, wrong audience, expired, unknown kid, not a JWT, no token', async () => {
    await withOrgPlane(async () => {
      for (const t of [
        await planeToken({}, { iss: 'https://evil.test' }),
        await planeToken({}, { aud: 'https://app.superpipeline.dev' }),
        await planeToken({}, { exp: '-1m' }),
        await planeToken({}, { kid: 'other' }),
        'not-a-jwt',
      ]) {
        const res = await me(bearer(t));
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ error: 'sign_in_required' });
      }
      expect((await me({})).status).toBe(401);
    });
  });

  it('refuses a token without jti or without iat', async () => {
    await withOrgPlane(async () => {
      expect((await me(bearer(await planeToken({ jti: undefined })))).status).toBe(401);
      const { privateKey } = await planeKeys();
      const noIat = await new SignJWT({ sub: HUMAN, principalKind: 'human', org: ORG, ent: ['superlibrary'], jti: 'x' })
        .setProtectedHeader({ alg: 'EdDSA', kid: KID }).setIssuer(PLANE).setAudience(APP_AUD).setExpirationTime('5m').sign(privateKey);
      expect((await me(bearer(noIat))).status).toBe(401);
    });
  });

  it('a 401 points the caller at the protected-resource metadata', async () => {
    await withOrgPlane(async () => {
      const res = await me({});
      expect(res.status).toBe(401);
      expect(res.headers.get('WWW-Authenticate')).toBe(`Bearer resource_metadata="${APP_AUD}/.well-known/oauth-protected-resource"`);
    });
  });

  it('a workspace without the entitlement gets 403 product_not_enabled with its org', async () => {
    await withOrgPlane(async () => {
      const res = await me(bearer(await planeToken({ ent: ['superpipeline'] })));
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: 'product_not_enabled', org: ORG });
    });
  });

  it('an agent or service token is refused in phase 1, by name', async () => {
    await withOrgPlane(async () => {
      for (const kind of ['agent', 'service']) {
        const res = await me(bearer(await planeToken({ sub: AGENT, principalKind: kind, scope: 'library:read' })));
        expect(res.status).toBe(403);
        expect(await res.json()).toMatchObject({ error: 'principal_not_supported' });
      }
    });
  });

  it('a malformed sub or org is refused', async () => {
    await withOrgPlane(async () => {
      expect((await me(bearer(await planeToken({ sub: 'user_1' })))).status).toBe(401);
      expect((await me(bearer(await planeToken({ org: 'tenant_1' })))).status).toBe(401);
    });
  });

  it('the second person in a workspace is a member; another org is another workspace', async () => {
    await withOrgPlane(async () => {
      const a = await (await me(bearer(await planeToken({ org: 'org_00000000000000000c03' })))).json<{ workspaceId: string; role: string }>();
      const b = await (await me(bearer(await planeToken({ sub: HUMAN_2, org: 'org_00000000000000000c03' })))).json<{ workspaceId: string; role: string }>();
      const c = await (await me(bearer(await planeToken({ org: OTHER_ORG })))).json<{ workspaceId: string }>();
      expect(a.role).toBe('owner');
      expect(b).toMatchObject({ workspaceId: a.workspaceId, role: 'member' });
      expect(c.workspaceId).not.toBe(a.workspaceId);
    });
  });

  it('concurrent first sight makes one workspace and one owner', async () => {
    await withOrgPlane(async () => {
      const org = 'org_00000000000000000d04';
      const tokens = await Promise.all([HUMAN, HUMAN, HUMAN_2, HUMAN_2].map((sub) => planeToken({ sub, org })));
      const results = await Promise.all(tokens.map((t) => me(bearer(t)).then((r) => r.json<{ workspaceId: string }>())));
      expect(new Set(results.map((r) => r.workspaceId)).size).toBe(1);
      const owners = await env.DB.prepare(`SELECT COUNT(*) AS n FROM members m JOIN workspaces w ON w.id = m.workspace_id WHERE w.external_id = ? AND m.role = 'owner'`).bind(org).first<{ n: number }>();
      expect(owners?.n).toBe(1);
    });
  });

  it('serves protected-resource metadata naming the plane, for suli and the web app to discover', async () => {
    await withOrgPlane(async () => {
      const res = await SELF.fetch(`${APP_AUD}/.well-known/oauth-protected-resource`);
      expect(await res.json()).toEqual({
        resource: APP_AUD, authorization_servers: [PLANE], bearer_methods_supported: ['header'],
        scopes_supported: ['openid', 'profile', 'email', 'offline_access'], resource_name: 'Superlibrary',
      });
    });
    // With the plane off there is nothing to discover.
    expect((await SELF.fetch(`${APP_AUD}/.well-known/oauth-protected-resource`)).status).toBe(404);
  });
});

describe('dev auth', () => {
  it('accepts the dev headers as a person while DEV_AUTH is on and the plane is off', async () => {
    const res = await me(devHeaders());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ principalId: HUMAN, org: ORG });
  });
  it('ignores them once the plane is on', async () => {
    await withOrgPlane(async () => {
      expect((await me(devHeaders())).status).toBe(401);
    });
  });
});
