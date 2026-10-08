# Superlibrary phase 1: Accounts registration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Register Superlibrary as a product of the organization plane, so a person can get a token for the audience `https://app.superlibrary.dev` from the Superlibrary web app, from `suli`, and (for embedding) from the Superpipeline and AgentPod console web apps, and so `ent` carries `superlibrary` for the seed workspace.

**Architecture:** One PR in `SuperJackfruitLabs/accounts`. The product registry (`src/products/registry.ts`) is the single source of product facts; the OAuth resources, first-party clients, CORS origins, device-flow client check and return origins all derive from it, so the change is the registry entry plus the places that enumerate products by hand (the `PRODUCT_IDS` tuple, the Drizzle column enum, the first-party id pattern, the token-claims fixture and the issuer contract's tables). A custom Drizzle migration enables the product for the seed workspace, following `0009_seed_entitlements.sql`.

**Tech Stack:** Bun 1.x, Hono, Better Auth 1.7.7 (OAuth provider, device authorization), Drizzle + Postgres 16, `bun test`, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-09-superlibrary-design.md` (in the superlibrary repo), §6 "Accounts registers Superlibrary as a product", §9 "Embedding", §13 "accounts". The main plan is `docs/superpowers/plans/2026-10-09-superlibrary-phase-1-core.md`; this plan is executed **first**, because the API's sign-in depends on it.

**Repository:** `/Users/rakeshgangwar/SuperJackfruit/accounts`, base `origin/main` (e291dfa at the time of writing). Branch `feat/superlibrary-product`.

## Global Constraints

- Audience: `https://app.superlibrary.dev` (spec §6). No MCP audience in phase 1: `createRegistry` requires exactly one MCP audience across the registry (Superpipeline's), and Superlibrary's MCP is phase 3. Phase 3 must change that rule; this plan does not.
- Entitlement id: `superlibrary` (spec §6), carried in `ent`.
- Web client: `superlibrary-web`, redirect `https://app.superlibrary.dev/auth/callback`, resources `[https://app.superlibrary.dev]`.
- CLI client: `suli` (operator decision 2026-10-09: the CLI is named `suli`), name "Superlibrary command line (suli)".
- Embedding (spec §9, Embedding): `superpipeline-web` and `agentpod-console` also list `https://app.superlibrary.dev` in their `resources`.
- Scopes `library:read`, `library:write`, `library:admin` need **no change here**: `src/issuer/grants.ts` says "The plane does not own the products' vocabularies … any scope of this shape is accepted", and `isReservedScope` reserves only `token|principals|grants|identities`. A test pins that the three are grantable and not reserved.
- **Deferred to phase 2, on purpose:** the AgentPod hub's service grant (scope `token:agent` already exists; phase 2 adds the Superlibrary audience to what the hub mints for) and the Superlibrary audience in agents' station tokens. Nothing in phase 1 accepts an agent or service token.
- Never put local host names or agent names in shipped code or docs. The product word is "workspace".
- Commits end with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8
  ```
- Trunk-based: branch → PR → CI green → the operator merges. Do not merge.

## Review Focus

- A product added to the registry but not to the Drizzle enum or `PRODUCT_IDS` → `listProducts` hides it and the enable page 404s it. Expected: the workspace products page lists Superlibrary and `/enable?product=superlibrary` renders. Pinned in Task A1 Step 1 (`pages-products` case).
- The Superlibrary web origin missing from CORS → the SPA's code redemption fails with "Load failed" (the console's cutover bug). Expected: a preflight from `https://app.superlibrary.dev` to `/api/auth/oauth2/token` answers 204 with that origin. Pinned in Task A1 Step 1.
- `superlibrary-web` able to request another product's audience → a Superlibrary token replayable at Superpipeline. Expected: `invalid_target`. Pinned in Task A1 Step 1.
- A device credential issued to `suli` exchanged for Superpipeline's audience. Expected: the plane mints per audience requested (contract §3.2 lets a device credential request any audience); this is existing behaviour, so the test only pins that `suli` is a known client and its credential is recorded as `suli`.
- Re-running the entitlement migration on a workspace where an operator disabled Superlibrary. Expected: the operator's choice is kept (`ON CONFLICT DO NOTHING`). Pinned in Task A2 Step 1.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/products/registry.ts` | modify | `PRODUCT_IDS`, `CliClient` union, `SUPERLIBRARY_APP`, the Superlibrary product, embedding resources on two existing clients |
| `src/db/schema/plane.ts:57` | modify | `product_entitlements.product` enum gains `superlibrary` |
| `src/auth/seed-clients.ts` | modify | `FIRST_PARTY_ID` matches `superlibrary-web` |
| `src/db/migrations/0011_seed_superlibrary_entitlement.sql` (+ meta) | create | enable Superlibrary for the seed workspace |
| `fixtures/token_claims.json` | modify | `ent` enum gains `superlibrary`; version 9 |
| `docs/superpowers/specs/2026-10-06-issuer-contract.md` | modify | audience table, client table, device clients |
| `tests/unit/registry.test.ts` | modify | five products, audiences, clients |
| `tests/unit/token-fixture.test.ts` | modify | `ent` enum equals `PRODUCT_IDS` |
| `tests/integration/first-party-clients.test.ts` | modify | `superlibrary-web` code flow; embedding resources; `invalid_target` |
| `tests/integration/cors.test.ts` | modify | preflight from `https://app.superlibrary.dev` |
| `tests/integration/device-flow.test.ts` | modify | `suli` is a device client |
| `tests/integration/entitlements.test.ts` | modify | the seed migration for Superlibrary |
| `tests/unit/grant-scopes.test.ts` | create | `library:*` are valid, unreserved grant scopes |

---

### Task A1: Superlibrary in the product registry

**Files:**
- Modify: `src/products/registry.ts`
- Modify: `src/db/schema/plane.ts:57`
- Modify: `src/auth/seed-clients.ts` (`FIRST_PARTY_ID`)
- Modify: `fixtures/token_claims.json`
- Modify: `docs/superpowers/specs/2026-10-06-issuer-contract.md`
- Test: `tests/unit/registry.test.ts`, `tests/unit/token-fixture.test.ts`, `tests/unit/grant-scopes.test.ts`, `tests/integration/first-party-clients.test.ts`, `tests/integration/cors.test.ts`, `tests/integration/device-flow.test.ts`

**Interfaces:**
- Consumes: `createRegistry`, `defaultProducts`, `PRODUCT_IDS` (`src/products/registry.ts`); `codeFlow`, `level2Session`, `raw`, `pkce` (`tests/helpers/oauth.ts`); `isScope`, `isReservedScope` (`src/issuer/grants.ts`).
- Produces: `SUPERLIBRARY_APP = "https://app.superlibrary.dev"` exported from `src/products/registry.ts`; product id `"superlibrary"`; web client `superlibrary-web`; CLI client `suli`. The main plan's Task 3 verifies tokens with `aud` containing `SUPERLIBRARY_APP` and `ent` containing `"superlibrary"`; its Task 19 runs the device flow with `client_id: "suli"`.

- [ ] **Step 1: Write the failing tests**

Create the branch:

```bash
cd /Users/rakeshgangwar/SuperJackfruit/accounts
git fetch origin && git checkout -b feat/superlibrary-product origin/main
```

In `tests/unit/registry.test.ts`, replace the first four tests and the CLI/lookup tests with:

```ts
test("the five products, in contract order", () => expect(r.products.map((p) => p.id)).toEqual(["agentpod", "superpipeline", "supermessage", "superwitness", "superlibrary"]));
test("audiences are exactly the contract's", () =>
  expect(r.audiences().sort()).toEqual(["https://app.superlibrary.dev", "https://app.superpipeline.dev", "https://app.superpipeline.dev/mcp", "https://app.superwitness.dev", "https://hub.agentpod.dev", "https://sw.acme.test"].sort()));
test("one MCP resource", () => expect(r.mcpResource()).toBe("https://app.superpipeline.dev/mcp"));
test("first-party clients, their redirects and the resources each may request (contract 3.1)", () => {
  expect(r.webClients().map((c) => [c.clientId, c.redirectUris, c.resources])).toEqual([
    // The console and Superpipeline embed Superlibrary's viewer (superlibrary spec §9, Embedding).
    ["agentpod-console", ["https://console.agentpod.dev/auth/callback"], ["https://hub.agentpod.dev", "https://app.superlibrary.dev"]],
    ["superpipeline-web", ["https://app.superpipeline.dev/auth/callback"], ["https://app.superpipeline.dev", "https://hub.agentpod.dev", "https://app.superlibrary.dev"]],
    ["superwitness-web", ["https://app.superwitness.dev/auth/callback"], ["https://app.superwitness.dev"]],
    ["superwitness-acme", ["https://sw.acme.test/auth/callback"], ["https://sw.acme.test"]],
    ["superlibrary-web", ["https://app.superlibrary.dev/auth/callback"], ["https://app.superlibrary.dev"]],
  ]);
  expect(r.get("supermessage").webClients).toEqual([]);
  expect(r.get("superlibrary").mcpAudience).toBeNull();
});
test("CLI clients map to their product", () => {
  expect(r.cliClient("apn")?.product).toBe("agentpod");
  expect(r.cliClient("supi")?.product).toBe("superpipeline");
  expect(r.cliClient("suli")?.product).toBe("superlibrary");
  expect(r.cliClient("curl")).toBeUndefined();
});
test("lookups by audience and client", () => {
  expect(r.productForAudience("https://app.superpipeline.dev/mcp")?.id).toBe("superpipeline");
  expect(r.productForAudience("https://app.superlibrary.dev")?.id).toBe("superlibrary");
  expect(r.productForAudience("https://sw.acme.test")?.id).toBe("superwitness");
  expect(r.productForClient("agentpod-console")?.id).toBe("agentpod");
  expect(r.productForClient("superwitness-acme")?.id).toBe("superwitness");
  expect(r.productForClient("supi")?.id).toBe("superpipeline");
  expect(r.productForClient("superlibrary-web")?.id).toBe("superlibrary");
  expect(r.productForClient("suli")?.id).toBe("superlibrary");
});
```

and change the return-origins test's expectation to:

```ts
  expect(r.allowedReturnOrigins().sort()).toEqual(["https://app.superlibrary.dev", "https://app.superpipeline.dev", "https://app.superwitness.dev", "https://console.agentpod.dev", "https://sw.acme.test"]);
```

Append to `tests/unit/token-fixture.test.ts`:

```ts
import { PRODUCT_IDS } from "../../src/products/registry";

test("the fixture's ent enum is exactly the registry's products", () => {
  const ent = fixture.issued.find((c) => c.claim === "ent") as { enum: string[] };
  expect([...ent.enum].sort()).toEqual([...PRODUCT_IDS].sort());
});
```

Create `tests/unit/grant-scopes.test.ts`:

```ts
import { expect, test } from "bun:test";
import { isReservedScope, isScope } from "../../src/issuer/grants";

// Superlibrary's scopes are its own vocabulary (grants.ts: "The plane does not own the products'
// vocabularies"). They must be grantable through the workspace pages, so never reserved.
test("library:read, library:write and library:admin are valid, unreserved grant scopes", () => {
  for (const s of ["library:read", "library:write", "library:admin"]) {
    expect(isScope(s)).toBe(true);
    expect(isReservedScope(s)).toBe(false);
  }
});
```

Append to `tests/integration/first-party-clients.test.ts`:

```ts
const LIBRARY = { clientId: "superlibrary-web", redirectUri: "https://app.superlibrary.dev/auth/callback" };

test("superlibrary-web gets a code without consent, for its own audience only", async () => {
  const { app } = testApp();
  const human = await level2Session(app);
  const f = await codeFlow(app, human, { ...LIBRARY, resource: "https://app.superlibrary.dev" });
  expect(f.consentShown).toBe(false);
  expect(f.status).toBe(200);
  for (const resource of ["https://app.superpipeline.dev", "https://hub.agentpod.dev"]) {
    const r = await raw(app, authorize(LIBRARY.clientId, LIBRARY.redirectUri, resource), human);
    expect(r.headers.get("location")).toContain("error=invalid_target");
  }
});

test("superpipeline-web and agentpod-console may request the Superlibrary audience (embedding)", async () => {
  const { app } = testApp();
  const human = await level2Session(app);
  for (const c of [WEB, CONSOLE]) {
    const f = await codeFlow(app, human, { ...c, resource: "https://app.superlibrary.dev" });
    expect(f.consentShown).toBe(false);
    expect(f.status).toBe(200);
  }
});
```

Append to `tests/integration/cors.test.ts`:

```ts
test("the Superlibrary web app's preflight to the token endpoint is answered", async () => {
  const { app } = testApp();
  const res = await preflight(app, "/api/auth/oauth2/token", "https://app.superlibrary.dev");
  expect(res.status).toBe(204);
  expect(res.headers.get("access-control-allow-origin")).toBe("https://app.superlibrary.dev");
  expect(res.headers.get("access-control-allow-credentials")).toBeNull();
});
```

Append to `tests/integration/device-flow.test.ts` (the file's `approvedCredential(app, human, clientId)` helper already exists; read the top of the file and reuse it exactly as the `supi` test at line 77 does):

```ts
test("suli is a device client, and its credential is recorded as suli", async () => {
  const { app } = testApp();
  const human = await level2Session(app);
  const { poll } = await approvedCredential(app, human, "suli");
  const id = (poll.device_credential as string).split(":")[0];
  expect((await db.execute(sql`select client_id from device_credentials where id = ${id}`)).rows[0]).toEqual({ client_id: "suli" });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd /Users/rakeshgangwar/SuperJackfruit/accounts
docker run -d --rm --name accounts-pg -e POSTGRES_USER=agentpod -e POSTGRES_PASSWORD=agentpod-dev-password -e POSTGRES_DB=accounts_test -p 5434:5432 postgres:16
export DATABASE_URL=postgres://agentpod:agentpod-dev-password@localhost:5434/accounts_test
bun install --frozen-lockfile && bun src/db/migrate.ts
bun test tests/unit/registry.test.ts tests/unit/token-fixture.test.ts tests/unit/grant-scopes.test.ts tests/integration/first-party-clients.test.ts tests/integration/cors.test.ts tests/integration/device-flow.test.ts
```

Expected: FAIL — "the five products" (four found), `cliClient("suli")` undefined, the fixture enum mismatch, `invalid_client` for `superlibrary-web`, the CORS preflight 404s. `grant-scopes.test.ts` PASSES already (it pins existing behaviour; keep it — it fails if someone reserves `library:`).

- [ ] **Step 3: Implement**

`src/products/registry.ts`:

```ts
export const PRODUCT_IDS = ["agentpod", "superpipeline", "supermessage", "superwitness", "superlibrary"] as const;
export type CliClient = { clientId: "apn" | "supi" | "suli"; name: string };
// …
export const SUPERLIBRARY_APP = "https://app.superlibrary.dev";
```

In `defaultProducts`, change the two existing clients' `resources` and append the product:

```ts
      webClients: [{ clientId: "agentpod-console", name: "AgentPod console", redirectUris: ["https://console.agentpod.dev/auth/callback"],
        // Superlibrary too: the console embeds Superlibrary's viewer (superlibrary spec §9, Embedding).
        resources: [HUB, SUPERLIBRARY_APP] }],
```

```ts
      // The hub too: the assignee picker reads /api/fleet/dispatchable (contract 3.1). Superlibrary
      // too: the card drawer embeds its viewer (superlibrary spec §9, Embedding).
      webClients: [{ clientId: "superpipeline-web", name: "Superpipeline", redirectUris: [`${SUPERPIPELINE_APP}/auth/callback`], resources: [SUPERPIPELINE_APP, HUB, SUPERLIBRARY_APP] }],
```

```ts
    { id: "superlibrary", name: "Superlibrary", homeUrl: SUPERLIBRARY_APP,
      webClients: [{ clientId: "superlibrary-web", name: "Superlibrary", redirectUris: [`${SUPERLIBRARY_APP}/auth/callback`], resources: [SUPERLIBRARY_APP] }],
      // MCP is phase 3 (superlibrary spec §14); createRegistry allows exactly one MCP audience today.
      audiences: [SUPERLIBRARY_APP], mcpAudience: null,
      cliClients: [{ clientId: "suli", name: "Superlibrary command line (suli)" }] },
```

`src/db/schema/plane.ts:57`:

```ts
    product: text("product", { enum: ["agentpod", "superpipeline", "supermessage", "superwitness", "superlibrary"] }).notNull(),
```

`src/auth/seed-clients.ts`:

```ts
export const FIRST_PARTY_ID = /^(agentpod-console|superpipeline-web|superlibrary-web|superwitness(-[a-z0-9-]+)?)$/;
```

`fixtures/token_claims.json`: set `"version": 9`, append to `authoredFrom`: `" Version 9 adds superlibrary to ent."`, and change the `ent` row's enum to `["agentpod", "superpipeline", "supermessage", "superwitness", "superlibrary"]`.

`docs/superpowers/specs/2026-10-06-issuer-contract.md`:
- In §1's audience table add the row `| Superlibrary | \`https://app.superlibrary.dev\` |`.
- In §3.1's client table change the `agentpod-console` resources cell to `hub, **and Superlibrary** (embedded viewer)`, the `superpipeline-web` cell to append `, **and Superlibrary** (embedded viewer)`, and add the row `| \`superlibrary-web\` | \`https://app.superlibrary.dev/auth/callback\` | Superlibrary only |`.
- In §3.1's last bullet and §3.2 change `apn` and `supi` to `apn`, `supi` and `suli`, and the device-code body to `client_id: "apn" | "supi" | "suli"`.
- In §2's entitlement paragraph change "has all four products enabled" to "has every product enabled".

Check that the Drizzle enum change produces no SQL migration (a `text` enum is TypeScript-only):

```bash
bunx drizzle-kit generate
```

Expected: `No schema changes, nothing to migrate`. If it writes a file, delete it with `git clean -fd src/db/migrations` and stop: report what it generated before going on.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
bun run typecheck && bun test
```

Expected: PASS, the whole suite (other tests that enumerate products — `pages-products`, `entitlements` — must still pass; `listProducts` now returns five rows, which those tests assert with `toContainEqual`).

- [ ] **Step 5: Commit**

```bash
git add src/products/registry.ts src/db/schema/plane.ts src/auth/seed-clients.ts fixtures/token_claims.json docs/superpowers/specs/2026-10-06-issuer-contract.md tests
git commit -m "feat: register Superlibrary as a product (audience, superlibrary-web, suli)

Superpipeline's and the console's web clients may also request the Superlibrary
audience, so they can embed its viewer.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---

### Task A2: Enable Superlibrary for the seed workspace

**Files:**
- Create: `src/db/migrations/0011_seed_superlibrary_entitlement.sql` and its `meta/` snapshot + journal entry (written by drizzle-kit)
- Test: `tests/integration/entitlements.test.ts`

**Interfaces:**
- Consumes: `enabledProducts(org)` (`src/entitlements/service.ts`), `setProductStatus`.
- Produces: the seed workspace `org_00000000000000000000` carries `ent` containing `"superlibrary"`, which the main plan's live check (Task 21) relies on.

- [ ] **Step 1: Write the failing test**

Append to `tests/integration/entitlements.test.ts`:

```ts
test("the seed workspace has Superlibrary enabled by a migration, and an operator's later change is kept", async () => {
  await db.execute(sql`delete from product_entitlements where organization_id = 'org_00000000000000000000' and product = 'superlibrary'`);
  const file = readFileSync("src/db/migrations/0011_seed_superlibrary_entitlement.sql", "utf8");
  await pool.query(file.replaceAll("--> statement-breakpoint", ""));
  expect(await enabledProducts("org_00000000000000000000")).toContain("superlibrary");
  // An operator turns it off; re-running the migration must not turn it back on.
  await db.execute(sql`update product_entitlements set status = 'disabled' where organization_id = 'org_00000000000000000000' and product = 'superlibrary'`);
  await pool.query(file.replaceAll("--> statement-breakpoint", ""));
  expect(await enabledProducts("org_00000000000000000000")).not.toContain("superlibrary");
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
bun test tests/integration/entitlements.test.ts
```

Expected: FAIL with `ENOENT … 0011_seed_superlibrary_entitlement.sql`.

- [ ] **Step 3: Write the migration**

```bash
bunx drizzle-kit generate --custom --name seed_superlibrary_entitlement
```

Expected: it creates `src/db/migrations/0011_seed_superlibrary_entitlement.sql` (empty), `meta/0011_snapshot.json` and a journal entry. Write into the SQL file:

```sql
-- The seed workspace uses Superlibrary too: without a row it answers 403 product_not_enabled to its
-- people. Manual source; an operator's later change is kept (same shape as 0009).
INSERT INTO product_entitlements (organization_id, product, status, source, changed_at, changed_by) VALUES
  ('org_00000000000000000000', 'superlibrary', 'enabled', 'manual', now(), 'migration')
ON CONFLICT DO NOTHING;
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
bun src/db/migrate.ts && bun test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/migrations tests/integration/entitlements.test.ts
git commit -m "feat: enable Superlibrary for the seed workspace

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---

### Task A3: Pull request, deploy, and a live check

**Files:** none (process).

**Interfaces:**
- Produces: the live plane accepts `client_id=superlibrary-web` with `resource=https://app.superlibrary.dev`, and `client_id=suli` on the device flow. The main plan's Tasks 15, 19 and 21 depend on this being live.

- [ ] **Step 1: Run the e2e suite locally**

```bash
bunx playwright install chromium
bunx playwright test
docker rm -f accounts-pg
```

Expected: PASS (CI's `e2e` job runs `bunx playwright test` the same way).

- [ ] **Step 2: Push and open the PR**

```bash
git push -u origin feat/superlibrary-product
gh pr create --repo SuperJackfruitLabs/accounts --base main --title "Register Superlibrary as a product" --body "$(cat <<'BODY'
Registers Superlibrary (superlibrary spec §6, §9 Embedding, §13):

- product `superlibrary`, audience `https://app.superlibrary.dev`, no MCP audience yet (phase 3)
- first-party web client `superlibrary-web` (redirect `/auth/callback`, its own audience only)
- device client `suli`
- `superpipeline-web` and `agentpod-console` may also request the Superlibrary audience, so they can embed its viewer
- the seed workspace has Superlibrary enabled by migration 0011
- `library:read|write|admin` need no registration: grant scopes are product vocabulary (grants.ts); a test pins that they stay unreserved

Deferred to Superlibrary phase 2: the hub's service grant for the Superlibrary audience and the audience in station tokens.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8
BODY
)"
gh pr checks --watch
```

Expected: `test` and `e2e` green. Stop here until the operator merges.

- [ ] **Step 3: After the merge, deploy and check live**

Deploy exactly as `deploy/README.md` "Routine deploy" says (it fast-forwards to `origin/main`, installs, restarts and waits for `/healthz`; migrations run at start). Then:

```bash
curl -s https://accounts.superjackfruit.com/.well-known/oauth-authorization-server | jq -r .issuer
curl -s -o /dev/null -w '%{http_code} %header{access-control-allow-origin}\n' -X OPTIONS \
  -H 'origin: https://app.superlibrary.dev' -H 'access-control-request-method: POST' \
  https://accounts.superjackfruit.com/api/auth/oauth2/token
curl -s -X POST https://accounts.superjackfruit.com/api/auth/device/code \
  -H 'content-type: application/json' -d '{"client_id":"suli","scope":"openid"}' | jq 'has("user_code")'
```

Expected: `https://accounts.superjackfruit.com`; `204 https://app.superlibrary.dev`; `true`.

---

## Self-review

- Spec §6 product registration: audience, web + CLI clients, entitlement → A1, A2. Scopes → A1 (pinned as product vocabulary, no change). Service grant → deferred to phase 2, stated in Global Constraints.
- Spec §9 Embedding, Accounts bullet → A1 (`superpipeline-web`, `agentpod-console` resources).
- Spec §13 accounts, station-token audience → deferred to phase 2, stated.
- Placeholders: none. Names: `SUPERLIBRARY_APP`, `superlibrary-web`, `suli` are used identically in both plans.
