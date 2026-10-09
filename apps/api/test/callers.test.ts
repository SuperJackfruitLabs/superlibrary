import { SELF, env } from 'cloudflare:test';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveUploader, serviceCaller } from '../src/auth/caller';
import { AGENT, HUMAN, ORG, OTHER_ORG, planeToken, withOrgPlane } from './helpers/org-plane';

const HUB_SVC = 'prn_0000000000000000c0b1';
const OTHER_SVC = 'prn_0000000000000000c0b2';
const bag = env as unknown as Record<string, unknown>;
afterEach(() => { bag.HUB_SERVICE_PRINCIPAL = ''; });

async function call(path: string, token: string, headers: Record<string, string> = {}, init: RequestInit = {}) {
  return SELF.fetch(`https://api.test${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...headers } });
}

/** The agent's own plane token as the hub mints it: an agent, in ORG, acted for by the hub. */
const agentProof = (over: Record<string, unknown> = {}) => planeToken({ sub: AGENT, principalKind: 'agent', act: { sub: HUB_SVC }, ...over });
const hubToken = (over: Record<string, unknown> = {}) => planeToken({ sub: HUB_SVC, principalKind: 'service', ...over });

async function onBehalf(proof?: string, over: Record<string, string> = {}): Promise<Record<string, string>> {
  return { 'X-On-Behalf-Of': AGENT, 'X-On-Behalf-Kind': 'agent', ...(proof ? { 'X-On-Behalf-Token': proof } : {}), ...over };
}

type AuditRow = { workspace_id: string | null; actor: string; act: string | null; action: string; detail: string };
async function auditRows(action: string, actor: string): Promise<AuditRow[]> {
  return (await env.DB.prepare(`SELECT workspace_id, actor, act, action, detail FROM audit_events WHERE action = ? AND actor = ? ORDER BY at`).bind(action, actor).all<AuditRow>()).results;
}

/** Runs `fn` and returns the refused-audit rows it added for `actor`. */
async function refusalsDuring(actor: string, fn: () => Promise<void>): Promise<AuditRow[]> {
  const before = (await auditRows('on_behalf.refused', actor)).length;
  await fn();
  return (await auditRows('on_behalf.refused', actor)).slice(before);
}

describe('who may call (plan P1, P13)', () => {
  it('an agent may read its own identity but may not list or upload', async () => {
    await withOrgPlane(async () => {
      const t = await planeToken({ sub: AGENT, principalKind: 'agent' });
      expect((await call('/api/v1/me', t)).status).toBe(403);
      const up = await call('/api/v1/uploads', t, { 'content-type': 'application/json' }, { method: 'POST', body: JSON.stringify({ title: 'x', files: [{ path: 'a.md', bytes: 1, sha256: 'a'.repeat(64) }] }) });
      expect(up.status).toBe(403);
      expect(await up.json()).toMatchObject({ error: 'principal_not_supported' });
    });
  });

  it("only the hub's service may send X-On-Behalf-Of", async () => {
    bag.HUB_SERVICE_PRINCIPAL = HUB_SVC;
    await withOrgPlane(async () => {
      const other = await planeToken({ sub: OTHER_SVC, principalKind: 'service' });
      const proof = await agentProof();
      const rows = await refusalsDuring(OTHER_SVC, async () => {
        const r = await call('/api/v1/whoami', other, await onBehalf(proof));
        expect(r.status).toBe(403);
        expect(await r.json()).toMatchObject({ error: 'principal_not_supported' });
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ workspace_id: null, act: null });
      expect(JSON.parse(rows[0]!.detail)).toMatchObject({ named: AGENT, method: 'GET', path: '/api/v1/whoami' });
    });
  });

  it('the hub without X-On-Behalf-Of, or naming a malformed principal, is refused', async () => {
    bag.HUB_SERVICE_PRINCIPAL = HUB_SVC;
    await withOrgPlane(async () => {
      const hub = await hubToken();
      // Naming no one is refused, and is not an on-behalf use, so nothing is audited.
      const none = await refusalsDuring(HUB_SVC, async () => {
        expect((await call('/api/v1/me', hub)).status).toBe(403);
        expect((await call('/api/v1/whoami', hub)).status).toBe(403);
      });
      expect(none).toHaveLength(0);
      const rows = await refusalsDuring(HUB_SVC, async () => {
        expect((await call('/api/v1/whoami', hub, await onBehalf(await agentProof(), { 'X-On-Behalf-Of': 'prn_bad' }))).status).toBe(400);
      });
      expect(rows).toHaveLength(1);
      expect(JSON.parse(rows[0]!.detail)).toMatchObject({ named: null });
    });
  });

  it('the hub may not act for a person', async () => {
    bag.HUB_SERVICE_PRINCIPAL = HUB_SVC;
    await withOrgPlane(async () => {
      const hub = await hubToken();
      const person = await planeToken({ sub: HUMAN, principalKind: 'human', act: { sub: HUB_SVC } });
      const rows = await refusalsDuring(HUB_SVC, async () => {
        const r = await call('/api/v1/me', hub, { 'X-On-Behalf-Of': HUMAN, 'X-On-Behalf-Kind': 'human', 'X-On-Behalf-Token': person });
        expect(r.status).toBe(403);
        expect(await r.json()).toMatchObject({ error: 'principal_not_supported' });
        // Kind alone decides: a valid agent proof does not make "human" acceptable.
        const k = await call('/api/v1/whoami', hub, await onBehalf(await agentProof(), { 'X-On-Behalf-Kind': 'human' }));
        expect(k.status).toBe(403);
      });
      expect(rows).toHaveLength(2);
    });
  });

  it('the agent proof must name the same agent, an agent, in the same workspace, minted by the hub', async () => {
    bag.HUB_SERVICE_PRINCIPAL = HUB_SVC;
    await withOrgPlane(async () => {
      const hub = await hubToken();
      const cases: Array<[string, string | undefined]> = [
        ['sub differs from the header', await agentProof({ sub: 'prn_000000000000000000a9' })],
        ['a person, not an agent', await agentProof({ principalKind: 'human' })],
        ['another workspace', await agentProof({ org: OTHER_ORG })],
        ['not minted by the hub', await agentProof({ act: { sub: OTHER_SVC } })],
        ['not entitled', await agentProof({ ent: [] })],
        ['missing', undefined],
        ['not a token', 'garbage'],
      ];
      for (const [why, proof] of cases) {
        const rows = await refusalsDuring(HUB_SVC, async () => {
          const r = await call('/api/v1/whoami', hub, await onBehalf(proof));
          expect(r.status, why).toBe(403);
          expect(await r.json(), why).toMatchObject({ error: 'principal_not_supported' });
        });
        expect(rows, why).toHaveLength(1);
      }
    });
  });

  it('an unentitled caller sending X-On-Behalf-Of is refused as not enabled, and audited', async () => {
    bag.HUB_SERVICE_PRINCIPAL = HUB_SVC;
    await withOrgPlane(async () => {
      const hub = await hubToken({ ent: [] });
      const rows = await refusalsDuring(HUB_SVC, async () => {
        const r = await call('/api/v1/whoami', hub, await onBehalf(await agentProof()));
        expect(r.status).toBe(403);
        expect(await r.json()).toMatchObject({ error: 'product_not_enabled', org: ORG });
      });
      expect(rows).toHaveLength(1);
      expect(JSON.parse(rows[0]!.detail)).toMatchObject({ reason: 'product not enabled', named: AGENT });
      const viaServiceCaller = await refusalsDuring(HUB_SVC, async () => {
        const r = await serviceCaller(new Request('https://api.test/api/v1/internal', { headers: { Authorization: `Bearer ${hub}`, ...(await onBehalf(await agentProof())) } }), env);
        expect(r instanceof Response ? [r.status, (await r.json<{ error: string }>()).error] : 200).toEqual([403, 'product_not_enabled']);
      });
      expect(viaServiceCaller).toHaveLength(1);
      // Without the headers it is the plain refusal, unaudited.
      const plain = await refusalsDuring(HUB_SVC, async () => {
        expect((await call('/api/v1/whoami', hub)).status).toBe(403);
      });
      expect(plain).toHaveLength(0);
    });
  });

  it('the hub acting for an agent is accepted and audited with both', async () => {
    bag.HUB_SERVICE_PRINCIPAL = HUB_SVC;
    await withOrgPlane(async () => {
      const before = (await auditRows('on_behalf.accepted', AGENT)).length;
      const r = await call('/api/v1/whoami', await hubToken(), await onBehalf(await agentProof()));
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({ kind: 'agent', principalId: AGENT });
      const rows = (await auditRows('on_behalf.accepted', AGENT)).slice(before);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ actor: AGENT, act: HUB_SVC });
      expect(rows[0]!.workspace_id).toMatch(/^wsp_/);
      expect(JSON.parse(rows[0]!.detail)).toEqual({ method: 'GET', path: '/api/v1/whoami' });
      const m = await env.DB.prepare(`SELECT COUNT(*) AS n FROM members WHERE principal_id = ?`).bind(AGENT).first<{ n: number }>();
      expect(m!.n).toBe(0);
    });
  });

  it('a person or an agent sending X-On-Behalf-Of is refused', async () => {
    bag.HUB_SERVICE_PRINCIPAL = HUB_SVC;
    await withOrgPlane(async () => {
      const human = await planeToken();
      const humanRows = await refusalsDuring(HUMAN, async () => {
        const r = await call('/api/v1/me', human, { 'X-On-Behalf-Of': AGENT });
        expect(r.status).toBe(403);
        expect(await r.json()).toMatchObject({ error: 'principal_not_supported' });
      });
      expect(humanRows).toHaveLength(1);
      const agent = await agentProof();
      const agentRows = await refusalsDuring(AGENT, async () => {
        const r = await call('/api/v1/whoami', agent, await onBehalf(agent));
        expect(r.status).toBe(403);
        expect(await r.json()).toMatchObject({ error: 'principal_not_supported' });
      });
      expect(agentRows).toHaveLength(1);
    });
  });

  it('HUB_SERVICE_PRINCIPAL with several values trusts nobody', async () => {
    for (const setting of [`${HUB_SVC} ${OTHER_SVC}`, ` ${HUB_SVC}`, 'not-a-prn', '']) {
      bag.HUB_SERVICE_PRINCIPAL = setting;
      await withOrgPlane(async () => {
        const r = await call('/api/v1/whoami', await hubToken(), await onBehalf(await agentProof()));
        expect(r.status, JSON.stringify(setting)).toBe(403);
      });
    }
  });

  it('serviceCaller admits only the hub', async () => {
    bag.HUB_SERVICE_PRINCIPAL = HUB_SVC;
    await withOrgPlane(async () => {
      const req = async (token: string, headers: Record<string, string> = {}) =>
        serviceCaller(new Request('https://api.test/api/v1/internal', { headers: { Authorization: `Bearer ${token}`, ...headers } }), env);
      expect(await req(await hubToken())).toEqual({ sub: HUB_SVC, org: ORG });
      for (const [why, token] of [
        ['another service', await planeToken({ sub: OTHER_SVC, principalKind: 'service' })],
        ['a person', await planeToken()],
        ['an agent', await agentProof()],
        ['the hub, not entitled', await hubToken({ ent: [] })],
      ] as const) {
        const r = await req(token);
        expect(r instanceof Response ? r.status : 200, why).toBe(403);
      }
      const withHeader = await req(await hubToken(), await onBehalf(await agentProof()));
      expect(withHeader instanceof Response ? withHeader.status : 200).toBe(403);
      bag.HUB_SERVICE_PRINCIPAL = `${HUB_SVC} ${OTHER_SVC}`;
      const several = await req(await hubToken());
      expect(several instanceof Response ? several.status : 200).toBe(403);
    });
  });

  it('resolveUploader takes an agent only through the hub', async () => {
    bag.HUB_SERVICE_PRINCIPAL = HUB_SVC;
    await withOrgPlane(async () => {
      const org = 'org_00000000000000000c03';
      const req = (token: string, headers: Record<string, string> = {}) =>
        resolveUploader(new Request('https://api.test/api/v1/uploads', { method: 'POST', headers: { Authorization: `Bearer ${token}`, ...headers } }), env);
      const direct = await req(await agentProof({ org }));
      expect(direct instanceof Response ? direct.status : 200).toBe(403);
      const through = await req(await hubToken({ org }), await onBehalf(await agentProof({ org })));
      expect(through).toMatchObject({ kind: 'agent', principalId: AGENT, via: HUB_SVC, act: HUB_SVC, role: 'member' });
      const m = await env.DB.prepare(`SELECT COUNT(*) AS n FROM members WHERE principal_id = ?`).bind(AGENT).first<{ n: number }>();
      expect(m!.n).toBe(0);
    });
  });

  it('an agent acting through the hub is never made a member, so never an owner', async () => {
    bag.HUB_SERVICE_PRINCIPAL = HUB_SVC;
    await withOrgPlane(async () => {
      const org = 'org_00000000000000000c01';
      const hub = await hubToken({ org });
      // Agent first in a fresh workspace: an upload declare is the first request.
      const r = await call('/api/v1/uploads', hub, { ...(await onBehalf(await agentProof({ org }))), 'content-type': 'application/json' }, { method: 'POST', body: JSON.stringify({ title: 'x', scope: 'board:brd_00000000000000b1', files: [{ path: 'a.md', bytes: 1, sha256: 'a'.repeat(64) }] }) });
      expect(r.status).not.toBe(500);
      const m = await env.DB.prepare(`SELECT COUNT(*) AS n FROM members WHERE principal_id = ?`).bind(AGENT).first<{ n: number }>();
      expect(m!.n).toBe(0);
    });
  });

  it('reading as an agent never makes the agent a member', async () => {
    await withOrgPlane(async () => {
      const t = await planeToken({ sub: AGENT, principalKind: 'agent', org: 'org_00000000000000000c02' });
      const r = await call('/api/v1/whoami', t);
      expect(await r.json()).toEqual({ kind: 'agent', principalId: AGENT });
      const m = await env.DB.prepare(`SELECT COUNT(*) AS n FROM members WHERE principal_id = ?`).bind(AGENT).first<{ n: number }>();
      expect(m!.n).toBe(0);
    });
  });
});

describe('a person is never served through a service (operator ruling R-H1)', () => {
  const DETAIL = 'a token minted for a person by a service is refused; sign in as yourself';
  const upload = (t: string) => call('/api/v1/uploads', t, { 'content-type': 'application/json' }, { method: 'POST', body: JSON.stringify({ title: 'x', files: [{ path: 'a.md', bytes: 1, sha256: 'a'.repeat(64) }] }) });

  it("a person's token minted by a service (act) is refused and audited", async () => {
    await withOrgPlane(async () => {
      const minted = await planeToken({ sub: HUMAN, principalKind: 'human', act: { sub: HUB_SVC }, amr: ['assertion'] });
      const rows = await refusalsDuring(HUMAN, async () => {
        const read = await call('/api/v1/items', minted);
        expect(read.status).toBe(403);
        expect(await read.json()).toMatchObject({ error: 'principal_not_supported', detail: DETAIL });
        const write = await upload(minted);
        expect(write.status).toBe(403);
        expect(await write.json()).toMatchObject({ error: 'principal_not_supported', detail: DETAIL });
      });
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row.act).toBe(HUB_SVC);
        expect(row.workspace_id).toBeNull();
        expect(JSON.parse(row.detail)).toMatchObject({ reason: 'delegated_person' });
      }
    });
  });

  it('an assertion token (amr assertion, no act) is refused', async () => {
    await withOrgPlane(async () => {
      const minted = await planeToken({ sub: HUMAN, principalKind: 'human', amr: ['assertion'] });
      const rows = await refusalsDuring(HUMAN, async () => {
        const r = await call('/api/v1/items', minted);
        expect(r.status).toBe(403);
        expect(await r.json()).toMatchObject({ error: 'principal_not_supported', detail: DETAIL });
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.act).toBeNull();
      expect(JSON.parse(rows[0]!.detail)).toMatchObject({ reason: 'delegated_person' });
    });
  });

  it("the same person's own token still works on the same routes", async () => {
    await withOrgPlane(async () => {
      const own = await planeToken({ sub: HUMAN, principalKind: 'human', amr: ['pwd'] });
      const rows = await refusalsDuring(HUMAN, async () => {
        expect((await call('/api/v1/items', own)).status).toBe(200);
        expect((await upload(own)).status).toBe(201);
      });
      expect(rows).toHaveLength(0);
    });
  });
});
