# Superlibrary phase 1 (Core) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A person in an entitled workspace can upload a file or a folder (web app or `suli upload`), get an immutable, content-addressed, versioned artifact that passed the guardrails, and view every kind in spec §9 inside a sandboxed frame on `superlibrarycontent.dev` — in the library app or embedded in another product through `@superlibrary/embed` — with every read audited and artifacts revoked, expired and swept per spec §12.

**Architecture:** A pnpm monorepo shaped like Superpipeline. `superlibrary-api` (Worker, same-origin at `app.superlibrary.dev/api/*`) verifies organization-plane tokens offline, owns D1, writes R2, signs 5-minute Ed25519 content URLs and runs the `retention` queue and cron. `superlibrary-content` (Worker on `*.superlibrarycontent.dev/*`) holds only R2 reads and the public verification key; it serves artifact bytes and the one viewer bundle that renders every kind. `superlibrary-web` (Pages) signs in with in-memory PKCE (copied from the AgentPod console) and embeds the same viewer frame through `@superlibrary/embed`. `suli` is a Bun CLI built on Superpipeline's command-table pattern.

**Tech Stack:** TypeScript 6, pnpm 11 workspaces, Cloudflare Workers (wrangler 4, D1, R2, Queues, Cron, static assets), `jose` 6, `zod` 4, vitest 4 + `@cloudflare/vitest-pool-workers` 0.16, SvelteKit 2 + Svelte 5 (`adapter-static`) on Cloudflare Pages, Playwright 1.61, Vite 8 (viewer bundle), `marked`, `dompurify`, `highlight.js`, `mermaid`, `viz.js@2.1.2`, `pdfjs-dist`, `yaml`, `smol-toml`, `fflate`, Bun (CLI runtime).

**Spec:** `docs/superpowers/specs/2026-10-09-superlibrary-design.md` (as amended in this PR: CLI name `suli`, §9 Embedding). Executors read both.

**Companion plan (execute first):** `docs/superpowers/plans/2026-10-09-superlibrary-phase-1-accounts.md` — registers the product, the audience, `superlibrary-web`, `suli`, the entitlement, and the embedding resources for `superpipeline-web` and `agentpod-console`. Task 3 below verifies tokens that only exist once it is live; Tasks 1-20 are testable without it (local key pairs), Task 21 is not.

**Precedents read for this plan** (cite them in code comments where a pattern is copied):
- Superpipeline `origin/main` f81f3f5: `apps/api/wrangler.jsonc`, `apps/api/vitest.config.ts`, `apps/api/src/auth/{hub-jwt,org-plane,org-plane-resolve,org-tenancy}.ts`, `apps/api/migrations/0017_org_plane_tenant_unique.sql`, `apps/api/src/mcp/auth.ts` (`protectedResourceMetadata`), `.github/workflows/ci.yml`, `apps/web/{svelte.config.js,vite.config.ts,vitest.config.ts,playwright.config.ts}`, `packages/cli/src/{commands,reference,reference.test,args,plane-login,credential}.ts`.
- AgentPod `origin/main` 2efe25a8: `apps/console/src/lib/auth/{org-plane,pkce}.ts` and their tests, `apps/console/src/routes/+layout.svelte`, `apps/console/src/routes/auth/callback/+page.svelte` (includes the fixes from #695, #698, #704).
- Accounts `origin/main` e291dfa: `src/products/registry.ts`, `docs/superpowers/specs/2026-10-06-issuer-contract.md`.

## Global Constraints

- Domains (spec header): app `https://app.superlibrary.dev`; content `*.superlibrarycontent.dev`, which "never serves anything with a login".
- API route: `app.superlibrary.dev/api/*` plus `app.superlibrary.dev/.well-known/oauth-protected-resource`, on the same hostname as the Pages app. **Why not `api.superlibrary.dev`:** Superpipeline serves its API and SPA from one origin (`app.superpipeline.dev`, `run_worker_first` for `/v1/*`, `/auth/*`, `/mcp`), and pins that one origin as both the token audience and the redirect origin (`APP_URL`, `planeAudience`). Same origin means the audience `https://app.superlibrary.dev` (spec §6) is literally the API's origin, `suli`'s discovery at `<base>/.well-known/oauth-protected-resource` works unchanged from `supi`, and the app needs no CORS. All API routes live under `/api/v1/` (coordinator: `POST /api/v1/items/:id/embed`); health is `/api/health`.
- Audience `https://app.superlibrary.dev`; entitlement `superlibrary`; a token without it gets `403 { "error": "product_not_enabled", "org": "<org_>" }` (spec §6, issuer contract §2). Workspace mapping `external_source = 'org-plane'`, `external_id = <org_>`, first sight creates it (issuer contract §2).
- Tokens: EdDSA only, `iss` exact, `aud` string-or-array containing the audience, required `exp iat jti sub`, `sub` `^prn_[0-9a-f]{20}$`, `org` `^org_[0-9a-f]{20}$`, JWKS cached ≤ 10 minutes, one refetch on an unknown `kid`, last good set served when the issuer is down (issuer contract §1; Superpipeline `hub-jwt.ts`).
- Sizes (spec §8): 25 MB per file; 100 MB and 500 files per folder; 1 GB per workspace by default.
- Type is sniffed from the bytes, never taken from the extension (spec §8).
- Path rules (spec §8): inside the root; `..` refused; denied by default `.env*`, `.ssh/`, `.gnupg/`, `*.pem`, `*.key`, `id_*`, `.git/` internals, `.netrc`, `.npmrc`, `.pypirc`, cloud credential files, harness config/session/token files.
- Secret scan (spec §8): AWS, GitHub, Slack, OpenAI and Anthropic keys, signed JWTs, PEM blocks, high-entropy assignments; an artifact with a hit is refused naming file and line; a person may override one artifact; the override is recorded.
- Content origin (spec §9): one subdomain per artifact; frame `<iframe sandbox="allow-scripts allow-popups-to-escape-sandbox" referrerpolicy="no-referrer">`; CSP `default-src 'none'`; scripts, styles, images, fonts, media from `'self' data: blob: https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com`, plus `'unsafe-inline'` for scripts and styles (D3); styles and fonts also `https://fonts.googleapis.com https://fonts.gstatic.com`; `connect-src 'none'`; `frame-ancestors` from configuration, initially `https://app.superlibrary.dev https://app.superpipeline.dev https://console.agentpod.dev`; no `form-action`; signed URLs of 5 minutes for one item version, never cookies; `X-Content-Type-Options: nosniff`; `Cross-Origin-Opener-Policy: same-origin`; `Content-Disposition: attachment` for every kind not rendered; `Cross-Origin-Resource-Policy` per decision D2 below.
- Retention (spec §12): artifacts referenced by a work record, card or collection are kept; any other is deleted after 30 days; deletion removes the D1 rows and the R2 bytes when no other version shares them.
- Never put local host names or agent names in shipped code, docs or test fixtures. The product word is "workspace".
- Secrets only through `wrangler secret put`; never in a file.
- Commits end with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8
  ```
- Trunk-based: one branch per task group, PR → CI green → the operator merges. No staging environment: Superpipeline has none (its CI deploys `main` straight to production), so neither does this.
- PR groups, each started with `git fetch origin && git checkout -b <branch> origin/main` after the previous one merged, and opened with the PR recipe at the top of Task 21: PR 1 `feat/phase-1-scaffold` (Tasks 1-3), PR 2 `feat/phase-1-artifacts` (4-10), PR 3 `feat/phase-1-viewer` (11-14), PR 4 `feat/phase-1-web` (15-18), PR 5 `feat/phase-1-cli` (19-20), PR 6 `feat/phase-1-deploy` (21).

## Decisions and spec gaps (read before Task 1)

Items marked **OPERATOR** need the operator's yes; the plan implements the stated choice so work can proceed, and each is one constant or one var to change.

- **D1 — API on the app's origin.** See Global Constraints. Pages serves `app.superlibrary.dev`; Worker routes on the same zone take precedence for `/api/*` and the protected-resource path. Task 21 Step 6 verifies it live.
- **D2 — OPERATOR: `Cross-Origin-Resource-Policy: same-site` breaks multi-file HTML.** Measured on 2026-10-09 in Chromium (Playwright 1.61) with the spec's sandbox and CSP: with `CORP: same-site` on subresources, a sandboxed (opaque-origin) page loads **none** of its own scripts or stylesheets from its own host; module scripts additionally need `Access-Control-Allow-Origin`. With `same-site` on documents and `cross-origin` + `Access-Control-Allow-Origin: *` on everything else, classic scripts, module scripts and CSS all load. The plan does the latter. Exposure is unchanged: every byte still needs the 5-minute signed path to be fetched at all.
- **D3 — DECIDED (operator, 2026-10-09): inline `<script>` and `<style>` are allowed in artifacts.** `'unsafe-inline'` is added to `script-src` and `style-src` on the content origin, so single-file HTML pages and Mermaid's injected styles work. Containment does not depend on it: the origin is opaque (sandbox without `allow-same-origin`), egress is `connect-src 'none'`, and top navigation, forms and modals are not allowed. `unsafe-eval` and `wasm-unsafe-eval` stay off. The viewer's own bundle still uses no inline code.
- **D4 — Graphviz without WebAssembly.** The CSP has no `'wasm-unsafe-eval'`, so `@viz-js/viz` cannot run. The viewer uses `viz.js@2.1.2`'s asm.js build (`full.render.js`), which is plain JavaScript.
- **D5 — PDF through pdf.js on the main thread.** A sandboxed frame without `allow-same-origin` cannot construct a Worker from its host's URL, so `pdfjs-dist` runs its worker in-thread (`globalThis.pdfjsWorker`), with `isEvalSupported: false`.
- **D6 — Downloads live in the host toolbar.** The sandbox has no `allow-downloads`, so the frame cannot download; `@superlibrary/embed`'s toolbar links to a signed `?download=1` URL. Folder versions have no download in phase 1 (`downloadUrl: null`); a zip of a folder is later work.
- **D7 — The content Worker has no database, so each version has a manifest in R2** (`manifests/<itemId>/<version>.json`). Revoking deletes it; changing an expiry rewrites it. Revocation is therefore immediate even for URLs minted less than five minutes ago.
- **D8 — R2 bindings have no read-only mode.** The content Worker types its binding as `Pick<R2Bucket, "get" | "head">` and a test fails if its source calls any other bucket method.
- **D9 — Signed URLs are path-scoped.** The minted URL is `https://<label>.superlibrarycontent.dev/_view?sig=<token>` (coordinator's shape). Raw files are served at `/s/<token>/<path>`, so an HTML artifact's relative `style.css` resolves to `/s/<token>/style.css` and carries the signature without cookies. For an HTML entry, `/_view` answers `302` to `/s/<token>/<entry>`.
- **D10 — Subdomain label.** Item ids follow Superpipeline's `newId` (`itm_` + 16 hex), but `_` is not valid in a hostname, so the label is `itm-<hex>` (`contentLabel`/`itemIdFromLabel` in the contract).
- **D11 — People's visibility in phase 1.** Spec §4: people see items on boards they can read in Superpipeline, plus `workspace` items. Phase 1 has no Superpipeline read, so it fails closed: `workspace` items are visible to every member; a `board:` item is visible only to its uploader until phase 3 adds the board check. Another workspace's item, or an invisible one, answers **404** (not 403), so its existence is not confirmed.
- **D12 — Roles.** The plane's token carries no role. As in Superpipeline (`provisionOrgHuman`), the first person seen in a workspace is `owner`, everyone after is `member`. The uploader or an owner may revoke or set an expiry; anyone may override the secret scan on **their own** upload, recorded.
- **D13 — Agents and services are refused in phase 1** (`403 principal_not_supported`): agents cannot upload (spec §5) and their visibility needs the roster (phase 3). `library:read|write|admin` are defined in `packages/contract` for phases 2-3; Accounts needs no scope registration (see the Accounts plan).
- **D14 — OPERATOR: retention runs in `report` mode.** Nothing can reference an artifact until phase 2 (work records) or phase 4 (collections), so enforcing the 30-day rule now would delete every upload at day 30. `RETENTION_MODE=report` logs and audits what it would delete; abandoned uploads and expired items are deleted in both modes. Phase 2 flips the var to `enforce`; the enforce path is fully tested here.
- **D15 — Only the `retention` queue now.** `ingest` and `index` are created in phases 2 and 3 with their handlers; a queue with no consumer code is not a deliverable.
- **D16 — Uploads are sessions, not one request.** A Worker request body caps at 100 MB and memory at 128 MB, so a 100 MB folder cannot arrive in one body. `POST /api/v1/uploads` declares the files (paths, sizes, SHA-256), `PUT …/files?path=` sends each one (≤ 25 MB), `POST …/commit` creates the version. Zips are expanded client-side (web: `fflate`; `suli` takes folders), and the server enforces the path rules on every declared path, so the rule holds whatever the client.
- **D17 — New versions are explicit.** A person's upload has no stable workspace path, so "the same source path" is the `item` field: uploading with `item: itm_…` creates version *n+1*.
- **D18 — Embed host.** The token signs the host origin the frame may talk to: the request's `Origin` if it is in the allowlist, else the app. The frame posts `superlibrary:resize` to that exact origin and accepts `superlibrary:theme` only from it. The host sees the frame's messages with `origin === "null"` (opaque origin), so `@superlibrary/embed` checks `event.source === iframe.contentWindow` plus `"null"`. HTML artifacts render their own page and do not report a height; hosts give them a fixed height.
- **D19 — Cloudflare API token.** Wildcard DNS for `*.superlibrarycontent.dev` and the `app` CNAME need DNS edit, which `wrangler login`'s OAuth scopes do not include. Task 21 needs one API token (Workers Scripts, D1, R2, Queues, Pages edit; DNS edit on both zones) — the same `CLOUDFLARE_API_TOKEN` repo secret Superpipeline's deploy uses. Minting it is the one browser step.
- **D20 — Deferred to phase 2:** the hub's service grant and the Superlibrary audience in station tokens (Accounts), `link_artifact`, work records.

## Review Focus

- **File and folder names with spaces, `#`, `?`, `%` or non-ASCII letters** (`my report #1.md`, `img/a b.png`). A person expects them to upload, view, and resolve as relative links. Every raw URL is built segment by segment with `encodeURIComponent`. Tests: Task 11 Step 1 (`a path with # ? % and spaces round-trips`), Task 13 Step 1 (`a relative image with a space resolves to the signed base, segment-encoded`).
- **An upload that outlives the 5-minute token** (a 100 MB folder on a slow link). A person expects it to finish. The web client and `suli` fetch a token per request, never once per upload. Tests: Task 15 Step 3 (`asks for a token on every request`), Task 20 Step 1 (`re-exchanges the device credential when the cached token expires mid-upload`).
- **The same bytes uploaded twice, or as a new version.** A person expects two versions and one stored copy; revoking or deleting one leaves the other viewable. Tests: Task 8 Step 1 (`identical bytes are stored once; a new version of the same item is n+1`), Task 10 Step 1 (`deleting one item keeps a blob another item still uses`, `revoking one version leaves the others viewable`).
- **Text that is not UTF-8** (a Windows-1252 CSV, a UTF-16 file with a BOM). A person expects UTF-16 to render and anything else to show a download card, never mojibake or a crash. Tests: Task 5 Step 1 (`UTF-16 with a BOM is text`, `invalid UTF-8 is binary`).
- **Two first requests from a new workspace at once** (the app fires several on load). A person expects one workspace with them as owner. Test: Task 3 Step 1 (`concurrent first sight makes one workspace and one owner`).

---

## File Structure

```
package.json, pnpm-workspace.yaml, tsconfig.base.json, .gitignore      Task 1
.github/workflows/ci.yml                                               Task 1 (test), 18 (e2e), 19 (bun), 21 (deploy)
scripts/dev-keys.mjs           dev/test Ed25519 pair → .dev.vars (gitignored)      Task 11
scripts/url-signing-key.mjs    production pair, straight into wrangler secrets     Task 21
packages/contract/             shared rules and types, no I/O
  src/ids.ts                   newId, ITEM_ID, contentLabel, itemIdFromLabel       Task 1
  src/model.ts                 OUTCOMES, VIEWS, SCOPE_RE, LIBRARY_SCOPES, zod + API types  Task 1
  src/limits.ts                size caps, TTLs                                     Task 1
  src/content.ts               CSP, token format, signing message, encodePath (1); Manifest (8)
  src/paths.ts                 checkPath (spec §8 path rules)                      Task 4
  src/viewer.ts                ViewerData, TEXT_VIEWS                              Task 11
  src/protocol.ts              frame messages and guards                           Task 12
  test/repo-invariants.test.ts content never writes R2; frame hosts agree         Task 11
apps/api/                      Worker superlibrary-api
  wrangler.jsonc, vitest.config.ts, tsconfig.json, package.json        Task 2
  migrations/0001_core.sql                                             Task 2
  src/index.ts                 router + queue + scheduled                          Task 2 (3, 7, 9, 10 extend)
  src/env.ts, src/http.ts, src/ids.ts, src/audit.ts                    Task 2 (Handler type: 7)
  src/auth/{jws,org-plane,caller}.ts                                   Task 3
  src/guard/sniff.ts                                                   Task 5
  src/guard/secrets.ts                                                 Task 6
  src/guard/limits.ts, src/storage/blobs.ts                            Task 7 (manifests: 8)
  src/uploads/routes.ts        create, put (7); override, commit (8)
  src/items/{visibility,sign,routes}.ts   reads + embed (9); revoke, expiry (10)
  src/lifecycle/retention.ts   sweep, deleteItem                                   Task 10
apps/content/                  Worker superlibrary-content
  wrangler.jsonc, vitest.config.ts, package.json, src/{index,headers,viewer-page}.ts   Task 11
  viewer/                      the one renderer bundle (Vite → viewer-dist/_viewer/)   Task 11 (stub), 12, 13
packages/embed/                @superlibrary/embed host SDK                        Task 14
apps/web/                      SvelteKit SPA on Pages superlibrary-web
  src/lib/auth/{org-plane,pkce}.ts   copied from the AgentPod console              Task 15
  src/lib/{api,return-to,session.svelte}.ts, routes (layout, login, callback)   Task 15
  src/lib/upload.ts, routes/{+page,upload/+page}.svelte                Task 16
  src/lib/{item.ts,ItemView.svelte}, routes/a/[itemId]/…               Task 17
  playwright.config.ts, e2e/   kinds, security, upload                             Task 18
packages/cli/                  suli: table, reference, credential, sign-in (19); artifacts (20)
docs/reference/cli/            generated from packages/cli/src/commands.ts         Task 19
```

---

### Task 1: Monorepo, contract package, CI test job

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `.github/workflows/ci.yml`
- Create: `packages/contract/{package.json,tsconfig.json,vitest.config.ts}`, `packages/contract/src/{index,ids,model,limits,content}.ts`
- Test: `packages/contract/test/contract.test.ts`

**Interfaces:**
- Produces (imported by every later task as `@superlibrary/contract`):
  - `newId(prefix: string): string` → `<prefix>_<16 hex>`
  - `ITEM_ID: RegExp` (`^itm_[0-9a-f]{16}$`), `contentLabel(itemId: string): string` (`itm-<hex>`), `itemIdFromLabel(label: string): string | null`
  - `OUTCOMES`, `type Outcome`, `VIEWS`, `type View`, `SCOPE_RE`, `type Scope = "workspace" | \`board:${string}\``, `LIBRARY_SCOPES`
  - `LIMITS = { fileBytes, folderBytes, folderFiles, workspaceBytes, embedTtlSeconds, retentionDays, uploadTtlHours, csvRows }`
  - `UploadCreate` (zod), `type UploadCreateBody`, `type CommitResult`, `type EmbedGrant`, `type ItemSummary`, `type VersionSummary`
  - `CONTENT_CSP_SOURCES`, `contentCsp(frameAncestors: string[]): string`, `encodePath(path: string): string`, `signingMessage(t: { itemId: string; version: number; exp: number; host: string }): Uint8Array`, `formatToken(t: { version: number; exp: number; host: string; sig: Uint8Array }): string`, `parseToken(token: string): { version: number; exp: number; host: string; sig: Uint8Array } | null`, `b64url(bytes: Uint8Array): string`, `fromB64url(s: string): Uint8Array | null`

- [ ] **Step 1: Write the failing test**

```bash
cd /Users/rakeshgangwar/SuperJackfruit/superlibrary
git fetch origin && git checkout -b feat/phase-1-scaffold origin/main
mkdir -p packages/contract/src packages/contract/test .github/workflows
```

`packages/contract/test/contract.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  ITEM_ID, newId, contentLabel, itemIdFromLabel, SCOPE_RE, LIMITS, UploadCreate,
  contentCsp, encodePath, formatToken, parseToken, signingMessage, b64url, fromB64url,
} from '../src/index';

describe('ids', () => {
  it('mints prefixed 16-hex ids, and maps an item id to a hostname label and back', () => {
    const id = newId('itm');
    expect(id).toMatch(ITEM_ID);
    expect(contentLabel(id)).toBe(id.replace('itm_', 'itm-'));
    expect(itemIdFromLabel(contentLabel(id))).toBe(id);
  });
  it('refuses a label that is not exactly an item label', () => {
    for (const bad of ['itm_0123456789abcdef', 'itm-0123', 'ITM-0123456789ABCDEF', 'x.itm-0123456789abcdef', '']) {
      expect(itemIdFromLabel(bad)).toBeNull();
    }
  });
});

describe('model', () => {
  it('accepts workspace and board scopes only', () => {
    expect(SCOPE_RE.test('workspace')).toBe(true);
    expect(SCOPE_RE.test('board:brd_f47143722126442c')).toBe(true);
    expect(SCOPE_RE.test('board:anything')).toBe(false);
    expect(SCOPE_RE.test('public')).toBe(false);
  });
  it('states the spec §8 limits exactly', () => {
    expect(LIMITS.fileBytes).toBe(25 * 1024 * 1024);
    expect(LIMITS.folderBytes).toBe(100 * 1024 * 1024);
    expect(LIMITS.folderFiles).toBe(500);
    expect(LIMITS.workspaceBytes).toBe(1024 * 1024 * 1024);
    expect(LIMITS.embedTtlSeconds).toBe(300);
    expect(LIMITS.retentionDays).toBe(30);
    expect(LIMITS.csvRows).toBe(5000);
  });
  it('validates an upload declaration', () => {
    const ok = UploadCreate.safeParse({ title: 'Report', files: [{ path: 'a.md', bytes: 3, sha256: 'a'.repeat(64) }] });
    expect(ok.success).toBe(true);
    expect(UploadCreate.safeParse({ title: 'x', files: [] }).success).toBe(false);
    expect(UploadCreate.safeParse({ title: 'x', files: [{ path: 'a', bytes: -1, sha256: 'a'.repeat(64) }] }).success).toBe(false);
    expect(UploadCreate.safeParse({ title: 'x', scope: 'public', files: [{ path: 'a', bytes: 1, sha256: 'a'.repeat(64) }] }).success).toBe(false);
  });
});

describe('content origin', () => {
  it('builds the spec §9 CSP, with frame-ancestors from configuration', () => {
    const csp = contentCsp(['https://app.superlibrary.dev', 'https://app.superpipeline.dev']);
    const cdn = "'self' data: blob: https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com";
    expect(csp).toBe([
      "default-src 'none'",
      `script-src ${cdn} 'unsafe-inline'`,
      `style-src ${cdn} https://fonts.googleapis.com https://fonts.gstatic.com 'unsafe-inline'`,
      `img-src ${cdn}`,
      `font-src ${cdn} https://fonts.googleapis.com https://fonts.gstatic.com`,
      `media-src ${cdn}`,
      "connect-src 'none'",
      'frame-ancestors https://app.superlibrary.dev https://app.superpipeline.dev',
    ].join('; '));
    expect(csp).not.toContain('form-action');
    // Operator decision D3: inline script and style are allowed; eval and WebAssembly are not.
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toContain('wasm-unsafe-eval');
  });
  it('encodes each path segment, keeping the slashes', () => {
    expect(encodePath('img/a b#1?.png')).toBe('img/a%20b%231%3F.png');
    expect(encodePath('ünï/100%.md')).toBe('%C3%BCn%C3%AF/100%25.md');
  });
  it('round-trips a token and refuses a malformed one', () => {
    const sig = new Uint8Array(64).fill(7);
    const t = formatToken({ version: 3, exp: 1_800_000_000, host: 'https://app.superlibrary.dev', sig });
    expect(parseToken(t)).toEqual({ version: 3, exp: 1_800_000_000, host: 'https://app.superlibrary.dev', sig });
    for (const bad of ['', '3.1800000000', 'x.1.aaa.bbb', '0.1800000000.aGk.' + b64url(sig), '3.1800000000.aGk.short']) {
      expect(parseToken(bad)).toBeNull();
    }
  });
  it('signs item, version, expiry and host together', () => {
    const m = new TextDecoder().decode(signingMessage({ itemId: 'itm_0123456789abcdef', version: 2, exp: 99, host: 'https://h.test' }));
    expect(m).toBe('superlibrary-content/v1\nitm_0123456789abcdef\n2\n99\nhttps://h.test');
  });
  it('base64url round-trips and rejects junk', () => {
    const bytes = new Uint8Array([0, 255, 62, 63]);
    expect(fromB64url(b64url(bytes))).toEqual(bytes);
    expect(fromB64url('***')).toBeNull();
  });
});
```

- [ ] **Step 2: Write the workspace files and run the test to verify it fails**

`package.json`:

```json
{
  "name": "superlibrary",
  "version": "0.0.1",
  "private": true,
  "description": "The memory of the stack: artifacts and work history, labelled with how each turned out.",
  "packageManager": "pnpm@11.5.2",
  "engines": { "node": ">=22" },
  "scripts": {
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck",
    "build": "pnpm -r build"
  },
  "devDependencies": {
    "typescript": "^6.0.3",
    "vitest": "^4.1.9"
  }
}
```

`pnpm-workspace.yaml` (Superpipeline's, minus its `agents`-SDK exclusions):

```yaml
packages:
  - 'packages/*'
  - 'apps/*'
allowBuilds:
  esbuild: true
  workerd: true
  sharp: false
```

`tsconfig.base.json`: copy Superpipeline's verbatim:

```bash
git -C /Users/rakeshgangwar/SuperJackfruit/superpipeline show f81f3f5:tsconfig.base.json > tsconfig.base.json
git -C /Users/rakeshgangwar/SuperJackfruit/superpipeline show f81f3f5:.gitignore > .gitignore
```

`packages/contract/package.json`:

```json
{
  "name": "@superlibrary/contract",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": { "test": "vitest run", "typecheck": "tsc --noEmit" },
  "dependencies": { "zod": "^4.4.3" }
}
```

`packages/contract/tsconfig.json`:

```json
{ "extends": "../../tsconfig.base.json", "compilerOptions": { "lib": ["ES2023", "DOM"] }, "include": ["src", "test"] }
```

`packages/contract/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node', include: ['test/**/*.test.ts'] } });
```

`packages/contract/src/index.ts`:

```ts
export * from './ids';
export * from './model';
export * from './limits';
export * from './content';
```

Run:

```bash
pnpm install && pnpm --filter @superlibrary/contract test
```

Expected: FAIL — `Failed to resolve import "./ids"`.

- [ ] **Step 3: Implement the contract**

`packages/contract/src/ids.ts`:

```ts
/** `<prefix>_<16 hex>`, the shape Superpipeline's `newId` mints (apps/api/src/ids.ts). */
export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

export const ITEM_ID = /^itm_[0-9a-f]{16}$/;
const LABEL = /^itm-([0-9a-f]{16})$/;

/** `_` is not valid in a hostname, so an item's content subdomain spells it `-` (plan decision D10). */
export function contentLabel(itemId: string): string {
  if (!ITEM_ID.test(itemId)) throw new Error(`not an item id: ${itemId}`);
  return itemId.replace('itm_', 'itm-');
}

export function itemIdFromLabel(label: string): string | null {
  const m = LABEL.exec(label);
  return m ? `itm_${m[1]}` : null;
}
```

`packages/contract/src/limits.ts`:

```ts
const MB = 1024 * 1024;
/** Spec §8 sizes, §9 URL lifetime, §11 CSV rows, §12 retention. */
export const LIMITS = {
  fileBytes: 25 * MB,
  folderBytes: 100 * MB,
  folderFiles: 500,
  workspaceBytes: 1024 * MB,
  embedTtlSeconds: 300,
  retentionDays: 30,
  /** An upload session not committed within this many hours is swept. */
  uploadTtlHours: 24,
  csvRows: 5000,
} as const;
```

`packages/contract/src/model.ts`:

```ts
import { z } from 'zod';

export const OUTCOMES = ['approved', 'completed', 'rejected', 'failed', 'abandoned', 'superseded', 'in-progress'] as const;
export type Outcome = (typeof OUTCOMES)[number];

/** How the content origin shows a file (spec §9 table). `download` is every kind not rendered. */
export const VIEWS = [
  'html', 'markdown', 'image', 'svg', 'pdf', 'code', 'text', 'json', 'yaml', 'toml',
  'csv', 'tsv', 'ipynb', 'mermaid', 'graphviz', 'audio', 'video', 'download',
] as const;
export type View = (typeof VIEWS)[number];

/** `workspace`, or a Superpipeline board (`brd_` + 16 hex, Superpipeline's `newId`). */
export const SCOPE_RE = /^(workspace|board:brd_[0-9a-f]{16})$/;
export type Scope = 'workspace' | `board:${string}`;

/** Grant scopes for agents and services (phases 2-3). Product vocabulary: Accounts carries them verbatim. */
export const LIBRARY_SCOPES = ['library:read', 'library:write', 'library:admin'] as const;

const SHA256 = /^[0-9a-f]{64}$/;

export const UploadCreate = z.object({
  title: z.string().trim().min(1).max(200),
  scope: z.string().regex(SCOPE_RE).default('workspace'),
  /** Upload a new version of this item (plan decision D17). */
  item: z.string().regex(/^itm_[0-9a-f]{16}$/).optional(),
  /** The file a folder opens on. Defaults to index.html, then README.md, then the first path. */
  entry: z.string().min(1).max(1024).optional(),
  /** ISO 8601; the item is deleted at this time (spec §12). */
  expiresAt: z.iso.datetime().optional(),
  files: z
    .array(z.object({ path: z.string().min(1).max(1024), bytes: z.number().int().min(0), sha256: z.string().regex(SHA256) }))
    .min(1),
});
export type UploadCreateBody = z.infer<typeof UploadCreate>;

export interface CommitResult {
  itemId: string;
  version: number;
  url: string;
  sha256: string;
  mediaType: string;
  bytes: number;
}

export interface EmbedGrant {
  url: string;
  downloadUrl: string | null;
  expiresAt: string;
  version: number;
  itemUrl: string;
}

export interface VersionSummary {
  version: number;
  entry: string;
  view: View;
  mediaType: string;
  totalBytes: number;
  fileCount: number;
  sha256: string;
  createdAt: string;
  revokedAt: string | null;
  scanOverride: boolean;
}

export interface ItemSummary {
  id: string;
  kind: 'artifact' | 'work-record';
  title: string;
  scope: Scope;
  outcome: Outcome;
  createdBy: string;
  createdAt: string;
  latestVersion: number;
  expiresAt: string | null;
  revokedAt: string | null;
}
```

`packages/contract/src/content.ts`:

```ts
/** Spec §9: the hosts the content origin may load from. Change it here and nowhere else (plan D3). */
const CDN = ["'self'", 'data:', 'blob:', 'https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net', 'https://unpkg.com'];
const FONTS = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'];
export const CONTENT_CSP_SOURCES = { cdn: CDN, fonts: FONTS } as const;

/** The content origin's CSP. No `form-action` (spec §9); `connect-src 'none'`. */
export function contentCsp(frameAncestors: string[]): string {
  const cdn = CDN.join(' ');
  const withFonts = `${cdn} ${FONTS.join(' ')}`;
  return [
    "default-src 'none'",
    `script-src ${cdn} 'unsafe-inline'`,
    `style-src ${withFonts} 'unsafe-inline'`,
    `img-src ${cdn}`,
    `font-src ${withFonts}`,
    `media-src ${cdn}`,
    "connect-src 'none'",
    `frame-ancestors ${frameAncestors.join(' ')}`,
  ].join('; ');
}

/** A path as a URL path: each segment encoded, the slashes kept. */
export function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

export function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

export interface ContentGrant {
  itemId: string;
  version: number;
  /** Unix seconds. */
  exp: number;
  /** The one origin the frame may post to (plan D18). */
  host: string;
}

/** What the API signs and the content Worker verifies. The item comes from the hostname, never the token. */
export function signingMessage(t: ContentGrant): Uint8Array {
  return new TextEncoder().encode(`superlibrary-content/v1\n${t.itemId}\n${t.version}\n${t.exp}\n${t.host}`);
}

/** `<version>.<exp>.<b64url host>.<b64url Ed25519 signature>` — path-safe, so it can sit in `/s/<token>/`. */
export function formatToken(t: { version: number; exp: number; host: string; sig: Uint8Array }): string {
  return `${t.version}.${t.exp}.${b64url(new TextEncoder().encode(t.host))}.${b64url(t.sig)}`;
}

export function parseToken(token: string): { version: number; exp: number; host: string; sig: Uint8Array } | null {
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [v, e, h, s] = parts as [string, string, string, string];
  if (!/^[1-9][0-9]{0,8}$/.test(v) || !/^[1-9][0-9]{0,11}$/.test(e)) return null;
  const hostBytes = fromB64url(h);
  const sig = fromB64url(s);
  if (!hostBytes || !sig || sig.length !== 64) return null;
  return { version: Number(v), exp: Number(e), host: new TextDecoder().decode(hostBytes), sig };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @superlibrary/contract test && pnpm --filter @superlibrary/contract typecheck
```

Expected: PASS (3 describe blocks, 10 tests).

- [ ] **Step 5: Add the CI test job**

`.github/workflows/ci.yml` (Superpipeline's `test` job, minus bun until Task 19 adds it):

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm test
```

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json .gitignore .github packages/contract
git commit -m "feat: monorepo, shared contract, CI test job

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---

### Task 2: The API Worker, its bindings, the D1 schema and the audit log

**Files:**
- Create: `apps/api/{package.json,tsconfig.json,wrangler.jsonc,vitest.config.ts}`, `apps/api/migrations/0001_core.sql`
- Create: `apps/api/src/{index,env,http,ids,audit}.ts`
- Test: `apps/api/test/{env.d.ts,setup.ts}`, `apps/api/test/schema.test.ts`, `apps/api/test/health.test.ts`

**Interfaces:**
- Consumes: `newId` from `@superlibrary/contract`.
- Produces:
  - `interface Env` (`src/env.ts`) with `DB`, `BLOBS: R2Bucket`, `RETENTION: Queue<RetentionMessage>`, vars `APP_URL`, `ORG_PLANE_ISSUER`, `ORG_PLANE_JWKS_URL`, `ORG_PLANE_AUDIENCE`, `CONTENT_ORIGIN_TEMPLATE`, `EMBED_HOSTS`, `RETENTION_MODE`, secret `URL_SIGNING_PRIVATE_KEY`, `DEV_AUTH?`
  - `type RetentionMessage = { type: 'sweep'; at: string }`
  - `json(body: unknown, status?: number, headers?: HeadersInit): Response`, `error(status: number, code: string, extra?: Record<string, unknown>): Response` (`src/http.ts`) — every error body is `{ error: <code>, ...extra }`
  - `audit(db: D1Database, e: AuditEvent): D1PreparedStatement` and `type AuditEvent = { workspaceId: string | null; actor: string; act?: string | null; action: string; itemId?: string | null; version?: number | null; detail?: Record<string, unknown> }` (`src/audit.ts`) — returns a statement so callers put it in the same `db.batch` as the change it records
  - Tables in `0001_core.sql` exactly as below; later tasks use these column names.

- [ ] **Step 1: Write the failing tests**

```bash
mkdir -p apps/api/src apps/api/test apps/api/migrations
```

`apps/api/test/env.d.ts` (Superpipeline's, plus the migrations binding):

```ts
/// <reference types="@cloudflare/vitest-pool-workers/types" />
import type { Env as WorkerEnv } from '../src/env';

declare global {
  namespace Cloudflare {
    interface Env extends WorkerEnv {
      TEST_MIGRATIONS: import('cloudflare:test').D1Migration[];
    }
  }
}
export {};
```

`apps/api/test/setup.ts`:

```ts
import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeAll } from 'vitest';

// The real migration files, applied by the pool's own splitter (it keeps CREATE TRIGGER … END
// whole). Superpipeline mirrors statements by hand and splits on ';', which would cut a trigger.
beforeAll(() => applyD1Migrations(env.DB, env.TEST_MIGRATIONS));
```

`apps/api/test/schema.test.ts`:

```ts
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { audit } from '../src/audit';

const db = () => env.DB;

async function seedVersion(itemId: string) {
  await db().batch([
    db().prepare(`INSERT OR IGNORE INTO workspaces (id, external_source, external_id) VALUES ('wsp_0000000000000001', 'org-plane', 'org_00000000000000000a01')`),
    db().prepare(`INSERT INTO items (id, workspace_id, kind, title, scope, created_by) VALUES (?, 'wsp_0000000000000001', 'artifact', 't', 'workspace', 'prn_000000000000000000a1')`).bind(itemId),
    db().prepare(`INSERT INTO versions (item_id, version, entry, view, media_type, total_bytes, file_count, sha256, created_by) VALUES (?, 1, 'a.md', 'markdown', 'text/markdown; charset=utf-8', 3, 1, ?, 'prn_000000000000000000a1')`).bind(itemId, 'a'.repeat(64)),
    db().prepare(`INSERT INTO version_files (item_id, version, path, sha256, bytes, media_type, view) VALUES (?, 1, 'a.md', ?, 3, 'text/markdown; charset=utf-8', 'markdown')`).bind(itemId, 'a'.repeat(64)),
  ]);
}

describe('schema', () => {
  it('versions are immutable: content columns cannot change', async () => {
    await seedVersion('itm_00000000000000a1');
    await expect(db().prepare(`UPDATE versions SET sha256 = ? WHERE item_id = 'itm_00000000000000a1'`).bind('b'.repeat(64)).run()).rejects.toThrow(/versions are immutable/);
    await expect(db().prepare(`UPDATE version_files SET sha256 = ? WHERE item_id = 'itm_00000000000000a1'`).bind('b'.repeat(64)).run()).rejects.toThrow(/versions are immutable/);
    // Revocation is not a content change.
    await db().prepare(`UPDATE versions SET revoked_at = datetime('now'), revoked_by = 'prn_000000000000000000a1' WHERE item_id = 'itm_00000000000000a1'`).run();
  });

  it('the audit log is append-only', async () => {
    await audit(db(), { workspaceId: 'wsp_0000000000000001', actor: 'prn_000000000000000000a1', action: 'item.read', itemId: 'itm_00000000000000a1' }).run();
    await expect(db().prepare(`UPDATE audit_events SET action = 'x'`).run()).rejects.toThrow(/append-only/);
    await expect(db().prepare(`DELETE FROM audit_events`).run()).rejects.toThrow(/append-only/);
  });

  it('one workspace per organization-plane org', async () => {
    await db().prepare(`INSERT OR IGNORE INTO workspaces (id, external_source, external_id) VALUES ('wsp_0000000000000002', 'org-plane', 'org_00000000000000000a01')`).run();
    const n = await db().prepare(`SELECT COUNT(*) AS n FROM workspaces WHERE external_id = 'org_00000000000000000a01'`).first<{ n: number }>();
    expect(n?.n).toBe(1);
  });

  it('refuses an unknown scope or outcome', async () => {
    await expect(db().prepare(`INSERT INTO items (id, workspace_id, kind, title, scope, created_by) VALUES ('itm_00000000000000a2', 'wsp_0000000000000001', 'artifact', 't', 'public', 'prn_000000000000000000a1')`).run()).rejects.toThrow(/CHECK/);
    await expect(db().prepare(`INSERT INTO items (id, workspace_id, kind, title, scope, outcome, created_by) VALUES ('itm_00000000000000a3', 'wsp_0000000000000001', 'artifact', 't', 'workspace', 'great', 'prn_000000000000000000a1')`).run()).rejects.toThrow(/CHECK/);
  });
});
```

`apps/api/test/health.test.ts`:

```ts
import { SELF } from 'cloudflare:test';
import { expect, it } from 'vitest';

it('answers /api/health', async () => {
  const res = await SELF.fetch('https://api.test/api/health');
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true, service: 'superlibrary-api' });
});

it('answers an unknown /api path with a JSON 404', async () => {
  const res = await SELF.fetch('https://api.test/api/v1/nothing');
  expect(res.status).toBe(404);
  expect(await res.json()).toEqual({ error: 'not_found' });
});
```

- [ ] **Step 2: Write the Worker configuration, then run the tests to verify they fail**

`apps/api/package.json`:

```json
{
  "name": "@superlibrary/api",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "dev": "wrangler dev --port 8787 --var DEV_AUTH:true --var ORG_PLANE_ISSUER: --var ORG_PLANE_JWKS_URL: --var ORG_PLANE_AUDIENCE: --var APP_URL:http://localhost:5173 --var CONTENT_ORIGIN_TEMPLATE:http://{label}.localhost:8788 --var EMBED_HOSTS:",
    "deploy": "wrangler deploy",
    "db:migrate:local": "wrangler d1 migrations apply superlibrary-catalog --local",
    "db:migrate": "wrangler d1 migrations apply superlibrary-catalog --remote"
  },
  "dependencies": {
    "@superlibrary/contract": "workspace:*",
    "jose": "^6.2.8",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "^0.16.18",
    "@cloudflare/workers-types": "^4.20260619.1",
    "wrangler": "^4.103.0"
  }
}
```

`apps/api/tsconfig.json`:

```json
{ "extends": "../../tsconfig.base.json", "compilerOptions": { "types": ["@cloudflare/workers-types"] }, "include": ["src", "test"] }
```

`apps/api/wrangler.jsonc`:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "superlibrary-api",
  "main": "src/index.ts",
  "compatibility_date": "2025-11-01",
  "compatibility_flags": ["nodejs_compat"],
  "observability": { "enabled": true, "logs": { "enabled": true, "invocation_logs": true } },
  // DEV_AUTH is deliberately NOT set here (Superpipeline's rule): dev headers are a full credential,
  // opted into by `pnpm dev` and the test runner only.
  "vars": {
    // The Organization plane (accounts issuer contract §1). Plain vars, not secrets: they name whom to
    // believe and grant nothing. Changed only through a merged PR.
    "ORG_PLANE_ISSUER": "https://accounts.superjackfruit.com",
    "ORG_PLANE_JWKS_URL": "https://accounts.superjackfruit.com/api/auth/jwks",
    "ORG_PLANE_AUDIENCE": "https://app.superlibrary.dev",
    // This deployment's own origin: the audience, the item links, the default frame host.
    "APP_URL": "https://app.superlibrary.dev",
    "CONTENT_ORIGIN_TEMPLATE": "https://{label}.superlibrarycontent.dev",
    // Other products that may mint embed URLs from the browser (spec §9, Embedding). Must equal the
    // content Worker's FRAME_ANCESTORS minus APP_URL — test/embed-hosts.test.ts holds the two together.
    "EMBED_HOSTS": "https://app.superpipeline.dev https://console.agentpod.dev",
    // Plan decision D14: "report" until phase 2 brings references; then "enforce".
    "RETENTION_MODE": "report"
  },
  // URL_SIGNING_PRIVATE_KEY is a secret: `wrangler secret put URL_SIGNING_PRIVATE_KEY` (Task 21 Step 4).
  "d1_databases": [
    { "binding": "DB", "database_name": "superlibrary-catalog", "database_id": "00000000-0000-0000-0000-000000000000", "migrations_dir": "migrations" }
  ],
  "r2_buckets": [{ "binding": "BLOBS", "bucket_name": "superlibrary-blobs" }],
  "queues": {
    "producers": [{ "binding": "RETENTION", "queue": "superlibrary-retention" }],
    "consumers": [{ "queue": "superlibrary-retention", "max_batch_size": 1, "max_retries": 5 }]
  },
  // The daily sweep enqueues one message; the consumer does the work (spec §6 `retention` queue).
  "triggers": { "crons": ["0 3 * * *"] },
  // Same hostname as the Pages app (plan decision D1). Declared here, not clicked in the dashboard.
  "routes": [
    { "pattern": "app.superlibrary.dev/api/*", "zone_name": "superlibrary.dev" },
    { "pattern": "app.superlibrary.dev/.well-known/oauth-protected-resource", "zone_name": "superlibrary.dev" }
  ]
}
```

The all-zero `database_id` is replaced in Task 21 Step 2 with the id `wrangler d1 create` prints; local dev and tests do not read it.

`apps/api/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';

// Superpipeline's shape (apps/api/vitest.config.ts): the Workers runtime from our wrangler config,
// with dev auth opted in here only and the plane off unless a test turns it on.
export default defineConfig(async () => {
  const migrations = await readD1Migrations('./migrations');
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            DEV_AUTH: 'true',
            APP_URL: 'https://api.test',
            CONTENT_ORIGIN_TEMPLATE: 'https://{label}.content.test',
            EMBED_HOSTS: 'https://host.test',
            RETENTION_MODE: 'report',
            ORG_PLANE_ISSUER: '',
            ORG_PLANE_JWKS_URL: '',
            ORG_PLANE_AUDIENCE: '',
          },
        },
      }),
    ],
    test: { include: ['test/**/*.test.ts'], setupFiles: ['./test/setup.ts'] },
  };
});
```

Run:

```bash
pnpm install && pnpm --filter @superlibrary/api test
```

Expected: FAIL — `src/index.ts` does not exist.

- [ ] **Step 3: Write the migration and the Worker**

`apps/api/migrations/0001_core.sql`:

```sql
-- Superlibrary's catalog (spec §3, §8, §12). Workspaces are the organization plane's orgs, mapped
-- as Superpipeline maps its tenants: external_source = 'org-plane', external_id = org_ (issuer
-- contract §2), one row per org (Superpipeline migration 0017).
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  external_source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  quota_bytes INTEGER NOT NULL DEFAULT 1073741824,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX workspaces_external_unique ON workspaces(external_source, external_id);

-- The plane's token carries no role. First person seen is owner (Superpipeline provisionOrgHuman).
CREATE TABLE members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  principal_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (workspace_id, principal_id)
);

CREATE TABLE items (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  kind TEXT NOT NULL CHECK (kind IN ('artifact', 'work-record')),
  title TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope = 'workspace' OR (scope GLOB 'board:brd_*' AND length(scope) = 26)),
  outcome TEXT NOT NULL DEFAULT 'completed'
    CHECK (outcome IN ('approved', 'completed', 'rejected', 'failed', 'abandoned', 'superseded', 'in-progress')),
  created_by TEXT NOT NULL,
  latest_version INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  revoked_at TEXT,
  revoked_by TEXT,
  revoke_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX items_workspace_created ON items(workspace_id, created_at);

CREATE TABLE versions (
  item_id TEXT NOT NULL REFERENCES items(id),
  version INTEGER NOT NULL,
  entry TEXT NOT NULL,
  view TEXT NOT NULL,
  media_type TEXT NOT NULL,
  total_bytes INTEGER NOT NULL,
  file_count INTEGER NOT NULL,
  -- The file's SHA-256 for one file; for a folder, the SHA-256 of its sorted (path, sha256) list.
  sha256 TEXT NOT NULL,
  created_by TEXT NOT NULL,
  scan_override INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at TEXT,
  revoked_by TEXT,
  PRIMARY KEY (item_id, version)
);
-- Spec §3: a version is an immutable snapshot. Only revocation may change a row.
CREATE TRIGGER versions_immutable
  BEFORE UPDATE OF item_id, version, entry, view, media_type, total_bytes, file_count, sha256, created_by, scan_override, created_at ON versions
BEGIN
  SELECT RAISE(ABORT, 'versions are immutable');
END;

CREATE TABLE version_files (
  item_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  media_type TEXT NOT NULL,
  view TEXT NOT NULL,
  PRIMARY KEY (item_id, version, path),
  FOREIGN KEY (item_id, version) REFERENCES versions(item_id, version)
);
CREATE INDEX version_files_sha ON version_files(sha256);
CREATE TRIGGER version_files_immutable BEFORE UPDATE ON version_files
BEGIN
  SELECT RAISE(ABORT, 'versions are immutable');
END;

-- Plan decision D16: an upload declares its files, sends them one by one, then commits.
CREATE TABLE upload_sessions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  created_by TEXT NOT NULL,
  item_id TEXT,
  title TEXT NOT NULL,
  scope TEXT NOT NULL,
  entry TEXT NOT NULL,
  item_expires_at TEXT,
  expires_at TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'committed')),
  result_item_id TEXT,
  result_version INTEGER,
  override_reason TEXT,
  override_by TEXT,
  override_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE upload_files (
  session_id TEXT NOT NULL REFERENCES upload_sessions(id),
  path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  received INTEGER NOT NULL DEFAULT 0,
  media_type TEXT,
  view TEXT,
  PRIMARY KEY (session_id, path)
);
CREATE INDEX upload_files_sha ON upload_files(sha256);
CREATE TABLE secret_findings (
  session_id TEXT NOT NULL,
  path TEXT NOT NULL,
  line INTEGER NOT NULL,
  rule TEXT NOT NULL,
  PRIMARY KEY (session_id, path, line, rule)
);

-- Spec §12: an artifact referenced by a work record, a card or a collection is kept. Phase 2 and
-- phase 4 write these rows; phase 1 only reads them.
CREATE TABLE item_references (
  item_id TEXT NOT NULL REFERENCES items(id),
  from_kind TEXT NOT NULL CHECK (from_kind IN ('work-record', 'card', 'collection')),
  from_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (item_id, from_kind, from_id)
);

-- Spec §8: every read is written to the audit log. Append-only, as in Accounts' 0001.
CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT,
  actor TEXT NOT NULL,
  act TEXT,
  action TEXT NOT NULL,
  item_id TEXT,
  version INTEGER,
  detail TEXT NOT NULL DEFAULT '{}',
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX audit_events_item ON audit_events(item_id, at);
CREATE TRIGGER audit_events_no_update BEFORE UPDATE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'the audit log is append-only');
END;
CREATE TRIGGER audit_events_no_delete BEFORE DELETE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'the audit log is append-only');
END;
```

`apps/api/src/env.ts`:

```ts
export type RetentionMessage = { type: 'sweep'; at: string };

export interface Env {
  DB: D1Database;
  /** Artifact bytes at `blobs/<sha256>`, version manifests at `manifests/<itemId>/<version>.json`. */
  BLOBS: R2Bucket;
  RETENTION: Queue<RetentionMessage>;
  APP_URL: string;
  /** Unset or empty: the plane is off (dev and tests only). Set: tokens are verified offline. */
  ORG_PLANE_ISSUER?: string;
  ORG_PLANE_JWKS_URL?: string;
  ORG_PLANE_AUDIENCE?: string;
  /** `https://{label}.superlibrarycontent.dev`; `{label}` is `contentLabel(itemId)`. */
  CONTENT_ORIGIN_TEMPLATE: string;
  /** Space-separated origins, besides APP_URL, that may mint embed URLs from a browser. */
  EMBED_HOSTS: string;
  RETENTION_MODE: 'report' | 'enforce';
  /** Ed25519 private JWK as JSON (secret). */
  URL_SIGNING_PRIVATE_KEY?: string;
  /** "true" accepts X-Dev-Principal / X-Dev-Org as a person. Never in wrangler.jsonc. */
  DEV_AUTH?: string;
}
```

`apps/api/src/ids.ts`:

```ts
export { newId } from '@superlibrary/contract';
```

`apps/api/src/http.ts`:

```ts
export function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

/** Every refusal names itself: `{ error: <code>, ... }`, never a bare status. */
export function error(status: number, code: string, extra: Record<string, unknown> = {}): Response {
  return json({ error: code, ...extra }, status);
}
```

`apps/api/src/audit.ts`:

```ts
import { newId } from './ids';

export interface AuditEvent {
  workspaceId: string | null;
  /** The principal who acted, or `retention` for the sweep. */
  actor: string;
  /** `act.sub` when a service acted for the principal (recorded, never authority). */
  act?: string | null;
  action: string;
  itemId?: string | null;
  version?: number | null;
  detail?: Record<string, unknown>;
}

/** A statement, not a write: batch it with the change it records so neither lands alone. */
export function audit(db: D1Database, e: AuditEvent): D1PreparedStatement {
  return db
    .prepare(`INSERT INTO audit_events (id, workspace_id, actor, act, action, item_id, version, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(newId('aud'), e.workspaceId, e.actor, e.act ?? null, e.action, e.itemId ?? null, e.version ?? null, JSON.stringify(e.detail ?? {}));
}
```

`apps/api/src/index.ts`:

```ts
/**
 * superlibrary-api: REST at app.superlibrary.dev/api/* (plan decision D1). Routes are added by
 * later tasks to `route` below; each returns null when the path is not theirs.
 */
import type { Env, RetentionMessage } from './env';
import { error, json } from './http';

type Handler = (request: Request, env: Env, ctx: ExecutionContext, url: URL) => Promise<Response | null>;
const handlers: Handler[] = [];

async function route(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/api/health') return json({ ok: true, service: 'superlibrary-api' });
  for (const h of handlers) {
    const res = await h(request, env, ctx, url);
    if (res) return res;
  }
  return error(404, 'not_found');
}

export default {
  async fetch(request, env, ctx) {
    try {
      return await route(request, env, ctx);
    } catch (e) {
      console.error('unexpected', e instanceof Error ? e.message : String(e));
      return error(500, 'unexpected');
    }
  },
  async queue(batch: MessageBatch<RetentionMessage>, env: Env) {
    for (const m of batch.messages) m.ack();
  },
  async scheduled(_c: ScheduledController, _env: Env) {},
} satisfies ExportedHandler<Env, RetentionMessage>;
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm --filter @superlibrary/api test && pnpm --filter @superlibrary/api typecheck
```

Expected: PASS (`schema.test.ts` 4, `health.test.ts` 2).

- [ ] **Step 5: Commit**

```bash
git add apps/api pnpm-lock.yaml
git commit -m "feat(api): Worker skeleton, D1 schema with immutable versions and append-only audit

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---

### Task 3: Organization-plane tokens, verified offline, and the person calling

**Files:**
- Create: `apps/api/src/auth/jws.ts`, `apps/api/src/auth/org-plane.ts`, `apps/api/src/auth/caller.ts`
- Modify: `apps/api/src/index.ts` (register `/api/v1/me` and the protected-resource metadata)
- Test: `apps/api/test/helpers/org-plane.ts`, `apps/api/test/auth.test.ts`

**Interfaces:**
- Consumes: `Env`, `json`, `error`, `newId`.
- Produces:
  - `verifyJws(token: string, opts: JwsOptions): Promise<JWTPayload | null>`, `__resetJwksCacheForTests(): void` (`auth/jws.ts`)
  - `orgPlaneMode(env): { kind: 'off' } | { kind: 'invalid'; reason: string } | { kind: 'on'; cfg: { issuer: string; jwksUrl: string; audience: string } }`, `verifyOrgPlaneToken(token, cfg): Promise<OrgPlaneClaims | null>`, `ORG_PLANE_PRODUCT = 'superlibrary'`, `ORG_PLANE_SOURCE = 'org-plane'`, `protectedResourceMetadata(env): Response | null` (`auth/org-plane.ts`)
  - `interface Person { principalId: string; org: string; workspaceId: string; role: 'owner' | 'member'; act: string | null }` and `resolvePerson(request: Request, env: Env): Promise<Person | Response>` (`auth/caller.ts`) — every later route starts with `const p = await resolvePerson(request, env); if (p instanceof Response) return p;`
  - Test helpers `planeToken(over?, opts?)`, `withOrgPlane(fn)`, `devHeaders(principal?, org?)`, constants `ORG`, `OTHER_ORG`, `HUMAN`, `HUMAN_2`, `AGENT`, `APP_AUD = 'https://api.test'`.

- [ ] **Step 1: Write the failing tests**

`apps/api/test/helpers/org-plane.ts` (Superpipeline's `test/helpers/org-plane.ts`, entitled to `superlibrary`, three vars instead of four, plus dev headers):

```ts
import { env } from 'cloudflare:test';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import { __resetJwksCacheForTests } from '../../src/auth/jws';

export const PLANE = 'https://accounts.test';
export const PLANE_JWKS = `${PLANE}/api/auth/jwks`;
export const APP_AUD = 'https://api.test';
export const ORG = 'org_00000000000000000a01';
export const OTHER_ORG = 'org_00000000000000000b02';
export const HUMAN = 'prn_000000000000000000a1';
export const HUMAN_2 = 'prn_000000000000000000a5';
export const AGENT = 'prn_000000000000000000a2';
export const KID = 'plane-kid-1';

export const PLANE_ENV = { ORG_PLANE_ISSUER: PLANE, ORG_PLANE_JWKS_URL: PLANE_JWKS, ORG_PLANE_AUDIENCE: APP_AUD } as const;

let once: Promise<{ privateKey: CryptoKey; jwksBody: string }> | null = null;
export function planeKeys() {
  once ??= (async () => {
    const pair = await generateKeyPair('EdDSA', { extractable: true });
    const jwk = await exportJWK(pair.publicKey);
    return { privateKey: pair.privateKey, jwksBody: JSON.stringify({ keys: [{ ...jwk, alg: 'EdDSA', kid: KID }] }) };
  })();
  return once;
}

/** A human in ORG entitled to superlibrary, `aud` as the array the OAuth provider issues. */
export async function planeToken(
  over: Record<string, unknown> = {},
  opts: { aud?: string | string[]; iss?: string; kid?: string; exp?: string; alg?: 'EdDSA' } = {},
): Promise<string> {
  const { privateKey } = await planeKeys();
  const payload: Record<string, unknown> = {
    sub: HUMAN, principalKind: 'human', org: ORG, ent: ['superlibrary'], mayDispatch: [], mayGrantReach: false,
    jti: crypto.randomUUID(), email: 'person@example.com', email_verified: true, ...over,
  };
  for (const [k, v] of Object.entries(payload)) if (v === undefined) delete payload[k];
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'EdDSA', kid: opts.kid ?? KID })
    .setIssuer(opts.iss ?? PLANE)
    .setAudience(opts.aud ?? [APP_AUD, `${PLANE}/api/auth/oauth2/userinfo`])
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? '5m')
    .sign(privateKey);
}

/** Plane mode on for SELF.fetch tests; every outbound URL recorded so "no network" is measured. */
export async function withOrgPlane<T>(fn: (calls: string[]) => Promise<T>): Promise<T> {
  const { jwksBody } = await planeKeys();
  const realFetch = globalThis.fetch;
  const calls: string[] = [];
  const bag = env as unknown as Record<string, unknown>;
  Object.assign(bag, PLANE_ENV);
  __resetJwksCacheForTests();
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    calls.push(url);
    if (url === PLANE_JWKS) return new Response(jwksBody, { headers: { 'content-type': 'application/json' } });
    return realFetch(input as RequestInfo, init);
  }) as typeof fetch;
  try {
    return await fn(calls);
  } finally {
    globalThis.fetch = realFetch;
    for (const k of Object.keys(PLANE_ENV)) bag[k] = '';
    __resetJwksCacheForTests();
  }
}

/** DEV_AUTH headers (the suite runs with DEV_AUTH on, plane off). */
export function devHeaders(principal = HUMAN, org = ORG): Record<string, string> {
  return { 'X-Dev-Principal': principal, 'X-Dev-Org': org };
}
```

`apps/api/test/auth.test.ts`:

```ts
import { SELF, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { AGENT, APP_AUD, HUMAN, HUMAN_2, ORG, OTHER_ORG, PLANE, devHeaders, planeToken, withOrgPlane } from './helpers/org-plane';

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
```

Run:

```bash
pnpm --filter @superlibrary/api test test/auth.test.ts
```

Expected: FAIL — `Failed to resolve import "../../src/auth/jws"`.

- [ ] **Step 2: Implement offline verification**

`apps/api/src/auth/jws.ts` — Superpipeline's `verifyJws` and key-set cache (`apps/api/src/auth/hub-jwt.ts` at f81f3f5, lines from `interface CachedSet` to the end of `verifyJws`), without the hub-only `verifyHubToken`/`planeAudience`. Keep its reasoning in short comments:

```ts
/**
 * Offline verification of organization-plane tokens, copied from Superpipeline
 * (apps/api/src/auth/hub-jwt.ts): the key set is fetched by us, not by jose's createRemoteJWKSet,
 * so no failure escapes as an unhandled rejection; no network in the verify path while the cache
 * is warm; one refetch on an unknown kid; the last good set served when the issuer is down.
 */
import { createLocalJWKSet, jwtVerify, type JSONWebKeySet, type JWTPayload } from 'jose';

export interface JwsOptions {
  issuer: string;
  jwksUrl: string;
  /** This deployment's resource. Required, never defaulted to the issuer (Superpipeline 2026-09-20). */
  audience: string;
  requiredClaims: string[];
  fetch?: typeof fetch;
}

interface CachedSet {
  keys: JSONWebKeySet;
  verify: ReturnType<typeof createLocalJWKSet>;
  fetchedAt: number;
}

const cache = new Map<string, CachedSet>();
const inflight = new Map<string, Promise<CachedSet | null>>();
/** Issuer contract §1: cache ≤ 10 minutes. */
const JWKS_TTL_MS = 10 * 60 * 1000;

export function __resetJwksCacheForTests(): void {
  cache.clear();
  inflight.clear();
}

function hasKid(set: CachedSet | undefined, kid: string): boolean {
  return !!set && set.keys.keys.some((k) => k.kid === kid);
}

function fetchFresh(opts: JwsOptions): Promise<CachedSet | null> {
  const existing = inflight.get(opts.jwksUrl);
  if (existing) return existing;
  const promise = (async (): Promise<CachedSet | null> => {
    try {
      const res = await (opts.fetch ?? fetch)(opts.jwksUrl);
      if (!res.ok) return null;
      const keys = (await res.json()) as JSONWebKeySet;
      if (!Array.isArray(keys?.keys) || keys.keys.length === 0) return null;
      const fresh: CachedSet = { keys, verify: createLocalJWKSet(keys), fetchedAt: Date.now() };
      cache.set(opts.jwksUrl, fresh);
      return fresh;
    } catch {
      return null;
    }
  })();
  inflight.set(opts.jwksUrl, promise);
  promise.finally(() => {
    if (inflight.get(opts.jwksUrl) === promise) inflight.delete(opts.jwksUrl);
  });
  return promise;
}

async function keySet(opts: JwsOptions, kid: string): Promise<CachedSet | null> {
  const cached = cache.get(opts.jwksUrl);
  const isFresh = !!cached && Date.now() - cached.fetchedAt < JWKS_TTL_MS;
  if (isFresh && hasKid(cached, kid)) return cached;
  // Fresh but missing this kid: a rotation. Refetch once and fail closed if that fails.
  if (isFresh) return fetchFresh(opts);
  // Cold or expired: refresh, serving the last good set if the issuer is down.
  return (await fetchFresh(opts)) ?? cached ?? null;
}

/** The verified payload, or null for every failure (expired and forged are the same answer). */
export async function verifyJws(token: string, opts: JwsOptions): Promise<JWTPayload | null> {
  if (!token) return null;
  const header = token.split('.')[0];
  if (!header) return null;
  let kid: string;
  try {
    const decoded = JSON.parse(atob(header.replace(/-/g, '+').replace(/_/g, '/'))) as { alg?: unknown; kid?: unknown };
    // Checked before any key lookup: a bad alg or a missing kid must never trigger a refetch.
    if (decoded.alg !== 'EdDSA') return null;
    if (typeof decoded.kid !== 'string' || decoded.kid === '') return null;
    kid = decoded.kid;
  } catch {
    return null;
  }
  try {
    const set = await keySet(opts, kid);
    if (!set || !hasKid(set, kid)) return null;
    const { payload } = await jwtVerify(token, set.verify, {
      issuer: opts.issuer,
      audience: opts.audience,
      requiredClaims: opts.requiredClaims,
      algorithms: ['EdDSA'],
    });
    return payload;
  } catch {
    return null;
  }
}
```

`apps/api/src/auth/org-plane.ts` (Superpipeline's `org-plane.ts`, product `superlibrary`, no MCP audience in phase 1):

```ts
import type { JWTPayload } from 'jose';
import type { Env } from '../env';
import { verifyJws } from './jws';

export const ORG_PLANE_PRODUCT = 'superlibrary';
export const ORG_PLANE_SOURCE = 'org-plane';
const PRN = /^prn_[0-9a-f]{20}$/;
const ORG = /^org_[0-9a-f]{20}$/;

export interface OrgPlaneConfig { issuer: string; jwksUrl: string; audience: string }
export type OrgPlaneMode = { kind: 'off' } | { kind: 'invalid'; reason: string } | { kind: 'on'; cfg: OrgPlaneConfig };

/** https (http only on loopback), no credentials, query or fragment; else null. */
function safeUrl(raw: string | undefined): string | null {
  const s = (raw ?? '').trim();
  if (s === '') return null;
  try {
    const u = new URL(s);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && loopback)) return null;
    if (u.username || u.password || u.search || u.hash) return null;
    return s;
  } catch {
    return null;
  }
}

export function orgPlaneMode(env: Pick<Env, 'ORG_PLANE_ISSUER' | 'ORG_PLANE_JWKS_URL' | 'ORG_PLANE_AUDIENCE'>): OrgPlaneMode {
  if ((env.ORG_PLANE_ISSUER ?? '').trim() === '') return { kind: 'off' };
  const issuer = safeUrl(env.ORG_PLANE_ISSUER);
  if (!issuer) return { kind: 'invalid', reason: 'ORG_PLANE_ISSUER' };
  const jwksUrl = safeUrl(env.ORG_PLANE_JWKS_URL);
  if (!jwksUrl) return { kind: 'invalid', reason: 'ORG_PLANE_JWKS_URL' };
  const audience = safeUrl(env.ORG_PLANE_AUDIENCE);
  if (!audience) return { kind: 'invalid', reason: 'ORG_PLANE_AUDIENCE' };
  return { kind: 'on', cfg: { issuer, jwksUrl, audience } };
}

export interface OrgPlaneClaims extends JWTPayload {
  sub: string;
  principalKind: 'human' | 'agent' | 'service';
  org: string;
  ent: string[];
  scope?: string;
  act?: { sub?: string };
}

const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

export async function verifyOrgPlaneToken(token: string, cfg: OrgPlaneConfig): Promise<OrgPlaneClaims | null> {
  const p = await verifyJws(token, { issuer: cfg.issuer, jwksUrl: cfg.jwksUrl, audience: cfg.audience, requiredClaims: ['exp', 'iat', 'jti', 'sub'] });
  if (!p) return null;
  if (typeof p.sub !== 'string' || !PRN.test(p.sub)) return null;
  const kind = p.principalKind;
  if (kind !== 'human' && kind !== 'agent' && kind !== 'service') return null;
  if (typeof p.org !== 'string' || !ORG.test(p.org)) return null;
  if (!strings(p.ent)) return null;
  return p as OrgPlaneClaims;
}

/** RFC 9728, as Superpipeline serves it (apps/api/src/mcp/auth.ts). Null when the plane is off. */
export function protectedResourceMetadata(env: Env): Response | null {
  const mode = orgPlaneMode(env);
  if (mode.kind !== 'on') return null;
  return Response.json({
    resource: mode.cfg.audience,
    authorization_servers: [mode.cfg.issuer],
    bearer_methods_supported: ['header'],
    scopes_supported: ['openid', 'profile', 'email', 'offline_access'],
    resource_name: 'Superlibrary',
  });
}
```

- [ ] **Step 3: Implement the caller and first sight**

`apps/api/src/auth/caller.ts`:

```ts
/**
 * Who is calling: a person in an entitled workspace, or a refusal. The workspace is created on first
 * sight (issuer contract §2), the person joins it as owner if first, member otherwise — one
 * statement each, as Superpipeline's ensureOrgTenant/provisionOrgHuman do, so concurrent first
 * requests cannot make two workspaces or two owners.
 */
import type { Env } from '../env';
import { error } from '../http';
import { newId } from '../ids';
import { ORG_PLANE_PRODUCT, ORG_PLANE_SOURCE, orgPlaneMode, verifyOrgPlaneToken, type OrgPlaneClaims } from './org-plane';

export interface Person {
  principalId: string;
  org: string;
  workspaceId: string;
  role: 'owner' | 'member';
  act: string | null;
}

const PRN = /^prn_[0-9a-f]{20}$/;
const ORG = /^org_[0-9a-f]{20}$/;

function bearerOf(request: Request): string | null {
  const m = (request.headers.get('Authorization') ?? '').match(/^Bearer\s+(.+)$/i);
  return m ? m[1]!.trim() : null;
}

function signInRequired(env: Env): Response {
  const res = error(401, 'sign_in_required');
  res.headers.set('WWW-Authenticate', `Bearer resource_metadata="${env.APP_URL}/.well-known/oauth-protected-resource"`);
  return res;
}

export async function ensureWorkspace(db: D1Database, org: string): Promise<string> {
  await db
    .prepare(`INSERT OR IGNORE INTO workspaces (id, external_source, external_id) VALUES (?, ?, ?)`)
    .bind(newId('wsp'), ORG_PLANE_SOURCE, org)
    .run();
  const row = await db.prepare(`SELECT id FROM workspaces WHERE external_source = ? AND external_id = ?`).bind(ORG_PLANE_SOURCE, org).first<{ id: string }>();
  if (!row) throw new Error('first sight could not create the workspace');
  return row.id;
}

export async function ensureMember(db: D1Database, workspaceId: string, principalId: string): Promise<'owner' | 'member'> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO members (workspace_id, principal_id, role)
       SELECT ?1, ?2, CASE WHEN EXISTS (SELECT 1 FROM members WHERE workspace_id = ?1) THEN 'member' ELSE 'owner' END`,
    )
    .bind(workspaceId, principalId)
    .run();
  const row = await db.prepare(`SELECT role FROM members WHERE workspace_id = ? AND principal_id = ?`).bind(workspaceId, principalId).first<{ role: 'owner' | 'member' }>();
  if (!row) throw new Error('could not record the membership');
  return row.role;
}

async function claimsOf(request: Request, env: Env): Promise<OrgPlaneClaims | Response> {
  const mode = orgPlaneMode(env);
  if (mode.kind === 'invalid') return error(500, 'misconfigured', { setting: mode.reason });
  if (mode.kind === 'off') {
    if (env.DEV_AUTH !== 'true') return signInRequired(env);
    const sub = request.headers.get('X-Dev-Principal') ?? '';
    const org = request.headers.get('X-Dev-Org') ?? '';
    if (!PRN.test(sub) || !ORG.test(org)) return signInRequired(env);
    return { sub, org, principalKind: 'human', ent: [ORG_PLANE_PRODUCT] };
  }
  const token = bearerOf(request);
  if (!token || token.split('.').length !== 3) return signInRequired(env);
  return (await verifyOrgPlaneToken(token, mode.cfg)) ?? signInRequired(env);
}

export async function resolvePerson(request: Request, env: Env): Promise<Person | Response> {
  const claims = await claimsOf(request, env);
  if (claims instanceof Response) return claims;
  if (!claims.ent.includes(ORG_PLANE_PRODUCT)) return error(403, 'product_not_enabled', { org: claims.org });
  if (claims.principalKind !== 'human') {
    return error(403, 'principal_not_supported', { detail: 'only a person may use Superlibrary in this release' });
  }
  const workspaceId = await ensureWorkspace(env.DB, claims.org);
  const role = await ensureMember(env.DB, workspaceId, claims.sub);
  return { principalId: claims.sub, org: claims.org, workspaceId, role, act: claims.act?.sub ?? null };
}
```

In `apps/api/src/index.ts`, add the two routes before the handler loop:

```ts
import { protectedResourceMetadata } from './auth/org-plane';
import { resolvePerson } from './auth/caller';
// … inside route(), after the health check:
  if (url.pathname === '/.well-known/oauth-protected-resource') return protectedResourceMetadata(env) ?? error(404, 'not_found');
  if (url.pathname === '/api/v1/me' && request.method === 'GET') {
    const p = await resolvePerson(request, env);
    if (p instanceof Response) return p;
    return json({ principalId: p.principalId, org: p.org, workspaceId: p.workspaceId, role: p.role });
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm --filter @superlibrary/api test && pnpm --filter @superlibrary/api typecheck
```

Expected: PASS. Then revert-proof the entitlement guard (memory rule: every guard must be seen failing): change `if (!claims.ent.includes(ORG_PLANE_PRODUCT))` to `if (false)`, rerun, see `product_not_enabled` fail, restore.

- [ ] **Step 5: Commit**

```bash
git add apps/api
git commit -m "feat(api): verify organization-plane tokens offline; first sight; product_not_enabled

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

This ends PR 1 (`feat/phase-1-scaffold`, Tasks 1-3). Open it with the PR recipe at the top of Task 21 and wait for the operator's merge; PR 2 branches from the merged `main` as `feat/phase-1-artifacts`.

---

### Task 4: Path rules, shared by the API, the web app and `suli`

**Files:**
- Create: `packages/contract/src/paths.ts`
- Modify: `packages/contract/src/index.ts` (export it)
- Test: `packages/contract/test/paths.test.ts`

**Interfaces:**
- Produces: `checkPath(raw: string): { ok: true; path: string } | { ok: false; path: string; reason: PathRefusal }` and `type PathRefusal = 'empty' | 'too_long' | 'control_character' | 'backslash' | 'absolute' | 'parent' | 'denied'`; `DENIED_RULES: ReadonlyArray<{ rule: string; test: (segments: string[]) => boolean }>`. The API (Task 7) refuses with `400 { error: 'path_refused', path, reason, rule? }`; the web app (Task 16) and `suli` (Task 20) pre-check with the same function so people see the refusal before uploading.

- [ ] **Step 1: Write the failing test**

`packages/contract/test/paths.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { checkPath } from '../src/paths';

describe('checkPath (spec §8 path rules)', () => {
  it('normalises harmless paths', () => {
    expect(checkPath('a.md')).toEqual({ ok: true, path: 'a.md' });
    expect(checkPath('./site//index.html')).toEqual({ ok: true, path: 'site/index.html' });
    expect(checkPath('img/a b#1?.png')).toEqual({ ok: true, path: 'img/a b#1?.png' });
    expect(checkPath('.gitignore')).toEqual({ ok: true, path: '.gitignore' });
    expect(checkPath('docs/.github/workflow.md').ok).toBe(true);
  });

  it('refuses paths that leave the root', () => {
    for (const [p, reason] of [
      ['../x', 'parent'], ['a/../../x', 'parent'], ['a/..', 'parent'],
      ['/etc/passwd', 'absolute'], ['C:/Users/x', 'absolute'], ['a\\b', 'backslash'],
      ['', 'empty'], ['./', 'empty'], ['a\u0000b', 'control_character'], ['x'.repeat(1025), 'too_long'],
    ] as const) {
      expect(checkPath(p)).toMatchObject({ ok: false, reason });
    }
  });

  it('refuses the default denylist wherever it appears in the path', () => {
    for (const p of [
      '.env', '.env.local', 'app/.env.production', '.ssh/id_ed25519', 'home/.ssh/config', '.gnupg/pubring.kbx',
      'certs/server.pem', 'tls/server.KEY', 'keys/id_rsa', 'id_ed25519.pub', '.git/config', 'repo/.git/HEAD',
      '.netrc', '.npmrc', 'pkg/.pypirc', '.aws/credentials', '.azure/accessTokens.json', '.config/gcloud/credentials.db',
      'application_default_credentials.json', '.docker/config.json', '.kube/config', '.git-credentials',
      '.claude/settings.json', '.claude.json', '.codex/auth.json', '.gemini/oauth_creds.json', '.cursor/mcp.json',
      '.config/opencode/auth.json', '.local/share/opencode/auth.json', '.config/goose/config.yaml',
    ]) {
      expect(checkPath(p), p).toMatchObject({ ok: false, reason: 'denied' });
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --filter @superlibrary/contract test test/paths.test.ts
```

Expected: FAIL — `Failed to resolve import "../src/paths"`.

- [ ] **Step 3: Implement**

`packages/contract/src/paths.ts`:

```ts
/**
 * Spec §8 path rules, one implementation for every client and the server. The server is the
 * authority (it checks every declared path); clients call this to refuse early with the same words.
 * A zip is expanded client-side (plan D16), so its entries reach here as ordinary paths; a symlink
 * entry is refused by the client before it is ever declared.
 */
export type PathRefusal = 'empty' | 'too_long' | 'control_character' | 'backslash' | 'absolute' | 'parent' | 'denied';
export type PathCheck = { ok: true; path: string } | { ok: false; path: string; reason: PathRefusal; rule?: string };

const lower = (s: string) => s.toLowerCase();
const anySeg = (pred: (s: string) => boolean) => (segs: string[]) => segs.some((s) => pred(lower(s)));
const dirSeg = (name: string) => (segs: string[]) => segs.slice(0, -1).some((s) => lower(s) === name);
const base = (pred: (s: string) => boolean) => (segs: string[]) => pred(lower(segs[segs.length - 1]!));
const sub = (...parts: string[]) => (segs: string[]) => {
  const l = segs.map(lower);
  for (let i = 0; i + parts.length <= l.length; i++) if (parts.every((p, j) => l[i + j] === p)) return true;
  return false;
};

/** Each harness's own config, session and token files. Phase 2 aligns this with AgentPod's harness list. */
const HARNESS = [
  dirSeg('.claude'), base((b) => b === '.claude.json'), dirSeg('.codex'), dirSeg('.gemini'), dirSeg('.cursor'),
  sub('.config', 'opencode'), sub('.local', 'share', 'opencode'), sub('.config', 'goose'),
];

export const DENIED_RULES: ReadonlyArray<{ rule: string; test: (segments: string[]) => boolean }> = [
  { rule: '.env*', test: anySeg((s) => s.startsWith('.env')) },
  { rule: '.ssh/', test: dirSeg('.ssh') },
  { rule: '.gnupg/', test: dirSeg('.gnupg') },
  { rule: '*.pem', test: base((b) => b.endsWith('.pem')) },
  { rule: '*.key', test: base((b) => b.endsWith('.key')) },
  { rule: 'id_*', test: base((b) => b.startsWith('id_')) },
  { rule: '.git/', test: dirSeg('.git') },
  { rule: '.netrc', test: base((b) => b === '.netrc') },
  { rule: '.npmrc', test: base((b) => b === '.npmrc') },
  { rule: '.pypirc', test: base((b) => b === '.pypirc') },
  { rule: '.git-credentials', test: base((b) => b === '.git-credentials') },
  { rule: 'cloud credentials', test: (s) => dirSeg('.aws')(s) || dirSeg('.azure')(s) || dirSeg('.kube')(s) || sub('.config', 'gcloud')(s) || sub('.docker', 'config.json')(s) || base((b) => b === 'application_default_credentials.json')(s) },
  { rule: 'harness files', test: (s) => HARNESS.some((t) => t(s)) },
];

export function checkPath(raw: string): PathCheck {
  if (raw.length > 1024) return { ok: false, path: raw, reason: 'too_long' };
  if (/[\u0000-\u001f\u007f]/.test(raw)) return { ok: false, path: raw, reason: 'control_character' };
  if (raw.includes('\\')) return { ok: false, path: raw, reason: 'backslash' };
  if (raw.startsWith('/') || /^[A-Za-z]:/.test(raw)) return { ok: false, path: raw, reason: 'absolute' };
  const parts = raw.split('/');
  if (parts.includes('..')) return { ok: false, path: raw, reason: 'parent' };
  const segments = parts.filter((s) => s !== '' && s !== '.');
  if (segments.length === 0) return { ok: false, path: raw, reason: 'empty' };
  const hit = DENIED_RULES.find((r) => r.test(segments));
  if (hit) return { ok: false, path: raw, reason: 'denied', rule: hit.rule };
  return { ok: true, path: segments.join('/') };
}
```

Append to `packages/contract/src/index.ts`: `export * from './paths';`

- [ ] **Step 4: Run it to verify it passes**

```bash
pnpm --filter @superlibrary/contract test
```

Expected: PASS. Revert-proof one rule: delete the `.git/` entry, see `.git/config` fail, restore.

- [ ] **Step 5: Commit**

```bash
git add packages/contract
git commit -m "feat(contract): spec §8 path rules, one implementation for server and clients

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---

### Task 5: Type sniffing — the bytes decide, the extension only refines text

**Files:**
- Create: `apps/api/src/guard/sniff.ts`
- Test: `apps/api/test/sniff.test.ts`

**Interfaces:**
- Consumes: `type View` from the contract.
- Produces: `sniff(bytes: Uint8Array, path: string): Sniffed` with `interface Sniffed { mediaType: string; view: View; text: boolean; encoding: 'utf-8' | 'utf-16le' | 'utf-16be' | null }` and `decodeText(bytes: Uint8Array, encoding: 'utf-8' | 'utf-16le' | 'utf-16be'): string`. Task 7 stores `mediaType`/`view` per file; Task 11 serves `mediaType` and uses `encoding` (read back from the charset in `mediaType`) to inline text.

**The rule.** Magic bytes decide every binary type. Bytes that decode as text are text; within text, only the content can make HTML, SVG, JSON or a notebook. The extension may only choose among text views and text media types (`.md` → markdown, `.js` → `text/javascript` so an HTML app's scripts run under `nosniff`), and can never turn bytes into HTML, SVG, PDF, an image or media.

- [ ] **Step 1: Write the failing test**

`apps/api/test/sniff.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { sniff } from '../src/guard/sniff';

const bytes = (...xs: number[]) => new Uint8Array(xs);
const text = (s: string) => new TextEncoder().encode(s);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13);
const PDF = text('%PDF-1.7\n%âãÏÓ\n');

describe('sniff beats extension', () => {
  it('PNG bytes named .html are an image', () => expect(sniff(PNG, 'evil.html')).toMatchObject({ mediaType: 'image/png', view: 'image', text: false }));
  it('HTML bytes named .png are HTML', () => expect(sniff(text('<!doctype html><title>x</title>'), 'photo.png')).toMatchObject({ view: 'html', mediaType: 'text/html; charset=utf-8' }));
  it('PDF bytes named .md are a PDF', () => expect(sniff(PDF, 'notes.md')).toMatchObject({ view: 'pdf', mediaType: 'application/pdf' }));
  it('text named .pdf is text', () => expect(sniff(text('hello'), 'report.pdf')).toMatchObject({ view: 'text', text: true }));
  it('SVG markup named .txt is SVG; a .svg that is not SVG markup is text', () => {
    expect(sniff(text('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'a.txt')).toMatchObject({ view: 'svg', mediaType: 'image/svg+xml' });
    expect(sniff(text('just words'), 'a.svg')).toMatchObject({ view: 'text' });
  });
});

describe('binary kinds', () => {
  it.each([
    [bytes(0xff, 0xd8, 0xff, 0xe0), 'image/jpeg', 'image'],
    [text('GIF89a'), 'image/gif', 'image'],
    [bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50), 'image/webp', 'image'],
    [bytes(0, 0, 0, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66), 'image/avif', 'image'],
    [bytes(0, 0, 0, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d), 'video/mp4', 'video'],
    [bytes(0x1a, 0x45, 0xdf, 0xa3), 'video/webm', 'video'],
    [text('ID3\u0004'), 'audio/mpeg', 'audio'],
    [text('OggS'), 'audio/ogg', 'audio'],
    [bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45), 'audio/wav', 'audio'],
    [text('fLaC'), 'audio/flac', 'audio'],
    [bytes(0, 0x61, 0x73, 0x6d, 1, 0, 0, 0), 'application/wasm', 'download'],
    [text('wOF2xxxx'), 'font/woff2', 'download'],
  ])('%#: %s', (b, mediaType, view) => expect(sniff(b, 'x.bin')).toMatchObject({ mediaType, view, text: false }));

  it('Office files are recognised inside the zip; any other zip is a zip; all download', () => {
    const zipWith = (name: string) => new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...text(`....[Content_Types].xml....${name}document.xml`)]);
    expect(sniff(zipWith('word/'), 'a.docx')).toMatchObject({ mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', view: 'download' });
    expect(sniff(zipWith('xl/'), 'a.xlsx')).toMatchObject({ mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', view: 'download' });
    expect(sniff(zipWith('ppt/'), 'a.pptx')).toMatchObject({ mediaType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', view: 'download' });
    expect(sniff(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2]), 'a.docx')).toMatchObject({ mediaType: 'application/zip', view: 'download' });
  });
});

describe('text', () => {
  it('UTF-16 with a BOM is text', () => {
    const le = new Uint8Array([0xff, 0xfe, ...new Uint8Array(new Uint16Array([...'hi'].map((c) => c.charCodeAt(0))).buffer)]);
    expect(sniff(le, 'a.txt')).toMatchObject({ view: 'text', text: true, encoding: 'utf-16le', mediaType: 'text/plain; charset=utf-16le' });
  });
  it('invalid UTF-8 (a Windows-1252 CSV) is binary: a download card, never mojibake', () => {
    expect(sniff(new Uint8Array([0x63, 0x61, 0x66, 0xe9, 0x2c, 0x31]), 'prices.csv')).toMatchObject({ view: 'download', text: false, mediaType: 'application/octet-stream' });
  });
  it('a NUL byte makes it binary', () => expect(sniff(new Uint8Array([0x61, 0, 0x62]), 'a.txt')).toMatchObject({ text: false }));
  it('an empty file is empty text', () => expect(sniff(new Uint8Array(), 'empty.md')).toMatchObject({ view: 'markdown', text: true }));
  it('JSON, and a notebook, are recognised from content', () => {
    expect(sniff(text('{"a":1}'), 'data.txt')).toMatchObject({ view: 'json', mediaType: 'application/json' });
    expect(sniff(text('{"nbformat":4,"cells":[]}'), 'n.json')).toMatchObject({ view: 'ipynb' });
    expect(sniff(text('{not json'), 'x.json')).toMatchObject({ view: 'code' });
  });
  it.each([
    ['a.md', 'markdown', 'text/markdown; charset=utf-8'],
    ['a.csv', 'csv', 'text/csv; charset=utf-8'],
    ['a.tsv', 'tsv', 'text/tab-separated-values; charset=utf-8'],
    ['a.yaml', 'yaml', 'application/yaml; charset=utf-8'],
    ['a.toml', 'toml', 'application/toml; charset=utf-8'],
    ['a.mmd', 'mermaid', 'text/plain; charset=utf-8'],
    ['a.dot', 'graphviz', 'text/vnd.graphviz; charset=utf-8'],
    ['app.js', 'code', 'text/javascript; charset=utf-8'],
    ['app.mjs', 'code', 'text/javascript; charset=utf-8'],
    ['site.css', 'code', 'text/css; charset=utf-8'],
    ['main.py', 'code', 'text/plain; charset=utf-8'],
    ['run.log', 'text', 'text/plain; charset=utf-8'],
    ['frag.html', 'code', 'text/plain; charset=utf-8'],
  ])('%s → %s', (path, view, mediaType) => expect(sniff(text('plain words\n'), path)).toMatchObject({ view, mediaType }));
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --filter @superlibrary/api test test/sniff.test.ts
```

Expected: FAIL — `Failed to resolve import "../src/guard/sniff"`.

- [ ] **Step 3: Implement**

`apps/api/src/guard/sniff.ts`:

```ts
import type { View } from '@superlibrary/contract';

export type TextEncoding = 'utf-8' | 'utf-16le' | 'utf-16be';
export interface Sniffed { mediaType: string; view: View; text: boolean; encoding: TextEncoding | null }

const at = (b: Uint8Array, off: number, sig: number[]) => sig.every((x, i) => b[off + i] === x);
const ascii = (b: Uint8Array, off: number, s: string) => at(b, off, [...s].map((c) => c.charCodeAt(0)));
const bin = (mediaType: string, view: View): Sniffed => ({ mediaType, view, text: false, encoding: null });

function binary(b: Uint8Array): Sniffed | null {
  if (at(b, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return bin('image/png', 'image');
  if (at(b, 0, [0xff, 0xd8, 0xff])) return bin('image/jpeg', 'image');
  if (ascii(b, 0, 'GIF87a') || ascii(b, 0, 'GIF89a')) return bin('image/gif', 'image');
  if (ascii(b, 0, 'RIFF') && ascii(b, 8, 'WEBP')) return bin('image/webp', 'image');
  if (ascii(b, 0, 'RIFF') && ascii(b, 8, 'WAVE')) return bin('audio/wav', 'audio');
  if (ascii(b, 4, 'ftyp')) {
    const brand = String.fromCharCode(...b.slice(8, 12));
    if (brand === 'avif' || brand === 'avis') return bin('image/avif', 'image');
    if (brand === 'M4A ') return bin('audio/mp4', 'audio');
    if (brand === 'qt  ') return bin('video/quicktime', 'video');
    if (brand.startsWith('hei') || brand === 'mif1') return bin('image/heic', 'download');
    return bin('video/mp4', 'video');
  }
  if (ascii(b, 0, '%PDF-')) return bin('application/pdf', 'pdf');
  if (at(b, 0, [0x1a, 0x45, 0xdf, 0xa3])) return bin('video/webm', 'video');
  if (ascii(b, 0, 'ID3') || at(b, 0, [0xff, 0xfb]) || at(b, 0, [0xff, 0xf3]) || at(b, 0, [0xff, 0xf2])) return bin('audio/mpeg', 'audio');
  if (ascii(b, 0, 'OggS')) return bin('audio/ogg', 'audio');
  if (ascii(b, 0, 'fLaC')) return bin('audio/flac', 'audio');
  if (at(b, 0, [0, 0x61, 0x73, 0x6d])) return bin('application/wasm', 'download');
  if (ascii(b, 0, 'wOFF')) return bin('font/woff', 'download');
  if (ascii(b, 0, 'wOF2')) return bin('font/woff2', 'download');
  if (ascii(b, 0, 'OTTO')) return bin('font/otf', 'download');
  if (at(b, 0, [0, 1, 0, 0, 0])) return bin('font/ttf', 'download');
  if (at(b, 0, [0x50, 0x4b, 0x03, 0x04])) {
    // Office files are zips; their part names sit in the local headers and the central directory.
    const window = String.fromCharCode(...b.slice(0, 65536)) + String.fromCharCode(...b.slice(Math.max(0, b.length - 65536)));
    if (window.includes('word/')) return bin('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'download');
    if (window.includes('xl/')) return bin('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'download');
    if (window.includes('ppt/')) return bin('application/vnd.openxmlformats-officedocument.presentationml.presentation', 'download');
    return bin('application/zip', 'download');
  }
  return null;
}

export function decodeText(b: Uint8Array, encoding: TextEncoding): string {
  const bomLength = encoding === 'utf-8' ? (at(b, 0, [0xef, 0xbb, 0xbf]) ? 3 : 0) : 2;
  return new TextDecoder(encoding, { fatal: true }).decode(b.subarray(bomLength));
}

function encodingOf(b: Uint8Array): TextEncoding | null {
  if (at(b, 0, [0xff, 0xfe])) return 'utf-16le';
  if (at(b, 0, [0xfe, 0xff])) return 'utf-16be';
  if (b.subarray(0, 8192).includes(0)) return null;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(b);
    return 'utf-8';
  } catch {
    return null;
  }
}

/** Text views the extension may choose. Never html, svg, pdf, image or media. */
const BY_EXTENSION: Record<string, [View, string]> = {
  md: ['markdown', 'text/markdown'], markdown: ['markdown', 'text/markdown'],
  csv: ['csv', 'text/csv'], tsv: ['tsv', 'text/tab-separated-values'],
  yaml: ['yaml', 'application/yaml'], yml: ['yaml', 'application/yaml'], toml: ['toml', 'application/toml'],
  mmd: ['mermaid', 'text/plain'], mermaid: ['mermaid', 'text/plain'],
  dot: ['graphviz', 'text/vnd.graphviz'], gv: ['graphviz', 'text/vnd.graphviz'],
  js: ['code', 'text/javascript'], mjs: ['code', 'text/javascript'], cjs: ['code', 'text/javascript'],
  css: ['code', 'text/css'], json: ['code', 'text/plain'],
  txt: ['text', 'text/plain'], log: ['text', 'text/plain'],
};
const CODE = new Set(['ts', 'tsx', 'jsx', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift', 'c', 'h', 'cc', 'cpp', 'hpp', 'cs', 'php', 'sh', 'bash', 'zsh', 'fish', 'sql', 'lua', 'r', 'scala', 'svelte', 'vue', 'html', 'htm', 'xml', 'ini', 'cfg', 'conf', 'diff', 'patch', 'dockerfile', 'makefile', 'swift', 'zig', 'ex', 'exs', 'erl', 'hs', 'ml', 'dart', 'tf', 'proto', 'graphql']);

function extOf(path: string): string {
  const name = (path.split('/').pop() ?? '').toLowerCase();
  if (name === 'dockerfile' || name === 'makefile') return name;
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1) : '';
}

export function sniff(b: Uint8Array, path: string): Sniffed {
  const known = binary(b);
  if (known) return known;
  const encoding = encodingOf(b);
  if (!encoding) return bin('application/octet-stream', 'download');
  const charset = `; charset=${encoding}`;
  const t = (view: View, type: string): Sniffed => ({ mediaType: `${type}${charset}`, view, text: true, encoding });
  let content: string;
  try {
    content = decodeText(b, encoding);
  } catch {
    return bin('application/octet-stream', 'download');
  }
  const head = content.slice(0, 1024).trimStart().toLowerCase();
  if (head.startsWith('<!doctype html') || head.startsWith('<html')) return t('html', 'text/html');
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return { mediaType: 'image/svg+xml', view: 'svg', text: true, encoding };
  if (head.startsWith('{') || head.startsWith('[')) {
    try {
      const v = JSON.parse(content) as unknown;
      const nb = v && typeof v === 'object' && !Array.isArray(v) && typeof (v as { nbformat?: unknown }).nbformat === 'number' && Array.isArray((v as { cells?: unknown }).cells);
      return nb ? t('ipynb', 'application/x-ipynb+json') : t('json', 'application/json');
    } catch {
      // not JSON after all: fall through to the extension
    }
  }
  const ext = extOf(path);
  const mapped = BY_EXTENSION[ext];
  if (mapped) return t(mapped[0], mapped[1]);
  if (CODE.has(ext)) return t('code', 'text/plain');
  return t('text', 'text/plain');
}
```

(The `json` extension maps to `code` only for text that did not parse as JSON, which the `{not json` case pins.)

- [ ] **Step 4: Run it to verify it passes**

```bash
pnpm --filter @superlibrary/api test test/sniff.test.ts
```

Expected: PASS. Revert-proof: make `binary()` return null for PNG, see `PNG bytes named .html are an image` fail, restore.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/guard/sniff.ts apps/api/test/sniff.test.ts
git commit -m "feat(api): sniff types from bytes; the extension only refines text

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---

### Task 6: The secret scan

**Files:**
- Create: `apps/api/src/guard/secrets.ts`
- Test: `apps/api/test/secrets.test.ts`

**Interfaces:**
- Produces: `scanText(text: string): Finding[]` with `interface Finding { line: number; rule: SecretRule }` and `type SecretRule = 'aws-access-key' | 'aws-secret-key' | 'github-token' | 'slack-token' | 'slack-webhook' | 'openai-key' | 'anthropic-key' | 'jwt' | 'pem-private-key' | 'high-entropy-assignment'`. Findings carry the line and rule, **never the matched text**: a refusal must not echo the secret back. Task 7 stores findings per file; Task 8 refuses a commit with any.

Test fixtures are assembled at runtime (`'gh' + 'p_' + …`) so no literal in this repo looks like a live credential to GitHub's push protection.

- [ ] **Step 1: Write the failing test**

`apps/api/test/secrets.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { scanText } from '../src/guard/secrets';

const r = (n: number, c = 'A') => c.repeat(n);
const mixed = (n: number) => Array.from({ length: n }, (_, i) => 'aB3xQ9zK7mP2wR5t'[i % 16]).join('');

describe('scanText (spec §8)', () => {
  it.each([
    ['aws-access-key', 'AK' + 'IA' + 'Q3EGWX5ZJ7KPLM2N'],
    ['aws-secret-key', 'aws_secret_access_key = ' + mixed(40)],
    ['github-token', 'gh' + 'p_' + mixed(36)],
    ['github-token', 'github' + '_pat_' + mixed(70)],
    ['slack-token', 'xo' + 'xb-' + '1234567890-' + mixed(24)],
    ['slack-webhook', 'https://hooks.slack.com/services/' + 'T0123ABCD/B0123ABCD/' + mixed(24)],
    ['anthropic-key', 'sk-' + 'ant-api03-' + mixed(40)],
    ['openai-key', 'sk-' + 'proj-' + mixed(40)],
    ['jwt', 'eyJ' + 'hbGciOiJIUzI1NiJ9' + '.eyJ' + 'zdWIiOiIxMjM0NTY3ODkwIn0' + '.' + mixed(43)],
    ['pem-private-key', '-----BEGIN ' + 'OPENSSH PRIVATE KEY-----'],
    ['pem-private-key', '-----BEGIN ' + 'RSA PRIVATE KEY-----'],
    ['high-entropy-assignment', 'API_TOKEN="' + mixed(32) + '"'],
  ])('%s', (rule, secret) => {
    expect(scanText(`first line\nconst x = 1;\n${secret}\n`)).toContainEqual({ line: 3, rule });
  });

  it('an Anthropic key is reported as Anthropic, not also as OpenAI', () => {
    const f = scanText('sk-' + 'ant-api03-' + mixed(40));
    expect(f.map((x) => x.rule)).toEqual(['anthropic-key']);
  });

  it('counts lines across CRLF, CR and LF, and reports a one-line minified file as line 1', () => {
    expect(scanText('a\r\nb\rc\n' + 'gh' + 'p_' + mixed(36))).toEqual([{ line: 4, rule: 'github-token' }]);
    expect(scanText(r(5000, 'x') + ' ' + 'gh' + 'p_' + mixed(36) + ' ' + r(5000, 'y'))).toEqual([{ line: 1, rule: 'github-token' }]);
  });

  it('does not flag ordinary text, placeholders or public material', () => {
    for (const s of [
      'password = "changeme"',
      'token: ${GITHUB_TOKEN}',
      'API_KEY=your-api-key-here-please',
      'We use sk-ant keys for the model.',
      '-----BEGIN CERTIFICATE-----',
      '-----BEGIN PUBLIC KEY-----',
      'eyJhbGciOiJub25lIn0.eyJzdWIiOiIxIn0.',
      'sha256: ' + 'ab'.repeat(32),
    ]) {
      expect(scanText(s), s).toEqual([]);
    }
  });

  it('never returns the secret itself', () => {
    const secret = 'gh' + 'p_' + mixed(36);
    expect(JSON.stringify(scanText(secret))).not.toContain(secret.slice(4));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --filter @superlibrary/api test test/secrets.test.ts
```

Expected: FAIL — `Failed to resolve import "../src/guard/secrets"`.

- [ ] **Step 3: Implement**

`apps/api/src/guard/secrets.ts`:

```ts
/**
 * Spec §8 secret scan. Line-based, so a refusal can name the file and line; never returns what
 * matched. PEM: private-key blocks only — a certificate or a public key is not a secret.
 */
export type SecretRule =
  | 'aws-access-key' | 'aws-secret-key' | 'github-token' | 'slack-token' | 'slack-webhook'
  | 'openai-key' | 'anthropic-key' | 'jwt' | 'pem-private-key' | 'high-entropy-assignment';
export interface Finding { line: number; rule: SecretRule }

const RULES: Array<[SecretRule, RegExp]> = [
  ['aws-access-key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['aws-secret-key', /aws_?secret_?access_?key["']?\s*[:=]\s*["']?[A-Za-z0-9/+=]{40}(?![A-Za-z0-9/+=])/i],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/],
  ['slack-token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ['slack-webhook', /https:\/\/hooks\.slack\.com\/services\/[A-Z0-9]+\/[A-Z0-9]+\/[A-Za-z0-9]+/],
  ['anthropic-key', /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ['openai-key', /\bsk-(?!ant-)(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}/],
  ['jwt', /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{16,}/],
  ['pem-private-key', /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/],
];

const ASSIGNMENT = /\b[A-Za-z0-9_]*(?:secret|token|passw(?:or)?d|api_?key|apikey|access_?key|private_?key|client_?secret)[A-Za-z0-9_]*["']?\s*[:=]\s*["']?([A-Za-z0-9+/_=.-]{20,})/gi;

/** Shannon entropy in bits per character. */
function entropy(s: string): number {
  const counts = new Map<string, number>();
  for (const c of s) counts.set(c, (counts.get(c) ?? 0) + 1);
  let h = 0;
  for (const n of counts.values()) h -= (n / s.length) * Math.log2(n / s.length);
  return h;
}

function highEntropyAssignment(line: string): boolean {
  for (const m of line.matchAll(ASSIGNMENT)) {
    const value = m[1]!;
    // A word-only value with dashes ("your-api-key-here") is a placeholder, not a secret.
    if (/^[a-z-]+$/i.test(value)) continue;
    if (entropy(value) >= 3.5) return true;
  }
  return false;
}

export function scanText(text: string): Finding[] {
  const out: Finding[] = [];
  text.split(/\r\n|\r|\n/).forEach((line, i) => {
    for (const [rule, re] of RULES) if (re.test(line)) out.push({ line: i + 1, rule });
    const named = out.some((f) => f.line === i + 1);
    if (!named && highEntropyAssignment(line)) out.push({ line: i + 1, rule: 'high-entropy-assignment' });
  });
  return out;
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
pnpm --filter @superlibrary/api test test/secrets.test.ts
```

Expected: PASS. If a negative case fails on `high-entropy-assignment`, adjust only the 3.5 threshold or the placeholder rule, never the fixture. Revert-proof: remove the `github-token` rule, see two cases fail, restore.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/guard/secrets.ts apps/api/test/secrets.test.ts
git commit -m "feat(api): spec §8 secret scan, naming file and line, never the secret

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---

### Task 7: Upload sessions — declare, send each file, size caps and quota

**Files:**
- Create: `apps/api/src/storage/blobs.ts`, `apps/api/src/guard/limits.ts`, `apps/api/src/uploads/routes.ts`
- Modify: `apps/api/src/http.ts` (add `Handler`), `apps/api/src/index.ts` (register `uploadRoutes`)
- Test: `apps/api/test/helpers/upload.ts`, `apps/api/test/uploads.test.ts`

**Interfaces:**
- Consumes: `resolvePerson`, `checkPath`, `UploadCreate`, `LIMITS`, `sniff`, `decodeText`, `scanText`, `audit`, `newId`.
- Produces:
  - `type Handler = (request: Request, env: Env, ctx: ExecutionContext, url: URL) => Promise<Response | null>` in `src/http.ts`; `src/index.ts` keeps `const handlers: Handler[] = [uploadRoutes]` and later tasks append to that array.
  - `sha256Hex(data: ArrayBuffer | Uint8Array | string): Promise<string>`, `blobKey(sha256: string): string` (`blobs/<sha>`), `manifestKey(itemId: string, version: number): string` (`manifests/<itemId>/<version>.json`) in `src/storage/blobs.ts`
  - `workspaceUsage(db, workspaceId): Promise<number>` and `newBytes(db, workspaceId, files: {sha256: string; bytes: number}[]): Promise<number>` in `src/guard/limits.ts`
  - Routes: `POST /api/v1/uploads` → `201 { uploadId, expiresAt, entry }`; `PUT /api/v1/uploads/:id/files?path=<path>` → `200 { path, mediaType, view, findings: { line, rule }[] }`; refusals `400 invalid | path_refused | duplicate_path | entry_not_found | size_mismatch | sha256_mismatch`, `404 not_found | not_declared`, `410 upload_expired`, `413 file_too_large | folder_too_large | too_many_files | quota_exceeded`
  - Test helper `upload(files: Array<{ path: string; body: string | Uint8Array }>, opts?: { headers?: Record<string, string>; title?: string; scope?: string; item?: string; entry?: string; expiresAt?: string; override?: string }): Promise<{ status: number; body: any; uploadId: string }>` in `test/helpers/upload.ts` — declares, PUTs every file, overrides when asked, commits (commit lands in Task 8; until then the helper stops after the PUTs when `opts.commit === false`).

- [ ] **Step 1: Write the failing tests**

`apps/api/test/helpers/upload.ts`:

```ts
import { SELF } from 'cloudflare:test';
import { devHeaders } from './org-plane';

export const API = 'https://api.test';
const enc = (b: string | Uint8Array) => (typeof b === 'string' ? new TextEncoder().encode(b) : b);

export async function sha256Hex(b: Uint8Array): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].map((x) => x.toString(16).padStart(2, '0')).join('');
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
}

/** Declare, send every file, optionally override, then commit — the whole client protocol. */
export async function upload(files: Array<{ path: string; body: string | Uint8Array }>, opts: UploadOpts = {}) {
  const headers = { ...(opts.headers ?? devHeaders()), 'content-type': 'application/json' };
  const declared = await Promise.all(files.map(async (f) => ({ path: f.path, bytes: enc(f.body).length, sha256: await sha256Hex(enc(f.body)) })));
  const created = await SELF.fetch(`${API}/api/v1/uploads`, {
    method: 'POST', headers,
    body: JSON.stringify({ title: opts.title ?? 'Test upload', scope: opts.scope, item: opts.item, entry: opts.entry, expiresAt: opts.expiresAt, files: declared }),
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
```

`apps/api/test/uploads.test.ts`:

```ts
import { SELF, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { LIMITS } from '@superlibrary/contract';
import { API, sha256Hex, upload } from './helpers/upload';
import { HUMAN_2, devHeaders } from './helpers/org-plane';

const declare = (files: unknown[], extra: Record<string, unknown> = {}, headers = devHeaders()) =>
  SELF.fetch(`${API}/api/v1/uploads`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ title: 't', files, ...extra }) });
const file = (path: string, bytes = 1) => ({ path, bytes, sha256: 'a'.repeat(64) });

describe('declaring an upload', () => {
  it('refuses a path outside the root or on the denylist, naming it', async () => {
    const res = await declare([file('ok.md'), file('../secrets.txt')]);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'path_refused', path: '../secrets.txt', reason: 'parent' });
    const env_ = await declare([file('app/.env')]);
    expect(await env_.json()).toEqual({ error: 'path_refused', path: 'app/.env', reason: 'denied', rule: '.env*' });
  });

  it('refuses two paths that normalise to one', async () => {
    expect((await declare([file('a.md'), file('./a.md')])).status).toBe(400);
  });

  it('caps a file at 25 MB, a folder at 100 MB and 500 files', async () => {
    const big = await declare([file('big.bin', LIMITS.fileBytes + 1)]);
    expect(big.status).toBe(413);
    expect(await big.json()).toEqual({ error: 'file_too_large', path: 'big.bin', limit: LIMITS.fileBytes });
    const exactly = await declare([file('ok.bin', LIMITS.fileBytes)]);
    expect(exactly.status).toBe(201);
    const folder = await declare(Array.from({ length: 5 }, (_, i) => file(`f${i}.bin`, LIMITS.fileBytes)));
    expect(await folder.json()).toEqual({ error: 'folder_too_large', limit: LIMITS.folderBytes });
    const many = await declare(Array.from({ length: LIMITS.folderFiles + 1 }, (_, i) => file(`f${i}.txt`)));
    expect(await many.json()).toEqual({ error: 'too_many_files', limit: LIMITS.folderFiles });
  });

  it('refuses an upload past the workspace quota', async () => {
    const org = 'org_00000000000000000e05';
    const h = devHeaders(HUMAN_2, org);
    await SELF.fetch(`${API}/api/v1/me`, { headers: h });
    await env.DB.prepare(`UPDATE workspaces SET quota_bytes = 10 WHERE external_id = ?`).bind(org).run();
    const res = await declare([{ path: 'a.bin', bytes: 11, sha256: 'b'.repeat(64) }], {}, h);
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ error: 'quota_exceeded', limit: 10 });
  });

  it('picks the entry: index.html, then README.md, then the first path; refuses an unknown one', async () => {
    const one = await (await declare([file('b.txt'), file('README.md'), file('index.html')])).json<{ entry: string }>();
    expect(one.entry).toBe('index.html');
    const two = await (await declare([file('b.txt'), file('README.md')])).json<{ entry: string }>();
    expect(two.entry).toBe('README.md');
    const three = await (await declare([file('z.txt'), file('a.txt')])).json<{ entry: string }>();
    expect(three.entry).toBe('a.txt');
    expect((await declare([file('a.txt')], { entry: 'nope.txt' })).status).toBe(400);
  });
});

describe('sending a file', () => {
  it('checks size and SHA-256 against the declaration, sniffs, and stores the bytes once by hash', async () => {
    const body = '# Hello\n';
    const r = await upload([{ path: 'notes.png', body }], { commit: false });
    expect(r.status).toBe(200);
    expect(r.body.puts[0]).toEqual({ path: 'notes.png', mediaType: 'text/plain; charset=utf-8', view: 'text', findings: [] });
    const sha = await sha256Hex(new TextEncoder().encode(body));
    expect(await (await env.BLOBS.get(`blobs/${sha}`))?.text()).toBe(body);
  });

  it('refuses bytes that do not match what was declared', async () => {
    const res = await declare([{ path: 'a.txt', bytes: 3, sha256: 'c'.repeat(64) }]);
    const { uploadId } = await res.json<{ uploadId: string }>();
    const wrongSize = await SELF.fetch(`${API}/api/v1/uploads/${uploadId}/files?path=a.txt`, { method: 'PUT', headers: devHeaders(), body: 'abcd' });
    expect(await wrongSize.json()).toEqual({ error: 'size_mismatch', path: 'a.txt' });
    const wrongHash = await SELF.fetch(`${API}/api/v1/uploads/${uploadId}/files?path=a.txt`, { method: 'PUT', headers: devHeaders(), body: 'abc' });
    expect(await wrongHash.json()).toEqual({ error: 'sha256_mismatch', path: 'a.txt' });
    const undeclared = await SELF.fetch(`${API}/api/v1/uploads/${uploadId}/files?path=b.txt`, { method: 'PUT', headers: devHeaders(), body: 'abc' });
    expect(undeclared.status).toBe(404);
  });

  it('reports secret findings by line and rule', async () => {
    const r = await upload([{ path: 'config.ts', body: 'const a = 1;\nconst t = "' + 'gh' + 'p_' + 'aB3xQ9zK7mP2wR5t'.repeat(3) + '";\n' }], { commit: false });
    expect(r.body.puts[0].findings).toEqual([{ line: 2, rule: 'github-token' }]);
  });

  it('only the person who declared it may send to it', async () => {
    const { uploadId } = await (await declare([file('a.txt', 3)])).json<{ uploadId: string }>();
    const other = await SELF.fetch(`${API}/api/v1/uploads/${uploadId}/files?path=a.txt`, { method: 'PUT', headers: devHeaders(HUMAN_2), body: 'abc' });
    expect(other.status).toBe(404);
  });
});
```

Run:

```bash
pnpm --filter @superlibrary/api test test/uploads.test.ts
```

Expected: FAIL — `/api/v1/uploads` answers `404 not_found`.

- [ ] **Step 2: Implement storage and quota helpers**

Add to `apps/api/src/http.ts`:

```ts
import type { Env } from './env';
export type Handler = (request: Request, env: Env, ctx: ExecutionContext, url: URL) => Promise<Response | null>;
```

and in `apps/api/src/index.ts` replace the local `type Handler` with `import { type Handler } from './http';`.

`apps/api/src/storage/blobs.ts`:

```ts
export async function sha256Hex(data: ArrayBuffer | Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Content addressing (spec §3): identical bytes are one object, whoever uploads them. */
export const blobKey = (sha256: string) => `blobs/${sha256}`;
/** What the content Worker reads instead of a database (plan D7). */
export const manifestKey = (itemId: string, version: number) => `manifests/${itemId}/${version}.json`;
```

`apps/api/src/guard/limits.ts`:

```ts
/**
 * Spec §8: 1 GB per workspace by default. Usage counts each distinct blob once per workspace,
 * across committed versions and uploads still open, so re-uploading the same bytes costs nothing.
 */
const USAGE = `
  SELECT sha256, bytes FROM version_files vf JOIN items i ON i.id = vf.item_id WHERE i.workspace_id = ?1
  UNION
  SELECT uf.sha256, uf.bytes FROM upload_files uf JOIN upload_sessions s ON s.id = uf.session_id WHERE s.workspace_id = ?1 AND s.state = 'open'`;

export async function workspaceUsage(db: D1Database, workspaceId: string): Promise<number> {
  const row = await db.prepare(`SELECT COALESCE(SUM(bytes), 0) AS used FROM (${USAGE})`).bind(workspaceId).first<{ used: number }>();
  return row?.used ?? 0;
}

/** Bytes these files add: those whose SHA-256 the workspace does not already hold. */
export async function newBytes(db: D1Database, workspaceId: string, files: { sha256: string; bytes: number }[]): Promise<number> {
  const held = await db
    .prepare(`SELECT DISTINCT sha256 FROM (${USAGE}) WHERE sha256 IN (SELECT value FROM json_each(?2))`)
    .bind(workspaceId, JSON.stringify([...new Set(files.map((f) => f.sha256))]))
    .all<{ sha256: string }>();
  const have = new Set(held.results.map((r) => r.sha256));
  const seen = new Set<string>();
  let total = 0;
  for (const f of files) {
    if (have.has(f.sha256) || seen.has(f.sha256)) continue;
    seen.add(f.sha256);
    total += f.bytes;
  }
  return total;
}
```

- [ ] **Step 3: Implement the routes**

`apps/api/src/uploads/routes.ts`:

```ts
import { LIMITS, UploadCreate, checkPath } from '@superlibrary/contract';
import type { Env } from '../env';
import { error, json, type Handler } from '../http';
import { newId } from '../ids';
import { audit } from '../audit';
import { resolvePerson, type Person } from '../auth/caller';
import { decodeText, sniff } from '../guard/sniff';
import { scanText } from '../guard/secrets';
import { newBytes, workspaceUsage } from '../guard/limits';
import { blobKey, sha256Hex } from '../storage/blobs';

export interface SessionRow {
  id: string; workspace_id: string; created_by: string; item_id: string | null; title: string; scope: string;
  entry: string; item_expires_at: string | null; expires_at: string; state: 'open' | 'committed';
  result_item_id: string | null; result_version: number | null; override_reason: string | null;
}

function defaultEntry(paths: string[]): string {
  if (paths.length === 1) return paths[0]!;
  const sorted = [...paths].sort();
  return sorted.find((p) => p.toLowerCase() === 'index.html') ?? sorted.find((p) => p.toLowerCase() === 'readme.md') ?? sorted[0]!;
}

/** The caller's own open session, or a refusal. Someone else's session is 404, not 403. */
export async function ownSession(env: Env, p: Person, id: string): Promise<SessionRow | Response> {
  const s = await env.DB.prepare(`SELECT * FROM upload_sessions WHERE id = ? AND workspace_id = ? AND created_by = ?`).bind(id, p.workspaceId, p.principalId).first<SessionRow>();
  if (!s) return error(404, 'not_found');
  if (s.state === 'open' && Date.parse(s.expires_at) <= Date.now()) return error(410, 'upload_expired');
  return s;
}

async function create(request: Request, env: Env, p: Person): Promise<Response> {
  const parsed = UploadCreate.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return error(400, 'invalid', { issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
  const body = parsed.data;
  const files: { path: string; bytes: number; sha256: string }[] = [];
  const seen = new Set<string>();
  for (const f of body.files) {
    const c = checkPath(f.path);
    if (!c.ok) return error(400, 'path_refused', { path: f.path, reason: c.reason, ...(c.rule ? { rule: c.rule } : {}) });
    if (seen.has(c.path)) return error(400, 'duplicate_path', { path: c.path });
    seen.add(c.path);
    files.push({ ...f, path: c.path });
  }
  if (files.length > LIMITS.folderFiles) return error(413, 'too_many_files', { limit: LIMITS.folderFiles });
  const tooBig = files.find((f) => f.bytes > LIMITS.fileBytes);
  if (tooBig) return error(413, 'file_too_large', { path: tooBig.path, limit: LIMITS.fileBytes });
  if (files.reduce((n, f) => n + f.bytes, 0) > LIMITS.folderBytes) return error(413, 'folder_too_large', { limit: LIMITS.folderBytes });

  let entry = defaultEntry(files.map((f) => f.path));
  if (body.entry) {
    const c = checkPath(body.entry);
    if (!c.ok || !seen.has(c.path)) return error(400, 'entry_not_found', { entry: body.entry });
    entry = c.path;
  }
  if (body.item) {
    const item = await env.DB.prepare(`SELECT created_by, revoked_at FROM items WHERE id = ? AND workspace_id = ?`).bind(body.item, p.workspaceId).first<{ created_by: string; revoked_at: string | null }>();
    if (!item || (item.created_by !== p.principalId && p.role !== 'owner')) return error(404, 'not_found');
    if (item.revoked_at) return error(410, 'revoked');
  }
  const quota = (await env.DB.prepare(`SELECT quota_bytes FROM workspaces WHERE id = ?`).bind(p.workspaceId).first<{ quota_bytes: number }>())?.quota_bytes ?? LIMITS.workspaceBytes;
  const used = await workspaceUsage(env.DB, p.workspaceId);
  if (used + (await newBytes(env.DB, p.workspaceId, files)) > quota) return error(413, 'quota_exceeded', { limit: quota, used });

  const id = newId('upl');
  const expiresAt = new Date(Date.now() + LIMITS.uploadTtlHours * 3600_000).toISOString();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO upload_sessions (id, workspace_id, created_by, item_id, title, scope, entry, item_expires_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, p.workspaceId, p.principalId, body.item ?? null, body.title, body.scope, entry, body.expiresAt ?? null, expiresAt),
    ...files.map((f) => env.DB.prepare(`INSERT INTO upload_files (session_id, path, sha256, bytes) VALUES (?, ?, ?, ?)`).bind(id, f.path, f.sha256, f.bytes)),
    audit(env.DB, { workspaceId: p.workspaceId, actor: p.principalId, act: p.act, action: 'upload.created', detail: { uploadId: id, files: files.length } }),
  ]);
  return json({ uploadId: id, expiresAt, entry }, 201);
}

async function put(request: Request, env: Env, p: Person, id: string, url: URL): Promise<Response> {
  const s = await ownSession(env, p, id);
  if (s instanceof Response) return s;
  if (s.state !== 'open') return error(409, 'already_committed');
  const path = url.searchParams.get('path') ?? '';
  const f = await env.DB.prepare(`SELECT sha256, bytes FROM upload_files WHERE session_id = ? AND path = ?`).bind(id, path).first<{ sha256: string; bytes: number }>();
  if (!f) return error(404, 'not_declared', { path });
  const announced = Number(request.headers.get('content-length') ?? NaN);
  if (Number.isFinite(announced) && announced !== f.bytes) return error(400, 'size_mismatch', { path });
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length !== f.bytes) return error(400, 'size_mismatch', { path });
  if ((await sha256Hex(bytes)) !== f.sha256) return error(400, 'sha256_mismatch', { path });

  const sniffed = sniff(bytes, path);
  const findings = sniffed.text && sniffed.encoding ? scanText(decodeText(bytes, sniffed.encoding)) : [];
  if (!(await env.BLOBS.head(blobKey(f.sha256)))) await env.BLOBS.put(blobKey(f.sha256), bytes, { sha256: f.sha256 });
  await env.DB.batch([
    env.DB.prepare(`UPDATE upload_files SET received = 1, media_type = ?, view = ? WHERE session_id = ? AND path = ?`).bind(sniffed.mediaType, sniffed.view, id, path),
    env.DB.prepare(`DELETE FROM secret_findings WHERE session_id = ? AND path = ?`).bind(id, path),
    ...findings.map((x) => env.DB.prepare(`INSERT OR IGNORE INTO secret_findings (session_id, path, line, rule) VALUES (?, ?, ?, ?)`).bind(id, path, x.line, x.rule)),
  ]);
  return json({ path, mediaType: sniffed.mediaType, view: sniffed.view, findings });
}

const UPLOAD = /^\/api\/v1\/uploads\/(upl_[0-9a-f]{16})(\/files|\/override|\/commit)?$/;

export const uploadRoutes: Handler = async (request, env, _ctx, url) => {
  if (url.pathname === '/api/v1/uploads' && request.method === 'POST') {
    const p = await resolvePerson(request, env);
    return p instanceof Response ? p : create(request, env, p);
  }
  const m = UPLOAD.exec(url.pathname);
  if (!m) return null;
  const p = await resolvePerson(request, env);
  if (p instanceof Response) return p;
  const [, id, action] = m as unknown as [string, string, string | undefined];
  if (action === '/files' && request.method === 'PUT') return put(request, env, p, id, url);
  if (action === '/override' && request.method === 'POST') return overrideScan(request, env, p, id);
  if (action === '/commit' && request.method === 'POST') return commit(env, p, id);
  return error(405, 'method_not_allowed');
};

// Implemented in Task 8.
async function overrideScan(_r: Request, _e: Env, _p: Person, _id: string): Promise<Response> {
  return error(501, 'not_implemented');
}
async function commit(_e: Env, _p: Person, _id: string): Promise<Response> {
  return error(501, 'not_implemented');
}
```

Register it in `apps/api/src/index.ts`: `import { uploadRoutes } from './uploads/routes';` and `const handlers: Handler[] = [uploadRoutes];`.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm --filter @superlibrary/api test && pnpm --filter @superlibrary/api typecheck
```

Expected: PASS. Revert-proof: change `f.bytes > LIMITS.fileBytes` to `>=`; the "exactly 25 MB" case fails; restore.

- [ ] **Step 5: Commit**

```bash
git add apps/api
git commit -m "feat(api): upload sessions with path rules, size caps, quota, sniffing and secret findings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---

### Task 8: Commit — items, immutable versions, manifests, and the recorded override

**Files:**
- Modify: `apps/api/src/uploads/routes.ts` (replace the two `not_implemented` stubs)
- Modify: `apps/api/src/storage/blobs.ts` (add `writeManifest`)
- Modify: `packages/contract/src/content.ts` (add `Manifest`)
- Test: `apps/api/test/commit.test.ts`

**Interfaces:**
- Consumes: `ownSession`, `SessionRow`, `audit`, `blobKey`, `manifestKey`, `sha256Hex`, `newId`.
- Produces:
  - `interface Manifest { itemId: string; version: number; entry: string; expiresAt: string | null; files: Record<string, { sha256: string; bytes: number; mediaType: string; view: View }> }` in the contract (the content Worker, Task 11, reads exactly this)
  - `writeManifest(env: Env, itemId: string, version: number): Promise<void>` and `deleteManifest(env: Env, itemId: string, version: number): Promise<void>` in `src/storage/blobs.ts`
  - `POST /api/v1/uploads/:id/override { reason }` → `200 { overridden: true }`; `409 nothing_to_override`
  - `POST /api/v1/uploads/:id/commit` → `201 CommitResult` (`{ itemId, version, url: <APP_URL>/a/<itemId>, sha256, mediaType, bytes }`, spec §5's shape); a repeated commit → `200` with the same result; `409 incomplete { missing }`, `409 version_conflict`, `422 secret_found { findings: { path, line, rule }[] }`

- [ ] **Step 1: Write the failing test**

`apps/api/test/commit.test.ts`:

```ts
import { SELF, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { API, sha256Hex, upload } from './helpers/upload';
import { HUMAN_2, devHeaders } from './helpers/org-plane';

const SECRET = 'const t = "' + 'gh' + 'p_' + 'aB3xQ9zK7mP2wR5t'.repeat(3) + '";';

describe('commit', () => {
  it('creates an item and version 1, with spec §5 return shape, and a manifest in R2', async () => {
    const r = await upload([{ path: 'report.md', body: '# Report\n' }], { title: 'Weekly report' });
    expect(r.status).toBe(201);
    expect(r.body).toEqual({
      itemId: expect.stringMatching(/^itm_[0-9a-f]{16}$/), version: 1, url: `${API}/a/${r.body.itemId}`,
      sha256: await sha256Hex(new TextEncoder().encode('# Report\n')), mediaType: 'text/markdown; charset=utf-8', bytes: 9,
    });
    const manifest = await (await env.BLOBS.get(`manifests/${r.body.itemId}/1.json`))!.json();
    expect(manifest).toEqual({ itemId: r.body.itemId, version: 1, entry: 'report.md', expiresAt: null, files: { 'report.md': { sha256: r.body.sha256, bytes: 9, mediaType: 'text/markdown; charset=utf-8', view: 'markdown' } } });
    const audited = await env.DB.prepare(`SELECT action FROM audit_events WHERE item_id = ? ORDER BY at`).bind(r.body.itemId).all<{ action: string }>();
    expect(audited.results.map((a) => a.action)).toEqual(['item.created', 'version.created']);
  });

  it('a folder version is addressed by the hash of its sorted (path, sha256) list', async () => {
    const r = await upload([{ path: 'site/index.html', body: '<!doctype html><p>x' }, { path: 'site/app.js', body: 'console.log(1)' }]);
    const list = [['site/app.js', await sha256Hex(new TextEncoder().encode('console.log(1)'))], ['site/index.html', await sha256Hex(new TextEncoder().encode('<!doctype html><p>x'))]];
    expect(r.body.sha256).toBe(await sha256Hex(JSON.stringify(list)));
    expect(r.body.mediaType).toBe('text/html; charset=utf-8');
  });

  it('identical bytes are stored once; a new version of the same item is n+1', async () => {
    const first = await upload([{ path: 'a.txt', body: 'same' }]);
    const second = await upload([{ path: 'a.txt', body: 'same' }], { item: first.body.itemId });
    expect(second.body).toMatchObject({ itemId: first.body.itemId, version: 2, sha256: first.body.sha256 });
    const listed = await env.BLOBS.list({ prefix: `blobs/${first.body.sha256}` });
    expect(listed.objects).toHaveLength(1);
  });

  it('refuses a commit with files still missing', async () => {
    const created = await SELF.fetch(`${API}/api/v1/uploads`, { method: 'POST', headers: { ...devHeaders(), 'content-type': 'application/json' }, body: JSON.stringify({ title: 't', files: [{ path: 'a.txt', bytes: 1, sha256: 'a'.repeat(64) }] }) });
    const { uploadId } = await created.json<{ uploadId: string }>();
    const res = await SELF.fetch(`${API}/api/v1/uploads/${uploadId}/commit`, { method: 'POST', headers: devHeaders() });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'incomplete', missing: ['a.txt'] });
  });

  it('a secret is refused naming file and line; an override is recorded and lets it through', async () => {
    const refused = await upload([{ path: 'src/config.ts', body: `ok\n${SECRET}\n` }]);
    expect(refused.status).toBe(422);
    expect(refused.body).toEqual({ error: 'secret_found', findings: [{ path: 'src/config.ts', line: 2, rule: 'github-token' }] });

    const allowed = await upload([{ path: 'src/config.ts', body: `ok\n${SECRET}\n` }], { override: 'test fixture, revoked key' });
    expect(allowed.status).toBe(201);
    const v = await env.DB.prepare(`SELECT scan_override FROM versions WHERE item_id = ?`).bind(allowed.body.itemId).first<{ scan_override: number }>();
    expect(v?.scan_override).toBe(1);
    const rec = await env.DB.prepare(`SELECT actor, detail FROM audit_events WHERE action = 'scan.overridden' AND detail LIKE ?`).bind(`%${allowed.uploadId}%`).first<{ actor: string; detail: string }>();
    expect(rec?.actor).toBe('prn_000000000000000000a1');
    expect(JSON.parse(rec!.detail)).toEqual({ uploadId: allowed.uploadId, reason: 'test fixture, revoked key', findings: [{ path: 'src/config.ts', line: 2, rule: 'github-token' }] });
  });

  it('an override with nothing found is refused, and needs a reason', async () => {
    const r = await upload([{ path: 'a.txt', body: 'clean' }], { commit: false });
    const res = await SELF.fetch(`${API}/api/v1/uploads/${r.uploadId}/override`, { method: 'POST', headers: { ...devHeaders(), 'content-type': 'application/json' }, body: JSON.stringify({ reason: 'x' }) });
    expect(res.status).toBe(409);
    const s = await upload([{ path: 'a.ts', body: SECRET }], { commit: false });
    const empty = await SELF.fetch(`${API}/api/v1/uploads/${s.uploadId}/override`, { method: 'POST', headers: { ...devHeaders(), 'content-type': 'application/json' }, body: JSON.stringify({ reason: '' }) });
    expect(empty.status).toBe(400);
  });

  it('committing twice answers the same result, and repairs a missing manifest', async () => {
    const r = await upload([{ path: 'a.txt', body: 'twice' }]);
    await env.BLOBS.delete(`manifests/${r.body.itemId}/1.json`);
    const again = await SELF.fetch(`${API}/api/v1/uploads/${r.uploadId}/commit`, { method: 'POST', headers: devHeaders() });
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual(r.body);
    expect(await env.BLOBS.head(`manifests/${r.body.itemId}/1.json`)).not.toBeNull();
  });

  it('only the uploader or an owner may add a version to an item', async () => {
    const r = await upload([{ path: 'a.txt', body: 'mine' }]);
    const other = await upload([{ path: 'a.txt', body: 'theirs' }], { item: r.body.itemId, headers: devHeaders(HUMAN_2) });
    expect(other.status).toBe(404);
  });
});
```

Run:

```bash
pnpm --filter @superlibrary/api test test/commit.test.ts
```

Expected: FAIL — commit answers `501 not_implemented`.

- [ ] **Step 2: Implement the manifest**

Append to `packages/contract/src/content.ts`:

```ts
import type { View } from './model';

/** One version as the content Worker sees it: R2 `manifests/<itemId>/<version>.json` (plan D7). */
export interface Manifest {
  itemId: string;
  version: number;
  entry: string;
  /** ISO time after which the content Worker refuses to serve it. */
  expiresAt: string | null;
  files: Record<string, { sha256: string; bytes: number; mediaType: string; view: View }>;
}
```

Append to `apps/api/src/storage/blobs.ts`:

```ts
import type { Manifest, View } from '@superlibrary/contract';
import type { Env } from '../env';

export async function writeManifest(env: Env, itemId: string, version: number): Promise<void> {
  const item = await env.DB.prepare(`SELECT expires_at FROM items WHERE id = ?`).bind(itemId).first<{ expires_at: string | null }>();
  const v = await env.DB.prepare(`SELECT entry FROM versions WHERE item_id = ? AND version = ?`).bind(itemId, version).first<{ entry: string }>();
  if (!item || !v) throw new Error(`no such version ${itemId}@${version}`);
  const rows = await env.DB.prepare(`SELECT path, sha256, bytes, media_type, view FROM version_files WHERE item_id = ? AND version = ? ORDER BY path`).bind(itemId, version).all<{ path: string; sha256: string; bytes: number; media_type: string; view: View }>();
  const manifest: Manifest = {
    itemId, version, entry: v.entry, expiresAt: item.expires_at,
    files: Object.fromEntries(rows.results.map((r) => [r.path, { sha256: r.sha256, bytes: r.bytes, mediaType: r.media_type, view: r.view }])),
  };
  await env.BLOBS.put(manifestKey(itemId, version), JSON.stringify(manifest), { httpMetadata: { contentType: 'application/json' } });
}

/** Revocation (spec §12) takes effect at once: without its manifest a version cannot be served. */
export async function deleteManifest(env: Env, itemId: string, version: number): Promise<void> {
  await env.BLOBS.delete(manifestKey(itemId, version));
}
```

- [ ] **Step 3: Implement override and commit**

Replace the two stubs at the end of `apps/api/src/uploads/routes.ts` (and add `writeManifest` to the `../storage/blobs` import, `z` from `zod`, and `type CommitResult` from the contract):

```ts
const OverrideBody = z.object({ reason: z.string().trim().min(1).max(500) });

async function findingsOf(env: Env, id: string) {
  return (await env.DB.prepare(`SELECT path, line, rule FROM secret_findings WHERE session_id = ? ORDER BY path, line, rule`).bind(id).all<{ path: string; line: number; rule: string }>()).results;
}

async function overrideScan(request: Request, env: Env, p: Person, id: string): Promise<Response> {
  const s = await ownSession(env, p, id);
  if (s instanceof Response) return s;
  if (s.state !== 'open') return error(409, 'already_committed');
  const parsed = OverrideBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return error(400, 'invalid', { detail: 'a reason is required' });
  const findings = await findingsOf(env, id);
  if (findings.length === 0) return error(409, 'nothing_to_override');
  await env.DB.batch([
    env.DB.prepare(`UPDATE upload_sessions SET override_reason = ?, override_by = ?, override_at = datetime('now') WHERE id = ?`).bind(parsed.data.reason, p.principalId, id),
    // Spec §8: "The override is recorded." Who, why, and exactly what was waved through.
    audit(env.DB, { workspaceId: p.workspaceId, actor: p.principalId, act: p.act, action: 'scan.overridden', detail: { uploadId: id, reason: parsed.data.reason, findings } }),
  ]);
  return json({ overridden: true });
}

async function resultOf(env: Env, itemId: string, version: number): Promise<CommitResult> {
  const v = await env.DB.prepare(`SELECT sha256, media_type, total_bytes FROM versions WHERE item_id = ? AND version = ?`).bind(itemId, version).first<{ sha256: string; media_type: string; total_bytes: number }>();
  return { itemId, version, url: `${env.APP_URL}/a/${itemId}`, sha256: v!.sha256, mediaType: v!.media_type, bytes: v!.total_bytes };
}

async function commit(env: Env, p: Person, id: string): Promise<Response> {
  const s = await ownSession(env, p, id);
  if (s instanceof Response) return s;
  if (s.state === 'committed') {
    // Idempotent: a retried commit answers the first one's result and repairs its manifest.
    await writeManifest(env, s.result_item_id!, s.result_version!);
    return json(await resultOf(env, s.result_item_id!, s.result_version!), 200);
  }
  const files = (await env.DB.prepare(`SELECT path, sha256, bytes, received, media_type, view FROM upload_files WHERE session_id = ? ORDER BY path`).bind(id).all<{ path: string; sha256: string; bytes: number; received: number; media_type: string | null; view: string | null }>()).results;
  const missing = files.filter((f) => !f.received).map((f) => f.path);
  if (missing.length > 0) return error(409, 'incomplete', { missing });
  const findings = await findingsOf(env, id);
  if (findings.length > 0 && !s.override_reason) return error(422, 'secret_found', { findings });

  let itemId: string;
  let version: number;
  const statements: D1PreparedStatement[] = [];
  if (s.item_id) {
    const item = await env.DB.prepare(`SELECT latest_version, revoked_at FROM items WHERE id = ?`).bind(s.item_id).first<{ latest_version: number; revoked_at: string | null }>();
    if (!item) return error(404, 'not_found');
    if (item.revoked_at) return error(410, 'revoked');
    itemId = s.item_id;
    version = item.latest_version + 1;
    statements.push(env.DB.prepare(`UPDATE items SET latest_version = ?, title = ? WHERE id = ? AND latest_version = ?`).bind(version, s.title, itemId, item.latest_version));
  } else {
    itemId = newId('itm');
    version = 1;
    statements.push(
      env.DB.prepare(`INSERT INTO items (id, workspace_id, kind, title, scope, created_by, latest_version, expires_at) VALUES (?, ?, 'artifact', ?, ?, ?, 1, ?)`)
        .bind(itemId, p.workspaceId, s.title, s.scope, p.principalId, s.item_expires_at),
      audit(env.DB, { workspaceId: p.workspaceId, actor: p.principalId, act: p.act, action: 'item.created', itemId }),
    );
  }
  const entry = files.find((f) => f.path === s.entry)!;
  const sha256 = files.length === 1 ? files[0]!.sha256 : await sha256Hex(JSON.stringify(files.map((f) => [f.path, f.sha256])));
  const totalBytes = files.reduce((n, f) => n + f.bytes, 0);
  const override = findings.length > 0 ? 1 : 0;
  statements.push(
    env.DB.prepare(`INSERT INTO versions (item_id, version, entry, view, media_type, total_bytes, file_count, sha256, created_by, scan_override) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(itemId, version, entry.path, entry.view, entry.media_type, totalBytes, files.length, sha256, p.principalId, override),
    ...files.map((f) => env.DB.prepare(`INSERT INTO version_files (item_id, version, path, sha256, bytes, media_type, view) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(itemId, version, f.path, f.sha256, f.bytes, f.media_type, f.view)),
    env.DB.prepare(`UPDATE upload_sessions SET state = 'committed', result_item_id = ?, result_version = ? WHERE id = ? AND state = 'open'`).bind(itemId, version, id),
    env.DB.prepare(`DELETE FROM upload_files WHERE session_id = ?`).bind(id),
    audit(env.DB, { workspaceId: p.workspaceId, actor: p.principalId, act: p.act, action: 'version.created', itemId, version, detail: { uploadId: id, files: files.length, bytes: totalBytes, scanOverride: override === 1 } }),
  );
  try {
    await env.DB.batch(statements);
  } catch (e) {
    // Two commits for the same item raced to the same version number: the batch is one transaction,
    // so the loser wrote nothing. The client retries.
    if (e instanceof Error && /UNIQUE|PRIMARY KEY/i.test(e.message)) return error(409, 'version_conflict');
    throw e;
  }
  // After D1, never before: a manifest written for a version that then failed to commit would
  // overwrite the winner's. A failed write here is repaired by the idempotent retry above.
  await writeManifest(env, itemId, version);
  return json(await resultOf(env, itemId, version), 201);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm --filter @superlibrary/api test && pnpm --filter @superlibrary/contract typecheck && pnpm --filter @superlibrary/api typecheck
```

Expected: PASS. Revert-proof: replace `if (findings.length > 0 && !s.override_reason)` with `if (false)`; the refusal case fails; restore.

- [ ] **Step 5: Commit**

```bash
git add apps/api packages/contract
git commit -m "feat(api): commit uploads into immutable versions with R2 manifests; recorded scan override

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---

### Task 9: Reading — visibility, audit of every read, and the embed URL

**Files:**
- Create: `apps/api/src/items/visibility.ts`, `apps/api/src/items/sign.ts`, `apps/api/src/items/routes.ts`
- Modify: `apps/api/src/index.ts` (append `itemRoutes`)
- Test: `apps/api/test/helpers/signing.ts`, `apps/api/test/items.test.ts`

**Interfaces:**
- Consumes: `resolvePerson`, `Person`, `audit`, `signingMessage`, `formatToken`, `parseToken`, `contentLabel`, `encodePath`, `LIMITS`, `type ItemSummary`, `type VersionSummary`, `type EmbedGrant`.
- Produces:
  - `interface ItemRow { id; workspace_id; kind; title; scope; outcome; created_by; latest_version; expires_at; revoked_at; created_at }`, `canSee(p: Person, item: ItemRow): boolean`, `canManage(p: Person, item: ItemRow): boolean`, `isExpired(item: ItemRow, now?: number): boolean`, `loadItem(env, id): Promise<ItemRow | null>` (`items/visibility.ts`)
  - `signContent(env: Env, g: { itemId: string; version: number; exp: number; host: string }): Promise<string>` (the token) and `contentOrigin(env: Env, itemId: string): string` (`items/sign.ts`)
  - `GET /api/v1/items?limit&before` → `{ items: ItemSummary[], next: string | null }`; `GET /api/v1/items/:id` → `{ item: ItemSummary, versions: VersionSummary[] }`; `POST /api/v1/items/:id/embed { version? }` → `EmbedGrant`; `OPTIONS` on the embed path for `EMBED_HOSTS` origins. Audit actions `items.listed`, `item.read`, `item.viewed`.
  - `itemRoutes: Handler` exported from `items/routes.ts`; Task 10 adds its lifecycle routes to the same file.

- [ ] **Step 1: Write the failing tests**

`apps/api/test/helpers/signing.ts`:

```ts
import { env } from 'cloudflare:test';

let pair: Promise<CryptoKeyPair> | null = null;

/** A test Ed25519 pair; the private half is set as the Worker's signing secret. Returns the public key. */
export async function useSigningKey(): Promise<CryptoKey> {
  pair ??= crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']) as Promise<CryptoKeyPair>;
  const { privateKey, publicKey } = await pair;
  (env as unknown as Record<string, unknown>).URL_SIGNING_PRIVATE_KEY = JSON.stringify(await crypto.subtle.exportKey('jwk', privateKey));
  return publicKey;
}
```

`apps/api/test/items.test.ts`:

```ts
import { SELF, env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseToken, signingMessage } from '@superlibrary/contract';
import { API, upload } from './helpers/upload';
import { HUMAN_2, OTHER_ORG, devHeaders } from './helpers/org-plane';
import { useSigningKey } from './helpers/signing';

let publicKey: CryptoKey;
beforeAll(async () => { publicKey = await useSigningKey(); });

const embed = (id: string, body: object = {}, headers: Record<string, string> = devHeaders()) =>
  SELF.fetch(`${API}/api/v1/items/${id}/embed`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(body) });
const auditCount = async (action: string, itemId: string, actor = 'prn_000000000000000000a1') =>
  (await env.DB.prepare(`SELECT COUNT(*) AS n FROM audit_events WHERE action = ? AND item_id = ? AND actor = ?`).bind(action, itemId, actor).first<{ n: number }>())!.n;

describe('visibility (spec §4 as it applies to people in phase 1)', () => {
  it('a workspace item is visible to every member; another workspace gets 404, not 403', async () => {
    const r = await upload([{ path: 'a.md', body: '# a' }]);
    expect((await SELF.fetch(`${API}/api/v1/items/${r.body.itemId}`, { headers: devHeaders(HUMAN_2) })).status).toBe(200);
    const outsider = devHeaders('prn_000000000000000000f9', OTHER_ORG);
    for (const res of [await SELF.fetch(`${API}/api/v1/items/${r.body.itemId}`, { headers: outsider }), await embed(r.body.itemId, {}, outsider)]) {
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'not_found' });
    }
    const listed = await (await SELF.fetch(`${API}/api/v1/items`, { headers: outsider })).json<{ items: { id: string }[] }>();
    expect(listed.items.map((i) => i.id)).not.toContain(r.body.itemId);
  });

  it('a board-scoped item is visible only to its uploader until phase 3 (plan D11)', async () => {
    const r = await upload([{ path: 'b.md', body: '# b' }], { scope: 'board:brd_f47143722126442c' });
    expect((await SELF.fetch(`${API}/api/v1/items/${r.body.itemId}`)).status).toBe(401);
    expect((await SELF.fetch(`${API}/api/v1/items/${r.body.itemId}`, { headers: devHeaders() })).status).toBe(200);
    expect((await SELF.fetch(`${API}/api/v1/items/${r.body.itemId}`, { headers: devHeaders(HUMAN_2) })).status).toBe(404);
    const listed = await (await SELF.fetch(`${API}/api/v1/items?limit=100`, { headers: devHeaders(HUMAN_2) })).json<{ items: { id: string }[] }>();
    expect(listed.items.map((i) => i.id)).not.toContain(r.body.itemId);
  });
});

describe('every read is audited', () => {
  it('list, get and embed each write an audit row for the reader', async () => {
    const r = await upload([{ path: 'c.md', body: '# c' }]);
    await SELF.fetch(`${API}/api/v1/items/${r.body.itemId}`, { headers: devHeaders(HUMAN_2) });
    await embed(r.body.itemId, {}, devHeaders(HUMAN_2));
    expect(await auditCount('item.read', r.body.itemId, HUMAN_2)).toBe(1);
    expect(await auditCount('item.viewed', r.body.itemId, HUMAN_2)).toBe(1);
    await SELF.fetch(`${API}/api/v1/items`, { headers: devHeaders(HUMAN_2) });
    const listed = await env.DB.prepare(`SELECT COUNT(*) AS n FROM audit_events WHERE action = 'items.listed' AND actor = ?`).bind(HUMAN_2).first<{ n: number }>();
    expect(listed!.n).toBeGreaterThan(0);
  });
});

describe('the embed URL', () => {
  it('is a 5-minute signed URL for one item version on the item's own subdomain', async () => {
    const r = await upload([{ path: 'd.md', body: '# d' }]);
    const before = Math.floor(Date.now() / 1000);
    const grant = await (await embed(r.body.itemId)).json<{ url: string; downloadUrl: string; expiresAt: string; version: number; itemUrl: string }>();
    const u = new URL(grant.url);
    expect(u.origin).toBe(`https://${r.body.itemId.replace('_', '-')}.content.test`);
    expect(u.pathname).toBe('/_view');
    const t = parseToken(u.searchParams.get('sig')!)!;
    expect(t.version).toBe(1);
    expect(t.exp - before).toBeGreaterThanOrEqual(299);
    expect(t.exp - before).toBeLessThanOrEqual(301);
    expect(t.host).toBe(API);
    expect(await crypto.subtle.verify('Ed25519', publicKey, t.sig, signingMessage({ itemId: r.body.itemId, version: 1, exp: t.exp, host: t.host }))).toBe(true);
    expect(grant.downloadUrl).toBe(`https://${r.body.itemId.replace('_', '-')}.content.test/s/${u.searchParams.get('sig')}/d.md?download=1`);
    expect(grant.itemUrl).toBe(`${API}/a/${r.body.itemId}/v/1`);
    expect(Date.parse(grant.expiresAt) / 1000).toBe(t.exp);
  });

  it('signs the requesting host when it is allowed, and answers its CORS preflight; others get the app', async () => {
    const r = await upload([{ path: 'e.md', body: '# e' }]);
    const pre = await SELF.fetch(`${API}/api/v1/items/${r.body.itemId}/embed`, { method: 'OPTIONS', headers: { Origin: 'https://host.test', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization, content-type' } });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-origin')).toBe('https://host.test');
    expect(pre.headers.get('access-control-allow-credentials')).toBeNull();
    const fromHost = await embed(r.body.itemId, {}, { ...devHeaders(), Origin: 'https://host.test' });
    expect(fromHost.headers.get('access-control-allow-origin')).toBe('https://host.test');
    expect(parseToken(new URL((await fromHost.json<{ url: string }>()).url).searchParams.get('sig')!)!.host).toBe('https://host.test');
    const evil = await embed(r.body.itemId, {}, { ...devHeaders(), Origin: 'https://evil.test' });
    expect(evil.headers.get('access-control-allow-origin')).toBeNull();
    expect(parseToken(new URL((await evil.json<{ url: string }>()).url).searchParams.get('sig')!)!.host).toBe(API);
    const evilPre = await SELF.fetch(`${API}/api/v1/items/${r.body.itemId}/embed`, { method: 'OPTIONS', headers: { Origin: 'https://evil.test', 'Access-Control-Request-Method': 'POST' } });
    expect(evilPre.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('names a version, refuses one that does not exist, and has no download for a folder', async () => {
    const r = await upload([{ path: 's/index.html', body: '<!doctype html>' }, { path: 's/a.css', body: 'p{}' }]);
    expect((await embed(r.body.itemId, { version: 2 })).status).toBe(404);
    const g = await (await embed(r.body.itemId, { version: 1 })).json<{ downloadUrl: string | null }>();
    expect(g.downloadUrl).toBeNull();
  });
});

describe('item listing and detail', () => {
  it('lists newest first with a cursor, and shows versions', async () => {
    const h = devHeaders('prn_000000000000000000c1', 'org_00000000000000000f06');
    const a = await upload([{ path: 'a.txt', body: 'a' }], { headers: h, title: 'A' });
    const b = await upload([{ path: 'b.txt', body: 'b' }], { headers: h, title: 'B' });
    await upload([{ path: 'b.txt', body: 'b2' }], { headers: h, item: b.body.itemId, title: 'B' });
    const page1 = await (await SELF.fetch(`${API}/api/v1/items?limit=1`, { headers: h })).json<{ items: { id: string }[]; next: string }>();
    expect(page1.items.map((i) => i.id)).toEqual([b.body.itemId]);
    const page2 = await (await SELF.fetch(`${API}/api/v1/items?limit=1&before=${encodeURIComponent(page1.next)}`, { headers: h })).json<{ items: { id: string }[] }>();
    expect(page2.items.map((i) => i.id)).toEqual([a.body.itemId]);
    const detail = await (await SELF.fetch(`${API}/api/v1/items/${b.body.itemId}`, { headers: h })).json<{ item: { latestVersion: number }; versions: { version: number }[] }>();
    expect(detail.item.latestVersion).toBe(2);
    expect(detail.versions.map((v) => v.version)).toEqual([2, 1]);
  });
});
```

Run:

```bash
pnpm --filter @superlibrary/api test test/items.test.ts
```

Expected: FAIL — `/api/v1/items/...` answers `404 not_found` for everything, including the uploader.

- [ ] **Step 2: Implement visibility and signing**

`apps/api/src/items/visibility.ts`:

```ts
import type { Env } from '../env';
import type { Person } from '../auth/caller';

export interface ItemRow {
  id: string; workspace_id: string; kind: 'artifact' | 'work-record'; title: string; scope: string; outcome: string;
  created_by: string; latest_version: number; expires_at: string | null; revoked_at: string | null; created_at: string;
}

export const loadItem = (env: Env, id: string) => env.DB.prepare(`SELECT * FROM items WHERE id = ?`).bind(id).first<ItemRow>();

/**
 * Spec §4 for people, phase 1 (plan D11): a member sees `workspace` items; a board item only if
 * they uploaded it, until phase 3 asks Superpipeline which boards they can read. This is the one
 * definition: the list query below says the same thing in SQL and a test holds them together.
 */
export function canSee(p: Person, item: ItemRow): boolean {
  return item.workspace_id === p.workspaceId && (item.scope === 'workspace' || item.created_by === p.principalId);
}
export const VISIBLE_SQL = `workspace_id = ?1 AND (scope = 'workspace' OR created_by = ?2)`;

/** Revoke and expire (spec §12, plan D12): the uploader, or an owner of the workspace. */
export function canManage(p: Person, item: ItemRow): boolean {
  return canSee(p, item) && (item.created_by === p.principalId || p.role === 'owner');
}

export function isExpired(item: ItemRow, now = Date.now()): boolean {
  return item.expires_at !== null && Date.parse(item.expires_at) <= now;
}
```

`apps/api/src/items/sign.ts`:

```ts
import { contentLabel, formatToken, signingMessage, type ContentGrant } from '@superlibrary/contract';
import type { Env } from '../env';

let cached: { jwk: string; key: Promise<CryptoKey> } | null = null;

function signingKey(env: Env): Promise<CryptoKey> {
  const jwk = env.URL_SIGNING_PRIVATE_KEY;
  if (!jwk) throw new Error('URL_SIGNING_PRIVATE_KEY is not set');
  if (cached?.jwk !== jwk) cached = { jwk, key: crypto.subtle.importKey('jwk', JSON.parse(jwk), { name: 'Ed25519' }, false, ['sign']) };
  return cached.key;
}

/** The API holds the signing half; the content Worker only the verification half (spec §6). */
export async function signContent(env: Env, g: ContentGrant): Promise<string> {
  const sig = new Uint8Array(await crypto.subtle.sign('Ed25519', await signingKey(env), signingMessage(g)));
  return formatToken({ version: g.version, exp: g.exp, host: g.host, sig });
}

export function contentOrigin(env: Env, itemId: string): string {
  return env.CONTENT_ORIGIN_TEMPLATE.replace('{label}', contentLabel(itemId));
}
```

- [ ] **Step 3: Implement the routes**

`apps/api/src/items/routes.ts`:

```ts
import { LIMITS, encodePath, type EmbedGrant, type ItemSummary, type VersionSummary, type View } from '@superlibrary/contract';
import type { Env } from '../env';
import { error, json, type Handler } from '../http';
import { audit } from '../audit';
import { resolvePerson, type Person } from '../auth/caller';
import { VISIBLE_SQL, canSee, isExpired, loadItem, type ItemRow } from './visibility';
import { contentOrigin, signContent } from './sign';

const hostsOf = (s: string) => s.split(/\s+/).filter((x) => x !== '');

export function summary(i: ItemRow): ItemSummary {
  return {
    id: i.id, kind: i.kind, title: i.title, scope: i.scope as ItemSummary['scope'], outcome: i.outcome as ItemSummary['outcome'],
    createdBy: i.created_by, createdAt: i.created_at, latestVersion: i.latest_version, expiresAt: i.expires_at, revokedAt: i.revoked_at,
  };
}

/** The visible, live item, or the refusal a caller should see. Invisible is 404 (plan D11). */
export async function readable(env: Env, p: Person, id: string): Promise<ItemRow | Response> {
  const item = await loadItem(env, id);
  if (!item || !canSee(p, item)) return error(404, 'not_found');
  if (item.revoked_at) return error(410, 'revoked');
  if (isExpired(item)) return error(410, 'expired');
  return item;
}

async function list(env: Env, p: Person, url: URL): Promise<Response> {
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 50) || 50, 1), 100);
  const before = url.searchParams.get('before');
  const [bAt, bId] = before ? (before.split('|') as [string, string]) : [null, null];
  const rows = await env.DB.prepare(
    `SELECT * FROM items WHERE ${VISIBLE_SQL} AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?3)
       AND (?4 IS NULL OR created_at < ?4 OR (created_at = ?4 AND id < ?5))
     ORDER BY created_at DESC, id DESC LIMIT ?6`,
  ).bind(p.workspaceId, p.principalId, new Date().toISOString(), bAt, bId, limit + 1).all<ItemRow>();
  const page = rows.results.slice(0, limit);
  const last = page.at(-1);
  await audit(env.DB, { workspaceId: p.workspaceId, actor: p.principalId, act: p.act, action: 'items.listed', detail: { count: page.length } }).run();
  return json({ items: page.map(summary), next: rows.results.length > limit && last ? `${last.created_at}|${last.id}` : null });
}

async function detail(env: Env, p: Person, id: string): Promise<Response> {
  const item = await readable(env, p, id);
  if (item instanceof Response) return item;
  const versions = await env.DB.prepare(`SELECT * FROM versions WHERE item_id = ? ORDER BY version DESC`).bind(id).all<{
    version: number; entry: string; view: View; media_type: string; total_bytes: number; file_count: number; sha256: string; created_at: string; revoked_at: string | null; scan_override: number;
  }>();
  await audit(env.DB, { workspaceId: p.workspaceId, actor: p.principalId, act: p.act, action: 'item.read', itemId: id }).run();
  const out: VersionSummary[] = versions.results.map((v) => ({
    version: v.version, entry: v.entry, view: v.view, mediaType: v.media_type, totalBytes: v.total_bytes, fileCount: v.file_count,
    sha256: v.sha256, createdAt: v.created_at, revokedAt: v.revoked_at, scanOverride: v.scan_override === 1,
  }));
  return json({ item: summary(item), versions: out });
}

function corsFor(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin');
  return origin && hostsOf(env.EMBED_HOSTS).includes(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
}

async function embed(request: Request, env: Env, p: Person, id: string): Promise<Response> {
  const item = await readable(env, p, id);
  if (item instanceof Response) return item;
  const body = (await request.json().catch(() => ({}))) as { version?: unknown };
  const asked = typeof body.version === 'number' && Number.isInteger(body.version) ? body.version : null;
  const v = asked
    ? await env.DB.prepare(`SELECT version, entry, file_count, revoked_at FROM versions WHERE item_id = ? AND version = ?`).bind(id, asked).first<{ version: number; entry: string; file_count: number; revoked_at: string | null }>()
    : await env.DB.prepare(`SELECT version, entry, file_count, revoked_at FROM versions WHERE item_id = ? AND revoked_at IS NULL ORDER BY version DESC LIMIT 1`).bind(id).first<{ version: number; entry: string; file_count: number; revoked_at: string | null }>();
  if (!v) return asked ? error(404, 'not_found') : error(410, 'revoked');
  if (v.revoked_at) return error(410, 'revoked');

  // Plan D18: the frame may talk to exactly one origin — the caller's, when it is an allowed host.
  const origin = request.headers.get('Origin');
  const host = origin && [env.APP_URL, ...hostsOf(env.EMBED_HOSTS)].includes(origin) ? origin : env.APP_URL;
  const exp = Math.floor(Date.now() / 1000) + LIMITS.embedTtlSeconds;
  const token = await signContent(env, { itemId: id, version: v.version, exp, host });
  const base = contentOrigin(env, id);
  const grant: EmbedGrant = {
    url: `${base}/_view?sig=${token}`,
    downloadUrl: v.file_count === 1 ? `${base}/s/${token}/${encodePath(v.entry)}?download=1` : null,
    expiresAt: new Date(exp * 1000).toISOString(),
    version: v.version,
    itemUrl: `${env.APP_URL}/a/${id}/v/${v.version}`,
  };
  await audit(env.DB, { workspaceId: p.workspaceId, actor: p.principalId, act: p.act, action: 'item.viewed', itemId: id, version: v.version, detail: { host } }).run();
  return json(grant, 200, corsFor(request, env));
}

const ITEM = /^\/api\/v1\/items\/(itm_[0-9a-f]{16})(\/embed)?$/;

export const itemRoutes: Handler = async (request, env, _ctx, url) => {
  if (url.pathname === '/api/v1/items' && request.method === 'GET') {
    const p = await resolvePerson(request, env);
    return p instanceof Response ? p : list(env, p, url);
  }
  const m = ITEM.exec(url.pathname);
  if (!m) return null;
  const [, id, sub] = m as unknown as [string, string, string | undefined];
  if (sub === '/embed' && request.method === 'OPTIONS') {
    const cors = corsFor(request, env);
    if (!cors['Access-Control-Allow-Origin']) return new Response(null, { status: 204 });
    return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Max-Age': '600' } });
  }
  const p = await resolvePerson(request, env);
  if (p instanceof Response) {
    for (const [k, v] of Object.entries(corsFor(request, env))) p.headers.set(k, v);
    return p;
  }
  if (!sub && request.method === 'GET') return detail(env, p, id);
  if (sub === '/embed' && request.method === 'POST') return embed(request, env, p, id);
  return null;
};
```

Append to `apps/api/src/index.ts`: `import { itemRoutes } from './items/routes';` and `const handlers: Handler[] = [uploadRoutes, itemRoutes];`.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm --filter @superlibrary/api test && pnpm --filter @superlibrary/api typecheck
```

Expected: PASS. Revert-proof both definitions of visibility: change `canSee` to return `item.workspace_id === p.workspaceId` — the board-scope detail assertion fails; restore; change `VISIBLE_SQL` to `workspace_id = ?1` — the board-scope listing assertion fails; restore.

- [ ] **Step 5: Commit**

```bash
git add apps/api
git commit -m "feat(api): visible reads, every read audited, 5-minute signed embed URLs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---

### Task 10: Lifecycle — revoke, expiry, and the retention sweep

**Files:**
- Create: `apps/api/src/lifecycle/retention.ts`
- Modify: `apps/api/src/items/routes.ts` (revoke, version revoke, PATCH expiry), `apps/api/src/index.ts` (`queue`, `scheduled`)
- Test: `apps/api/test/lifecycle.test.ts`, `apps/api/test/retention.test.ts`

**Interfaces:**
- Consumes: `readable`, `canManage`, `loadItem`, `writeManifest`, `deleteManifest`, `blobKey`, `audit`, `LIMITS`, `RetentionMessage`.
- Produces:
  - `POST /api/v1/items/:id/revoke { reason? }` → `200 { revoked: true }`; `POST /api/v1/items/:id/versions/:n/revoke` → `200 { revoked: true, version }`; `PATCH /api/v1/items/:id { expiresAt: string | null }` → `200 { item: ItemSummary }`; refusals `403 not_permitted`, `400 invalid`, `404`, `410`. Audit `item.revoked`, `version.revoked`, `item.expiry_set`.
  - `deleteItem(env: Env, itemId: string, actor: string, reason: string): Promise<void>` and `sweep(env: Env, now: number): Promise<SweepReport>` with `interface SweepReport { expired: string[]; unreferenced: string[]; deletedUnreferenced: boolean; abandonedUploads: string[]; deletedBlobs: string[] }` (`lifecycle/retention.ts`)
  - `scheduled` sends `{ type: 'sweep', at }` to `RETENTION`; `queue` runs `sweep` for each message and acks.

- [ ] **Step 1: Write the failing tests**

`apps/api/test/lifecycle.test.ts`:

```ts
import { SELF, env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { API, upload } from './helpers/upload';
import { devHeaders } from './helpers/org-plane';
import { useSigningKey } from './helpers/signing';

beforeAll(useSigningKey);
const post = (path: string, body: object = {}, headers = devHeaders()) =>
  SELF.fetch(`${API}${path}`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(body) });
const patch = (id: string, body: object, headers = devHeaders()) =>
  SELF.fetch(`${API}/api/v1/items/${id}`, { method: 'PATCH', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('revocation is immediate', () => {
  it('revoking an item deletes every manifest at once and refuses new embeds', async () => {
    const r = await upload([{ path: 'a.md', body: '# 1' }]);
    await upload([{ path: 'a.md', body: '# 2' }], { item: r.body.itemId });
    const res = await post(`/api/v1/items/${r.body.itemId}/revoke`, { reason: 'posted by mistake' });
    expect(res.status).toBe(200);
    expect(await env.BLOBS.head(`manifests/${r.body.itemId}/1.json`)).toBeNull();
    expect(await env.BLOBS.head(`manifests/${r.body.itemId}/2.json`)).toBeNull();
    expect((await post(`/api/v1/items/${r.body.itemId}/embed`)).status).toBe(410);
    const a = await env.DB.prepare(`SELECT detail FROM audit_events WHERE action = 'item.revoked' AND item_id = ?`).bind(r.body.itemId).first<{ detail: string }>();
    expect(JSON.parse(a!.detail)).toEqual({ reason: 'posted by mistake' });
  });

  it('revoking one version leaves the others viewable; the default embed is the newest live one', async () => {
    const r = await upload([{ path: 'a.md', body: '# v1' }]);
    await upload([{ path: 'a.md', body: '# v2' }], { item: r.body.itemId });
    expect((await post(`/api/v1/items/${r.body.itemId}/versions/2/revoke`)).status).toBe(200);
    expect(await env.BLOBS.head(`manifests/${r.body.itemId}/2.json`)).toBeNull();
    expect(await env.BLOBS.head(`manifests/${r.body.itemId}/1.json`)).not.toBeNull();
    expect((await post(`/api/v1/items/${r.body.itemId}/embed`, { version: 2 })).status).toBe(410);
    expect(await (await post(`/api/v1/items/${r.body.itemId}/embed`)).json()).toMatchObject({ version: 1 });
  });

  it('only the uploader or an owner may revoke', async () => {
    // A fresh workspace, so who is owner does not depend on test order: the first person seen is.
    const org = 'org_00000000000000000a77';
    const owner = devHeaders('prn_000000000000000000b1', org);
    const uploader = devHeaders('prn_000000000000000000b2', org);
    const stranger = devHeaders('prn_000000000000000000b3', org);
    await SELF.fetch(`${API}/api/v1/me`, { headers: owner });
    const r = await upload([{ path: 'a.md', body: '# owned' }], { headers: uploader });
    const refused = await post(`/api/v1/items/${r.body.itemId}/revoke`, {}, stranger);
    expect(refused.status).toBe(403);
    expect(await refused.json()).toEqual({ error: 'not_permitted' });
    expect((await post(`/api/v1/items/${r.body.itemId}/revoke`, {}, owner)).status).toBe(200);
  });
});

describe('expiry', () => {
  it('sets a future expiry, writes it into the manifests, and refuses a past one', async () => {
    const r = await upload([{ path: 'a.md', body: '# e' }]);
    const at = new Date(Date.now() + 86_400_000).toISOString();
    const res = await patch(r.body.itemId, { expiresAt: at });
    expect(res.status).toBe(200);
    expect((await (await env.BLOBS.get(`manifests/${r.body.itemId}/1.json`))!.json<{ expiresAt: string }>()).expiresAt).toBe(at);
    expect((await patch(r.body.itemId, { expiresAt: new Date(Date.now() - 1000).toISOString() })).status).toBe(400);
    expect((await patch(r.body.itemId, { expiresAt: null })).status).toBe(200);
  });
});
```

`apps/api/test/retention.test.ts`:

```ts
import { createMessageBatch, createScheduledController, env, getQueueResult, createExecutionContext } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';
import worker from '../src/index';
import { sweep } from '../src/lifecycle/retention';
import { upload } from './helpers/upload';

const DAY = 86_400_000;
const age = (itemId: string, days: number) =>
  env.DB.prepare(`UPDATE items SET created_at = datetime('now', ?) WHERE id = ?`).bind(`-${days} days`, itemId).run();
const exists = async (itemId: string) => (await env.DB.prepare(`SELECT 1 FROM items WHERE id = ?`).bind(itemId).first()) !== null;
const asMode = (mode: 'report' | 'enforce') => ({ ...env, RETENTION_MODE: mode });

describe('retention sweep (spec §12, plan D14)', () => {
  it('in report mode, an unreferenced 31-day-old artifact is kept and reported', async () => {
    const r = await upload([{ path: 'old.txt', body: 'old report-mode' }]);
    await age(r.body.itemId, 31);
    const report = await sweep(asMode('report'), Date.now());
    expect(report.unreferenced).toContain(r.body.itemId);
    expect(report.deletedUnreferenced).toBe(false);
    expect(await exists(r.body.itemId)).toBe(true);
  });

  it('in enforce mode it is deleted with its bytes; a referenced one and a young one are kept', async () => {
    const old = await upload([{ path: 'old.txt', body: 'old enforce' }]);
    const kept = await upload([{ path: 'kept.txt', body: 'referenced' }]);
    const young = await upload([{ path: 'young.txt', body: 'young' }]);
    await age(old.body.itemId, 31);
    await age(kept.body.itemId, 31);
    await age(young.body.itemId, 29);
    await env.DB.prepare(`INSERT INTO item_references (item_id, from_kind, from_id) VALUES (?, 'card', 'crd_0000000000000001')`).bind(kept.body.itemId).run();
    const report = await sweep(asMode('enforce'), Date.now());
    expect(report.deletedUnreferenced).toBe(true);
    expect(await exists(old.body.itemId)).toBe(false);
    expect(await env.BLOBS.head(`blobs/${old.body.sha256}`)).toBeNull();
    expect(await env.BLOBS.head(`manifests/${old.body.itemId}/1.json`)).toBeNull();
    expect(await exists(kept.body.itemId)).toBe(true);
    expect(await exists(young.body.itemId)).toBe(true);
  });

  it('deleting one item keeps a blob another item still uses', async () => {
    const a = await upload([{ path: 'a.txt', body: 'shared bytes' }]);
    const b = await upload([{ path: 'b.txt', body: 'shared bytes' }]);
    await env.DB.prepare(`UPDATE items SET expires_at = ? WHERE id = ?`).bind(new Date(Date.now() - 1000).toISOString(), a.body.itemId).run();
    await sweep(asMode('report'), Date.now());
    expect(await exists(a.body.itemId)).toBe(false);
    expect(await env.BLOBS.head(`blobs/${b.body.sha256}`)).not.toBeNull();
  });

  it('expired items and abandoned uploads go in either mode; a second sweep changes nothing', async () => {
    const r = await upload([{ path: 'x.txt', body: 'expires' }], { expiresAt: new Date(Date.now() + 60_000).toISOString() });
    const abandoned = await upload([{ path: 'y.txt', body: 'never committed' }], { commit: false });
    const report = await sweep(asMode('report'), Date.now() + 2 * DAY);
    expect(report.expired).toContain(r.body.itemId);
    expect(report.abandonedUploads).toContain(abandoned.uploadId);
    expect(await env.DB.prepare(`SELECT 1 FROM upload_sessions WHERE id = ?`).bind(abandoned.uploadId).first()).toBeNull();
    const again = await sweep(asMode('report'), Date.now() + 2 * DAY);
    expect(again.expired).toEqual([]);
    expect(again.abandonedUploads).toEqual([]);
    const audited = await env.DB.prepare(`SELECT actor FROM audit_events WHERE action = 'item.deleted' AND item_id = ?`).bind(r.body.itemId).first<{ actor: string }>();
    expect(audited?.actor).toBe('retention');
  });

  it('the cron enqueues one sweep; the consumer runs it and acks', async () => {
    const send = vi.fn();
    const ctl = createScheduledController({ scheduledTime: Date.UTC(2026, 9, 9, 3), cron: '0 3 * * *' });
    await worker.scheduled!(ctl, { ...env, RETENTION: { send } as unknown as Queue }, createExecutionContext());
    expect(send).toHaveBeenCalledWith({ type: 'sweep', at: '2026-10-09T03:00:00.000Z' });
    const batch = createMessageBatch('superlibrary-retention', [{ id: 'm1', timestamp: new Date(), attempts: 1, body: { type: 'sweep', at: '2026-10-09T03:00:00.000Z' } }]);
    const ctx = createExecutionContext();
    await worker.queue!(batch, env, ctx);
    expect((await getQueueResult(batch, ctx)).explicitAcks).toEqual(['m1']);
  });
});

```

Run:

```bash
pnpm --filter @superlibrary/api test test/lifecycle.test.ts test/retention.test.ts
```

Expected: FAIL — revoke answers 404, `../src/lifecycle/retention` does not resolve.

- [ ] **Step 2: Implement deletion and the sweep**

`apps/api/src/lifecycle/retention.ts`:

```ts
import { LIMITS } from '@superlibrary/contract';
import type { Env } from '../env';
import { audit } from '../audit';
import { blobKey, manifestKey } from '../storage/blobs';

export interface SweepReport { expired: string[]; unreferenced: string[]; deletedUnreferenced: boolean; abandonedUploads: string[]; deletedBlobs: string[] }

/** Delete each blob nothing else uses: no version anywhere, no upload still declaring it. */
async function deleteOrphanBlobs(env: Env, shas: string[]): Promise<string[]> {
  const gone: string[] = [];
  for (const sha of new Set(shas)) {
    const used = await env.DB.prepare(`SELECT 1 FROM version_files WHERE sha256 = ?1 UNION SELECT 1 FROM upload_files WHERE sha256 = ?1 LIMIT 1`).bind(sha).first();
    if (used) continue;
    await env.BLOBS.delete(blobKey(sha));
    gone.push(sha);
  }
  return gone;
}

/** Spec §12 "Deletion removes everything": rows, manifests, and bytes no other version shares. */
export async function deleteItem(env: Env, itemId: string, actor: string, reason: string): Promise<string[]> {
  const item = await env.DB.prepare(`SELECT workspace_id FROM items WHERE id = ?`).bind(itemId).first<{ workspace_id: string }>();
  if (!item) return [];
  const files = (await env.DB.prepare(`SELECT version, sha256 FROM version_files WHERE item_id = ?`).bind(itemId).all<{ version: number; sha256: string }>()).results;
  const versions = (await env.DB.prepare(`SELECT version FROM versions WHERE item_id = ?`).bind(itemId).all<{ version: number }>()).results;
  for (const v of versions) await env.BLOBS.delete(manifestKey(itemId, v.version));
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM version_files WHERE item_id = ?`).bind(itemId),
    env.DB.prepare(`DELETE FROM versions WHERE item_id = ?`).bind(itemId),
    env.DB.prepare(`DELETE FROM item_references WHERE item_id = ?`).bind(itemId),
    env.DB.prepare(`DELETE FROM items WHERE id = ?`).bind(itemId),
    audit(env.DB, { workspaceId: item.workspace_id, actor, action: 'item.deleted', itemId, detail: { reason } }),
  ]);
  return deleteOrphanBlobs(env, files.map((f) => f.sha256));
}

export async function sweep(env: Env, now: number): Promise<SweepReport> {
  const nowIso = new Date(now).toISOString();
  const report: SweepReport = { expired: [], unreferenced: [], deletedUnreferenced: env.RETENTION_MODE === 'enforce', abandonedUploads: [], deletedBlobs: [] };

  // Expiry is a person's explicit choice: honoured in both modes.
  const expired = await env.DB.prepare(`SELECT id FROM items WHERE expires_at IS NOT NULL AND expires_at <= ?`).bind(nowIso).all<{ id: string }>();
  for (const { id } of expired.results) {
    report.expired.push(id);
    report.deletedBlobs.push(...(await deleteItem(env, id, 'retention', 'expired')));
  }

  // Unreferenced after 30 days (spec §12). Enforced only in "enforce" (plan D14).
  const cutoff = new Date(now - LIMITS.retentionDays * 86_400_000).toISOString().replace('T', ' ').slice(0, 19);
  const stale = await env.DB.prepare(
    `SELECT i.id, i.workspace_id FROM items i WHERE i.kind = 'artifact' AND i.created_at <= ?
       AND NOT EXISTS (SELECT 1 FROM item_references r WHERE r.item_id = i.id)`,
  ).bind(cutoff).all<{ id: string; workspace_id: string }>();
  for (const { id, workspace_id } of stale.results) {
    report.unreferenced.push(id);
    if (report.deletedUnreferenced) report.deletedBlobs.push(...(await deleteItem(env, id, 'retention', 'unreferenced for 30 days')));
    else await audit(env.DB, { workspaceId: workspace_id, actor: 'retention', action: 'retention.would_delete', itemId: id }).run();
  }

  // Uploads never committed, past their 24 hours.
  const abandoned = await env.DB.prepare(`SELECT id FROM upload_sessions WHERE state = 'open' AND expires_at <= ?`).bind(nowIso).all<{ id: string }>();
  for (const { id } of abandoned.results) {
    const shas = (await env.DB.prepare(`SELECT sha256 FROM upload_files WHERE session_id = ?`).bind(id).all<{ sha256: string }>()).results.map((r) => r.sha256);
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM upload_files WHERE session_id = ?`).bind(id),
      env.DB.prepare(`DELETE FROM secret_findings WHERE session_id = ?`).bind(id),
      env.DB.prepare(`DELETE FROM upload_sessions WHERE id = ?`).bind(id),
    ]);
    report.abandonedUploads.push(id);
    report.deletedBlobs.push(...(await deleteOrphanBlobs(env, shas)));
  }
  console.log('retention sweep', JSON.stringify({ mode: env.RETENTION_MODE, expired: report.expired.length, unreferenced: report.unreferenced.length, abandoned: report.abandonedUploads.length, blobs: report.deletedBlobs.length }));
  return report;
}
```

Note the two time formats: `created_at` is SQLite's `datetime('now')` (`YYYY-MM-DD HH:MM:SS`), compared with `cutoff` in that format; `expires_at` and session `expires_at` are ISO strings, compared with `nowIso`.

- [ ] **Step 3: Implement the routes and handlers**

Add to `apps/api/src/items/routes.ts` (import `canManage`, `writeManifest`, `deleteManifest` and `z`):

```ts
const RevokeBody = z.object({ reason: z.string().trim().max(500).optional() });
const PatchBody = z.object({ expiresAt: z.iso.datetime().nullable() });

async function manageable(env: Env, p: Person, id: string): Promise<ItemRow | Response> {
  const item = await loadItem(env, id);
  if (!item || !canSee(p, item)) return error(404, 'not_found');
  if (!canManage(p, item)) return error(403, 'not_permitted');
  if (item.revoked_at) return error(410, 'revoked');
  return item;
}

async function revokeItem(request: Request, env: Env, p: Person, id: string): Promise<Response> {
  const item = await manageable(env, p, id);
  if (item instanceof Response) return item;
  const body = RevokeBody.safeParse(await request.json().catch(() => ({})));
  const reason = body.success ? (body.data.reason ?? null) : null;
  const versions = (await env.DB.prepare(`SELECT version FROM versions WHERE item_id = ?`).bind(id).all<{ version: number }>()).results;
  // Manifests first: the moment the API says "revoked", the content origin already refuses.
  for (const v of versions) await deleteManifest(env, id, v.version);
  await env.DB.batch([
    env.DB.prepare(`UPDATE items SET revoked_at = datetime('now'), revoked_by = ?, revoke_reason = ? WHERE id = ?`).bind(p.principalId, reason, id),
    audit(env.DB, { workspaceId: p.workspaceId, actor: p.principalId, act: p.act, action: 'item.revoked', itemId: id, detail: reason ? { reason } : {} }),
  ]);
  return json({ revoked: true });
}

async function revokeVersion(env: Env, p: Person, id: string, version: number): Promise<Response> {
  const item = await manageable(env, p, id);
  if (item instanceof Response) return item;
  const v = await env.DB.prepare(`SELECT revoked_at FROM versions WHERE item_id = ? AND version = ?`).bind(id, version).first<{ revoked_at: string | null }>();
  if (!v) return error(404, 'not_found');
  await deleteManifest(env, id, version);
  if (!v.revoked_at) {
    await env.DB.batch([
      env.DB.prepare(`UPDATE versions SET revoked_at = datetime('now'), revoked_by = ? WHERE item_id = ? AND version = ?`).bind(p.principalId, id, version),
      audit(env.DB, { workspaceId: p.workspaceId, actor: p.principalId, act: p.act, action: 'version.revoked', itemId: id, version }),
    ]);
  }
  return json({ revoked: true, version });
}

async function setExpiry(request: Request, env: Env, p: Person, id: string): Promise<Response> {
  const item = await manageable(env, p, id);
  if (item instanceof Response) return item;
  const body = PatchBody.safeParse(await request.json().catch(() => null));
  if (!body.success) return error(400, 'invalid');
  const at = body.data.expiresAt;
  if (at !== null && Date.parse(at) <= Date.now()) return error(400, 'invalid', { detail: 'expiresAt must be in the future' });
  await env.DB.batch([
    env.DB.prepare(`UPDATE items SET expires_at = ? WHERE id = ?`).bind(at, id),
    audit(env.DB, { workspaceId: p.workspaceId, actor: p.principalId, act: p.act, action: 'item.expiry_set', itemId: id, detail: { expiresAt: at } }),
  ]);
  const live = (await env.DB.prepare(`SELECT version FROM versions WHERE item_id = ? AND revoked_at IS NULL`).bind(id).all<{ version: number }>()).results;
  for (const v of live) await writeManifest(env, id, v.version);
  return json({ item: summary((await loadItem(env, id))!) });
}
```

Extend the router: change `ITEM` to `/^\/api\/v1\/items\/(itm_[0-9a-f]{16})(\/embed|\/revoke|\/versions\/([1-9][0-9]*)\/revoke)?$/` and add before `return null;`:

```ts
  if (!sub && request.method === 'PATCH') return setExpiry(request, env, p, id);
  if (sub === '/revoke' && request.method === 'POST') return revokeItem(request, env, p, id);
  if (sub?.startsWith('/versions/') && request.method === 'POST') return revokeVersion(env, p, id, Number(m[3]));
```

In `apps/api/src/index.ts` replace `queue` and `scheduled`:

```ts
import { sweep } from './lifecycle/retention';
// …
  async queue(batch: MessageBatch<RetentionMessage>, env: Env) {
    for (const m of batch.messages) {
      // Idempotent: a duplicate delivery finds nothing left to do (spec §6).
      if (m.body?.type === 'sweep') await sweep(env, Date.now());
      m.ack();
    }
  },
  async scheduled(c: ScheduledController, env: Env) {
    await env.RETENTION.send({ type: 'sweep', at: new Date(c.scheduledTime).toISOString() });
  },
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm --filter @superlibrary/api test && pnpm --filter @superlibrary/api typecheck
```

Expected: PASS. Revert-proof: remove the `NOT EXISTS (… item_references …)` clause; "a referenced one … kept" fails; restore. Then make `deleteOrphanBlobs` skip its `SELECT 1 …` check; "deleting one item keeps a blob another item still uses" fails; restore.

- [ ] **Step 5: Commit and open PR 2**

```bash
git add apps/api
git commit -m "feat(api): revoke items and versions at once, expiry, retention sweep on a queue

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

This ends PR 2 (`feat/phase-1-artifacts`, Tasks 4-10). Open it with the PR recipe at the top of Task 21.

---

### Task 11: The content Worker — verify, serve, and the headers spec §9 demands

**Files:**
- Create: `apps/content/{package.json,tsconfig.json,wrangler.jsonc,vitest.config.ts}`, `apps/content/src/{index,headers,viewer-page}.ts`
- Create: `apps/content/viewer/{main.ts,viewer.css,vite.config.ts}` (a minimal viewer; Tasks 12-13 fill it)
- Create: `packages/contract/src/viewer.ts`; modify `packages/contract/src/index.ts`
- Create: `scripts/dev-keys.mjs`
- Test: `apps/content/test/content.test.ts`, `packages/contract/test/repo-invariants.test.ts`

**Interfaces:**
- Consumes: `parseToken`, `signingMessage`, `itemIdFromLabel`, `contentLabel`, `encodePath`, `contentCsp`, `type Manifest` (contract); R2 layout from Tasks 7-8 (`blobs/<sha>`, `manifests/<itemId>/<version>.json`).
- Produces:
  - `interface ViewerData { view: View; path: string; name: string; mediaType: string; bytes: number; sha256: string; rawUrl: string; baseUrl: string; host: string; text?: string; base64?: string }` and `TEXT_VIEWS: ReadonlySet<View>` (`packages/contract/src/viewer.ts`) — the viewer bundle (Tasks 12-13) reads exactly this from `<script id="sl-data" type="application/json">`
  - HTTP on `<itm-label>.<CONTENT_DOMAIN>`: `GET /_view?sig=<token>` → viewer document, or `302 /s/<token>/<entry>` for an HTML entry; `GET|HEAD /s/<token>/<path>[?download=1]` → raw bytes (Range supported); `GET /_viewer/*` → the bundle; refusals `403 expired | invalid_signature | host_not_allowed`, `404 not_found`, `405`, `410 gone` as `{ error }` JSON.
  - `scripts/dev-keys.mjs`: writes `apps/api/.dev.vars` (`URL_SIGNING_PRIVATE_KEY=…`) and `apps/content/.dev.vars` (`URL_SIGNING_PUBLIC_KEY=…`) with a fresh dev pair. Both files are gitignored (`.dev.vars`).

- [ ] **Step 1: Write the failing tests**

```bash
mkdir -p apps/content/src apps/content/test apps/content/viewer scripts
```

`apps/content/test/content.test.ts`:

```ts
import { createExecutionContext, env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { contentCsp, contentLabel, formatToken, signingMessage, type Manifest } from '@superlibrary/contract';
import worker, { type Env } from '../src/index';

const APP = 'https://app.test';
const ITEM = 'itm_00000000000000c1';
const OTHER = 'itm_00000000000000c2';
let pair: CryptoKeyPair;
let PUB = '';
beforeAll(async () => {
  pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  PUB = JSON.stringify(await crypto.subtle.exportKey('jwk', pair.publicKey));
});
const testEnv = () => ({ ...env, URL_SIGNING_PUBLIC_KEY: PUB }) as unknown as Env;

async function token(itemId: string, version: number, o: { exp?: number; host?: string; key?: CryptoKey } = {}) {
  const exp = o.exp ?? Math.floor(Date.now() / 1000) + 300;
  const host = o.host ?? APP;
  const sig = new Uint8Array(await crypto.subtle.sign('Ed25519', o.key ?? pair.privateKey, signingMessage({ itemId, version, exp, host })));
  return formatToken({ version, exp, host, sig });
}
const sha = async (s: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');

async function seed(itemId: string, version: number, files: Record<string, { body: string; mediaType: string; view: Manifest['files'][string]['view'] }>, entry: string, expiresAt: string | null = null) {
  const m: Manifest = { itemId, version, entry, expiresAt, files: {} };
  for (const [path, f] of Object.entries(files)) {
    const h = await sha(f.body);
    await env.BLOBS.put(`blobs/${h}`, f.body);
    m.files[path] = { sha256: h, bytes: new TextEncoder().encode(f.body).length, mediaType: f.mediaType, view: f.view };
  }
  await env.BLOBS.put(`manifests/${itemId}/${version}.json`, JSON.stringify(m));
}
const get = (itemId: string, pathAndQuery: string, init?: RequestInit) =>
  worker.fetch(new Request(`https://${contentLabel(itemId)}.content.test${pathAndQuery}`, init), testEnv(), createExecutionContext());

const MD = { body: '# Hi\n', mediaType: 'text/markdown; charset=utf-8', view: 'markdown' as const };
const HTML = { body: '<!doctype html><link rel="stylesheet" href="style.css"><p>app</p>', mediaType: 'text/html; charset=utf-8', view: 'html' as const };
const CSS = { body: 'p{color:red}', mediaType: 'text/css; charset=utf-8', view: 'code' as const };
const DOCX = { body: 'PK\u0003\u0004word/', mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', view: 'download' as const };

describe('the viewer document', () => {
  it('serves /_view with the viewer data and every spec §9 header', async () => {
    await seed(ITEM, 1, { 'notes.md': MD }, 'notes.md');
    const t = await token(ITEM, 1);
    const res = await get(ITEM, `/_view?sig=${t}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(res.headers.get('content-security-policy')).toBe(contentCsp(['https://app.test', 'https://host.test']));
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('cross-origin-opener-policy')).toBe('same-origin');
    expect(res.headers.get('cross-origin-resource-policy')).toBe('same-site');
    expect(res.headers.get('set-cookie')).toBeNull();
    const html = await res.text();
    const data = JSON.parse(/<script id="sl-data" type="application\/json">(.*?)<\/script>/s.exec(html)![1]!);
    expect(data).toMatchObject({ view: 'markdown', path: 'notes.md', name: 'notes.md', text: '# Hi\n', host: APP, rawUrl: `https://${contentLabel(ITEM)}.content.test/s/${t}/notes.md` });
    expect(html).toContain('<script type="module" src="/_viewer/viewer.js"></script>');
    expect(html).not.toMatch(/<script>/); // every script tag is a data block or an external file
  });

  it('an HTML entry renders itself: /_view redirects into the signed path, and its own CSS loads cross-origin', async () => {
    await seed(ITEM, 2, { 'index.html': HTML, 'style.css': CSS }, 'index.html');
    const t = await token(ITEM, 2);
    const res = await get(ITEM, `/_view?sig=${t}`, { redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(`/s/${t}/index.html`);
    const page = await get(ITEM, `/s/${t}/index.html`);
    expect(page.headers.get('cross-origin-resource-policy')).toBe('same-site');
    expect(page.headers.get('content-disposition')).toBe('inline');
    const css = await get(ITEM, `/s/${t}/style.css`);
    expect(await css.text()).toBe(CSS.body);
    // Plan D2: an opaque-origin page cannot load same-site subresources.
    expect(css.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
    expect(css.headers.get('access-control-allow-origin')).toBe('*');
    expect(css.headers.get('content-type')).toBe('text/css; charset=utf-8');
  });

  it('every kind not rendered is an attachment; ?download=1 makes any kind one', async () => {
    await seed(ITEM, 3, { 'a.docx': DOCX, 'n.md': MD }, 'a.docx');
    const t = await token(ITEM, 3);
    expect((await get(ITEM, `/s/${t}/a.docx`)).headers.get('content-disposition')).toBe(`attachment; filename*=UTF-8''a.docx`);
    expect((await get(ITEM, `/s/${t}/n.md?download=1`)).headers.get('content-disposition')).toBe(`attachment; filename*=UTF-8''n.md`);
    expect((await get(ITEM, `/s/${t}/n.md`)).headers.get('content-disposition')).toBe('inline');
  });

  it('a path with # ? % and spaces round-trips', async () => {
    const path = 'img/my report #1?100%.md';
    await seed(ITEM, 4, { [path]: MD }, path);
    const t = await token(ITEM, 4);
    const res = await get(ITEM, `/s/${t}/img/my%20report%20%231%3F100%25.md`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(MD.body);
  });

  it('answers a Range request with 206', async () => {
    await seed(ITEM, 5, { 'v.txt': { body: '0123456789', mediaType: 'text/plain; charset=utf-8', view: 'text' } }, 'v.txt');
    const res = await get(ITEM, `/s/${await token(ITEM, 5)}/v.txt`, { headers: { Range: 'bytes=2-4' } });
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe('bytes 2-4/10');
    expect(await res.text()).toBe('234');
  });
});

describe('signed URLs', () => {
  it('an expired URL is refused', async () => {
    await seed(ITEM, 1, { 'notes.md': MD }, 'notes.md');
    const res = await get(ITEM, `/_view?sig=${await token(ITEM, 1, { exp: Math.floor(Date.now() / 1000) - 1 })}`);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'expired' });
  });
  it('an expiry further out than five minutes is refused even when signed', async () => {
    const res = await get(ITEM, `/_view?sig=${await token(ITEM, 1, { exp: Math.floor(Date.now() / 1000) + 3600 })}`);
    expect(await res.json()).toEqual({ error: 'invalid_signature' });
  });
  it('a URL opens only its own item: the same token on another item’s subdomain is refused', async () => {
    await seed(OTHER, 1, { 'notes.md': MD }, 'notes.md');
    const res = await get(OTHER, `/_view?sig=${await token(ITEM, 1)}`);
    expect(await res.json()).toEqual({ error: 'invalid_signature' });
  });
  it('a URL opens only its own version', async () => {
    await seed(ITEM, 6, { 'a.md': MD }, 'a.md');
    await seed(ITEM, 7, { 'b.md': MD }, 'b.md');
    expect((await get(ITEM, `/s/${await token(ITEM, 6)}/b.md`)).status).toBe(404);
  });
  it('a token signed by another key, or naming a host not allowed to frame, is refused', async () => {
    const stranger = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    expect(await (await get(ITEM, `/_view?sig=${await token(ITEM, 1, { key: stranger.privateKey })}`)).json()).toEqual({ error: 'invalid_signature' });
    expect(await (await get(ITEM, `/_view?sig=${await token(ITEM, 1, { host: 'https://evil.test' })}`)).json()).toEqual({ error: 'host_not_allowed' });
    expect((await get(ITEM, `/_view?sig=garbage`)).status).toBe(403);
  });
  it('revoked (no manifest) or expired items are gone, at once', async () => {
    const t = await token(ITEM, 8);
    expect(await (await get(ITEM, `/_view?sig=${t}`)).json()).toEqual({ error: 'gone' });
    await seed(ITEM, 9, { 'a.md': MD }, 'a.md', new Date(Date.now() - 1000).toISOString());
    expect((await get(ITEM, `/_view?sig=${await token(ITEM, 9)}`)).status).toBe(410);
  });
});

describe('the content origin serves nothing else', () => {
  it('no other method, host or path', async () => {
    expect((await get(ITEM, '/_view', { method: 'POST' })).status).toBe(405);
    expect((await worker.fetch(new Request('https://content.test/'), testEnv(), createExecutionContext())).status).toBe(404);
    expect((await worker.fetch(new Request('https://www.content.test/'), testEnv(), createExecutionContext())).status).toBe(404);
    expect((await get(ITEM, '/api/v1/items')).status).toBe(404);
  });
  it('serves the viewer bundle to an opaque origin', async () => {
    const res = await get(ITEM, '/_viewer/viewer.js');
    expect(res.status).toBe(200);
    expect(res.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });
});
```

`packages/contract/test/repo-invariants.test.ts`:

```ts
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const varOf = (file: string, name: string) => new RegExp(`"${name}":\\s*"([^"]*)"`).exec(read(file))?.[1] ?? null;

describe('repository invariants', () => {
  it('the content Worker never writes R2 (plan D8: the binding cannot be made read-only)', () => {
    const dir = join(ROOT, 'apps/content/src');
    for (const f of readdirSync(dir)) {
      const src = readFileSync(join(dir, f), 'utf8');
      expect(src, f).not.toMatch(/\.\s*(put|delete|createMultipartUpload|resumeMultipartUpload)\s*\(/);
    }
    expect(read('apps/content/src/index.ts')).toContain(`export type ReadOnlyBucket = Pick<R2Bucket, 'get' | 'head'>;`);
  });

  it('the hosts allowed to frame the content origin are the app plus exactly the hosts allowed to mint embeds', () => {
    const frame = varOf('apps/content/wrangler.jsonc', 'FRAME_ANCESTORS')!.split(/\s+/).sort();
    const minted = [varOf('apps/api/wrangler.jsonc', 'APP_URL')!, ...varOf('apps/api/wrangler.jsonc', 'EMBED_HOSTS')!.split(/\s+/)].sort();
    expect(frame).toEqual(minted);
    expect(frame).toEqual(['https://app.superlibrary.dev', 'https://app.superpipeline.dev', 'https://console.agentpod.dev']);
  });
});
```

- [ ] **Step 2: Write the Worker configuration and a minimal viewer, then run the tests to verify they fail**

`apps/content/package.json`:

```json
{
  "name": "@superlibrary/content",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "build:viewer": "vite build -c viewer/vite.config.ts",
    "test": "pnpm build:viewer && vitest run",
    "typecheck": "tsc --noEmit",
    "dev": "pnpm build:viewer && wrangler dev --port 8788 --var CONTENT_DOMAIN:localhost --var FRAME_ANCESTORS:http://localhost:5173",
    "deploy": "pnpm build:viewer && wrangler deploy"
  },
  "dependencies": { "@superlibrary/contract": "workspace:*" },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "^0.16.18",
    "@cloudflare/workers-types": "^4.20260619.1",
    "vite": "^8.0.16",
    "wrangler": "^4.103.0"
  }
}
```

`apps/content/tsconfig.json`:

```json
{ "extends": "../../tsconfig.base.json", "compilerOptions": { "types": ["@cloudflare/workers-types"] }, "include": ["src", "test"] }
```

`apps/content/wrangler.jsonc`:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "superlibrary-content",
  "main": "src/index.ts",
  "compatibility_date": "2025-11-01",
  "observability": { "enabled": true, "logs": { "enabled": true, "invocation_logs": true } },
  // Spec §6: R2 read-only and the verification half of the signing key. No D1, no secrets, no API.
  "vars": {
    // Who may frame the content origin (spec §9, Embedding): configuration, not code. Must equal the
    // API's APP_URL + EMBED_HOSTS (packages/contract/test/repo-invariants.test.ts).
    "FRAME_ANCESTORS": "https://app.superlibrary.dev https://app.superpipeline.dev https://console.agentpod.dev",
    "CONTENT_DOMAIN": "superlibrarycontent.dev"
  },
  // URL_SIGNING_PUBLIC_KEY (the verification half) is set with `wrangler secret put` by Task 21
  // Step 4, together with the API's private half. It is not a credential, but a var and a secret
  // cannot share a name, and keeping both halves on one path means one rotation command.
  "r2_buckets": [{ "binding": "BLOBS", "bucket_name": "superlibrary-blobs" }],
  // The viewer bundle (Tasks 12-13). The Worker runs first for every request and adds its own headers.
  "assets": { "directory": "./viewer-dist", "binding": "VIEWER", "run_worker_first": true },
  "routes": [{ "pattern": "*.superlibrarycontent.dev/*", "zone_name": "superlibrarycontent.dev" }]
}
```

`apps/content/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: { bindings: { FRAME_ANCESTORS: 'https://app.test https://host.test', CONTENT_DOMAIN: 'content.test', URL_SIGNING_PUBLIC_KEY: '' } },
    }),
  ],
  test: { include: ['test/**/*.test.ts'] },
});
```

`apps/content/viewer/vite.config.ts`:

```ts
import { defineConfig } from 'vite';

// One bundle for every host (spec §9, Embedding), served from the content origin itself so CSP 'self'
// covers it. The viewer itself uses no inline script, although the CSP allows it for artifacts (plan D3).
export default defineConfig({
  base: '/_viewer/',
  build: {
    outDir: 'viewer-dist/_viewer',
    emptyOutDir: true,
    cssCodeSplit: false,
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: { viewer: 'viewer/main.ts' },
      output: { entryFileNames: 'viewer.js', chunkFileNames: 'chunks/[name]-[hash].js', assetFileNames: 'viewer.[ext]' },
    },
  },
});
```

`apps/content/viewer/viewer.css`:

```css
:root { color-scheme: light dark; --fg: #1d1d1f; --bg: #ffffff; --muted: #6e6e73; --line: #e5e5ea; font: 15px/1.5 system-ui, sans-serif; }
:root[data-theme='dark'] { --fg: #f5f5f7; --bg: #1c1c1e; --muted: #a1a1a6; --line: #38383a; }
@media (prefers-color-scheme: dark) { :root:not([data-theme='light']) { --fg: #f5f5f7; --bg: #1c1c1e; --muted: #a1a1a6; --line: #38383a; } }
html, body { margin: 0; background: var(--bg); color: var(--fg); }
main { padding: 16px; max-width: 100%; box-sizing: border-box; }
.card { border: 1px solid var(--line); border-radius: 8px; padding: 16px; }
.card dt { color: var(--muted); font-size: 13px; }
.card dd { margin: 0 0 8px; overflow-wrap: anywhere; }
```

`apps/content/viewer/main.ts` (minimal for this task — Task 12 replaces it):

```ts
import './viewer.css';

const data = JSON.parse(document.getElementById('sl-data')!.textContent!) as { name: string; mediaType: string; bytes: number; sha256: string };
const card = document.createElement('dl');
card.className = 'card';
for (const [k, v] of [['Name', data.name], ['Type', data.mediaType], ['Size', `${data.bytes} bytes`], ['SHA-256', data.sha256]]) {
  card.append(Object.assign(document.createElement('dt'), { textContent: k }), Object.assign(document.createElement('dd'), { textContent: v }));
}
document.getElementById('app')!.replaceChildren(card);
```

Add `viewer-dist/` to `.gitignore`. Then:

```bash
pnpm install && pnpm --filter @superlibrary/content test; pnpm --filter @superlibrary/contract test
```

Expected: FAIL — `src/index.ts` missing; the invariants test fails on the missing file.

- [ ] **Step 3: Implement**

`packages/contract/src/viewer.ts`:

```ts
import type { View } from './model';

/** What the content Worker hands the viewer bundle, in `<script id="sl-data" type="application/json">`. */
export interface ViewerData {
  view: View;
  path: string;
  name: string;
  mediaType: string;
  bytes: number;
  sha256: string;
  /** This file's signed raw URL. */
  rawUrl: string;
  /** `<origin>/s/<token>/`: relative files of the same version resolve against it. */
  baseUrl: string;
  /** The one origin the frame may post to (plan D18). */
  host: string;
  /** Inlined for text kinds: `connect-src 'none'` means the viewer cannot fetch them. */
  text?: string;
  /** Inlined for PDF. */
  base64?: string;
}

export const TEXT_VIEWS: ReadonlySet<View> = new Set<View>(['markdown', 'code', 'text', 'json', 'yaml', 'toml', 'csv', 'tsv', 'ipynb', 'mermaid', 'graphviz', 'svg']);
```

Append to `packages/contract/src/index.ts`: `export * from './viewer';`

`apps/content/src/headers.ts`:

```ts
import { contentCsp } from '@superlibrary/contract';

export interface HeaderEnv { FRAME_ANCESTORS: string }
export const frameAncestors = (env: HeaderEnv) => env.FRAME_ANCESTORS.split(/\s+/).filter((s) => s !== '');

function common(env: HeaderEnv, contentType: string, disposition: string): Headers {
  return new Headers({
    'Content-Type': contentType,
    'Content-Disposition': disposition,
    'Content-Security-Policy': contentCsp(frameAncestors(env)),
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'private, max-age=300',
  });
}

/** A page the host frames: the viewer, or an HTML artifact's own page. CORP same-site (spec §9). */
export function documentHeaders(env: HeaderEnv, contentType: string, disposition = 'inline'): Headers {
  const h = common(env, contentType, disposition);
  h.set('Cross-Origin-Resource-Policy', 'same-site');
  return h;
}

/**
 * Everything such a page loads. The page's origin is opaque (no allow-same-origin), and Chromium
 * blocks an opaque origin's subresources under CORP same-site — measured, plan D2 — and needs
 * ACAO for module scripts and fonts. The signed path is still required to fetch any byte.
 */
export function subresourceHeaders(env: HeaderEnv, contentType: string, disposition = 'inline'): Headers {
  const h = common(env, contentType, disposition);
  h.set('Cross-Origin-Resource-Policy', 'cross-origin');
  h.set('Access-Control-Allow-Origin', '*');
  return h;
}
```

`apps/content/src/viewer-page.ts`:

```ts
import type { ViewerData } from '@superlibrary/contract';

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** The /_view document. Data travels in a JSON data block, which CSP does not execute. */
export function viewerPage(d: ViewerData): string {
  const data = JSON.stringify(d).replace(/</g, '\\u003c');
  return (
    '<!doctype html>\n<html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    `<title>${escapeHtml(d.name)}</title><link rel="stylesheet" href="/_viewer/viewer.css"></head>` +
    `<body><main id="app"></main><script id="sl-data" type="application/json">${data}</script>` +
    '<script type="module" src="/_viewer/viewer.js"></script></body></html>'
  );
}
```

`apps/content/src/index.ts`:

```ts
/**
 * superlibrary-content: artifact bytes and the viewer on `<itm-label>.superlibrarycontent.dev`, for a
 * valid signed URL only. No cookies, no API, no database (spec §6). R2 is read through a type that
 * has no write methods (plan D8).
 */
import { TEXT_VIEWS, encodePath, itemIdFromLabel, parseToken, signingMessage, type Manifest, type ViewerData } from '@superlibrary/contract';
import { documentHeaders, frameAncestors, subresourceHeaders } from './headers';
import { viewerPage } from './viewer-page';

export type ReadOnlyBucket = Pick<R2Bucket, 'get' | 'head'>;

export interface Env {
  BLOBS: ReadOnlyBucket;
  VIEWER: Fetcher;
  URL_SIGNING_PUBLIC_KEY: string;
  FRAME_ANCESTORS: string;
  CONTENT_DOMAIN: string;
}

/** Five minutes (spec §9) plus thirty seconds of clock skew. */
const MAX_AHEAD_S = 330;

function refuse(env: Env, status: number, code: string): Response {
  return new Response(JSON.stringify({ error: code }), { status, headers: documentHeaders(env, 'application/json') });
}

let keyCache: { jwk: string; key: Promise<CryptoKey> } | null = null;
function verifyKey(env: Env): Promise<CryptoKey> {
  if (keyCache?.jwk !== env.URL_SIGNING_PUBLIC_KEY) {
    keyCache = { jwk: env.URL_SIGNING_PUBLIC_KEY, key: crypto.subtle.importKey('jwk', JSON.parse(env.URL_SIGNING_PUBLIC_KEY), { name: 'Ed25519' }, false, ['verify']) };
  }
  return keyCache.key;
}

async function verify(env: Env, itemId: string, token: string): Promise<{ version: number; host: string } | Response> {
  // Before Task 21 Step 4 sets the key, refuse plainly rather than throw.
  if (!env.URL_SIGNING_PUBLIC_KEY) return refuse(env, 503, 'not_configured');
  const t = parseToken(token);
  if (!t) return refuse(env, 403, 'invalid_signature');
  const now = Math.floor(Date.now() / 1000);
  if (t.exp <= now) return refuse(env, 403, 'expired');
  if (t.exp > now + MAX_AHEAD_S) return refuse(env, 403, 'invalid_signature');
  if (!frameAncestors(env).includes(t.host)) return refuse(env, 403, 'host_not_allowed');
  // The item comes from the hostname, never from the token: a URL opens only its own item.
  const ok = await crypto.subtle.verify('Ed25519', await verifyKey(env), t.sig, signingMessage({ itemId, version: t.version, exp: t.exp, host: t.host }));
  return ok ? { version: t.version, host: t.host } : refuse(env, 403, 'invalid_signature');
}

async function manifestOf(env: Env, itemId: string, version: number): Promise<Manifest | Response> {
  const obj = await env.BLOBS.get(`manifests/${itemId}/${version}.json`);
  if (!obj) return refuse(env, 410, 'gone'); // revoked, deleted, or never existed
  const m = await obj.json<Manifest>();
  if (m.expiresAt && Date.parse(m.expiresAt) <= Date.now()) return refuse(env, 410, 'gone');
  return m;
}

const nameOf = (path: string) => path.split('/').pop() ?? path;

function decode(bytes: ArrayBuffer, mediaType: string): string {
  const enc = /charset=(utf-16le|utf-16be)/.exec(mediaType)?.[1] ?? 'utf-8';
  const b = new Uint8Array(bytes);
  const bom = enc === 'utf-8' ? (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf ? 3 : 0) : 2;
  return new TextDecoder(enc).decode(b.subarray(bom));
}

function base64(bytes: ArrayBuffer): string {
  const b = new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

async function viewerData(env: Env, m: Manifest, path: string, baseUrl: string, host: string): Promise<ViewerData | Response> {
  const f = m.files[path]!;
  const d: ViewerData = { view: f.view, path, name: nameOf(path), mediaType: f.mediaType, bytes: f.bytes, sha256: f.sha256, rawUrl: baseUrl + encodePath(path), baseUrl, host };
  if (TEXT_VIEWS.has(f.view) || f.view === 'pdf') {
    const obj = await env.BLOBS.get(`blobs/${f.sha256}`);
    if (!obj) return refuse(env, 410, 'gone');
    const bytes = await obj.arrayBuffer();
    if (f.view === 'pdf') d.base64 = base64(bytes);
    else d.text = decode(bytes, f.mediaType);
  }
  return d;
}

async function raw(request: Request, env: Env, itemId: string, url: URL): Promise<Response> {
  const rest = url.pathname.slice('/s/'.length);
  const slash = rest.indexOf('/');
  if (slash <= 0) return refuse(env, 404, 'not_found');
  const token = rest.slice(0, slash);
  let path: string;
  try {
    path = rest.slice(slash + 1).split('/').map(decodeURIComponent).join('/');
  } catch {
    return refuse(env, 404, 'not_found');
  }
  const g = await verify(env, itemId, token);
  if (g instanceof Response) return g;
  const m = await manifestOf(env, itemId, g.version);
  if (m instanceof Response) return m;
  const f = m.files[path];
  if (!f) return refuse(env, 404, 'not_found');

  const download = url.searchParams.get('download') === '1' || f.view === 'download';
  const disposition = download ? `attachment; filename*=UTF-8''${encodeURIComponent(nameOf(path))}` : 'inline';
  const headers = f.mediaType.startsWith('text/html') ? documentHeaders(env, f.mediaType, disposition) : subresourceHeaders(env, f.mediaType, disposition);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('ETag', `"${f.sha256}"`);
  const key = `blobs/${f.sha256}`;
  if (request.method === 'HEAD') {
    if (!(await env.BLOBS.head(key))) return refuse(env, 410, 'gone');
    headers.set('Content-Length', String(f.bytes));
    return new Response(null, { headers });
  }
  const ranged = request.headers.has('range');
  const obj = await env.BLOBS.get(key, ranged ? { range: request.headers } : undefined);
  if (!obj) return refuse(env, 410, 'gone');
  if (ranged && obj.range && 'offset' in obj.range && obj.range.offset !== undefined) {
    const offset = obj.range.offset;
    const length = obj.range.length ?? f.bytes - offset;
    headers.set('Content-Range', `bytes ${offset}-${offset + length - 1}/${f.bytes}`);
    headers.set('Content-Length', String(length));
    return new Response(obj.body, { status: 206, headers });
  }
  headers.set('Content-Length', String(f.bytes));
  return new Response(obj.body, { headers });
}

export default {
  async fetch(request, env) {
    if (request.method !== 'GET' && request.method !== 'HEAD') return refuse(env, 405, 'method_not_allowed');
    const url = new URL(request.url);
    const suffix = `.${env.CONTENT_DOMAIN}`;
    if (!url.hostname.endsWith(suffix)) return refuse(env, 404, 'not_found');
    const itemId = itemIdFromLabel(url.hostname.slice(0, -suffix.length));
    if (!itemId) return refuse(env, 404, 'not_found');

    if (url.pathname.startsWith('/_viewer/')) {
      const res = await env.VIEWER.fetch(request);
      if (!res.ok) return refuse(env, 404, 'not_found');
      return new Response(res.body, { headers: subresourceHeaders(env, res.headers.get('content-type') ?? 'application/octet-stream') });
    }
    if (url.pathname === '/_view') {
      const token = url.searchParams.get('sig') ?? '';
      const g = await verify(env, itemId, token);
      if (g instanceof Response) return g;
      const m = await manifestOf(env, itemId, g.version);
      if (m instanceof Response) return m;
      if (m.files[m.entry]!.view === 'html') {
        // Plan D9: the artifact's own page, under the signed path so its relative files resolve.
        const headers = documentHeaders(env, 'text/plain; charset=utf-8');
        headers.set('Location', `/s/${token}/${encodePath(m.entry)}`);
        return new Response(null, { status: 302, headers });
      }
      const d = await viewerData(env, m, m.entry, `${url.origin}/s/${token}/`, g.host);
      if (d instanceof Response) return d;
      return new Response(request.method === 'HEAD' ? null : viewerPage(d), { headers: documentHeaders(env, 'text/html; charset=utf-8') });
    }
    if (url.pathname.startsWith('/s/')) return raw(request, env, itemId, url);
    return refuse(env, 404, 'not_found');
  },
} satisfies ExportedHandler<Env>;
```

`scripts/dev-keys.mjs`:

```js
// A fresh Ed25519 pair for local dev and e2e: private half to the API, public half to the content
// Worker, as .dev.vars (gitignored). Production keys come from scripts/url-signing-key.mjs (Task 21).
import { writeFileSync } from 'node:fs';
const { privateKey, publicKey } = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
const priv = JSON.stringify(await crypto.subtle.exportKey('jwk', privateKey));
const pub = JSON.stringify(await crypto.subtle.exportKey('jwk', publicKey));
writeFileSync(new URL('../apps/api/.dev.vars', import.meta.url), `URL_SIGNING_PRIVATE_KEY='${priv}'\n`);
writeFileSync(new URL('../apps/content/.dev.vars', import.meta.url), `URL_SIGNING_PUBLIC_KEY='${pub}'\n`);
console.log('wrote apps/api/.dev.vars and apps/content/.dev.vars');
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm --filter @superlibrary/content test && pnpm --filter @superlibrary/content typecheck && pnpm --filter @superlibrary/contract test
```

Expected: PASS. Revert-proof the item binding: in `verify`, sign-check against `itemId` taken from a constant `'itm_00000000000000c1'` instead of the hostname; "opens only its own item" fails; restore.

- [ ] **Step 5: Commit**

```bash
git add apps/content packages/contract scripts/dev-keys.mjs .gitignore pnpm-lock.yaml
git commit -m "feat(content): signed, path-scoped content origin with spec §9 headers and immediate revocation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---

### Task 12: The viewer bundle, part 1 — frame protocol, text, code, structured data, tables, media

**Files:**
- Create: `packages/contract/src/protocol.ts`; modify `packages/contract/src/index.ts`
- Replace: `apps/content/viewer/main.ts`
- Create: `apps/content/viewer/{dom.ts,protocol.ts,lang.ts,csv.ts,tree.ts,vitest.config.ts,tsconfig.json}`, `apps/content/viewer/render/{index,code,structured,table,media,download}.ts`
- Modify: `apps/content/viewer/viewer.css`, `apps/content/package.json` (deps, test script)
- Test: `apps/content/viewer/test/{protocol,csv,tree,render}.test.ts`

**Interfaces:**
- Consumes: `ViewerData`, `LIMITS.csvRows`.
- Produces:
  - Contract: `type ResizeMessage = { type: 'superlibrary:resize'; height: number }`, `type ThemeMessage = { type: 'superlibrary:theme'; theme: 'light' | 'dark' }`, `MAX_FRAME_HEIGHT = 20000`, `isResizeMessage(d: unknown): d is ResizeMessage`, `isThemeMessage(d: unknown): d is ThemeMessage` — `@superlibrary/embed` (Task 14) uses the same guards.
  - Viewer: `reportHeight(host: string, win?: Window): () => void`, `listenForTheme(host: string, apply: (t: 'light' | 'dark') => void, win?: Window): () => void` (`viewer/protocol.ts`); `parseDelimited(text: string, sep: ',' | '\t'): string[][]`, `sortRows(rows: string[][], col: number, dir: 1 | -1): string[][]` (`viewer/csv.ts`); `tree(value: unknown, key?: string, depth?: number): HTMLElement` (`viewer/tree.ts`); `h(tag, attrs?, ...children)`, `header(d)`, `escapeHtml(s)`, `formatBytes(n)` (`viewer/dom.ts`); `render(el: HTMLElement, d: ViewerData): Promise<void>` (`viewer/render/index.ts`) — Task 13 adds cases to its switch.

- [ ] **Step 1: Write the failing tests**

```bash
cd apps/content && pnpm add highlight.js yaml smol-toml && pnpm add -D jsdom vitest && cd ../..
mkdir -p apps/content/viewer/render apps/content/viewer/test
```

`apps/content/viewer/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'jsdom', include: ['viewer/test/**/*.test.ts'] } });
```

Change `apps/content/package.json` `test` to `"pnpm build:viewer && vitest run && vitest run -c viewer/vitest.config.ts"` and `typecheck` to `"tsc --noEmit && tsc --noEmit -p viewer"`, and add `apps/content/viewer/tsconfig.json` (the Worker's tsconfig has no DOM):

```json
{ "extends": "../../../tsconfig.base.json", "compilerOptions": { "lib": ["ES2023", "DOM", "DOM.Iterable"], "types": [] }, "include": ["."] }
```

`apps/content/viewer/test/protocol.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { listenForTheme, reportHeight } from '../protocol';

const HOST = 'https://app.superlibrary.dev';
afterEach(() => vi.restoreAllMocks());

describe('frame protocol (spec §9, Embedding)', () => {
  it('reports its height to the signed host origin only', () => {
    (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} disconnect() {} };
    const post = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {});
    reportHeight(HOST);
    expect(post).toHaveBeenCalledWith({ type: 'superlibrary:resize', height: expect.any(Number) }, HOST);
    expect(post.mock.calls.every(([, target]) => target === HOST)).toBe(true);
  });

  it('applies a theme from the host and ignores every other origin and every malformed message', () => {
    const apply = vi.fn();
    listenForTheme(HOST, apply);
    window.dispatchEvent(new MessageEvent('message', { origin: 'https://evil.test', data: { type: 'superlibrary:theme', theme: 'dark' } }));
    window.dispatchEvent(new MessageEvent('message', { origin: HOST, data: { type: 'superlibrary:theme', theme: 'purple' } }));
    window.dispatchEvent(new MessageEvent('message', { origin: HOST, data: 'superlibrary:theme' }));
    expect(apply).not.toHaveBeenCalled();
    window.dispatchEvent(new MessageEvent('message', { origin: HOST, data: { type: 'superlibrary:theme', theme: 'dark' } }));
    expect(apply).toHaveBeenCalledWith('dark');
  });
});
```

`apps/content/viewer/test/csv.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseDelimited, sortRows } from '../csv';

describe('parseDelimited (RFC 4180)', () => {
  it('handles quotes, escaped quotes, separators and newlines inside quotes, and CRLF', () => {
    expect(parseDelimited('a,b\r\n"x, y","he said ""hi"""\n"multi\nline",2\n', ',')).toEqual([['a', 'b'], ['x, y', 'he said "hi"'], ['multi\nline', '2']]);
  });
  it('splits TSV on tabs', () => expect(parseDelimited('a\tb\n1\t2', '\t')).toEqual([['a', 'b'], ['1', '2']]));
});

describe('sortRows', () => {
  it('sorts numbers as numbers and text as text, both directions', () => {
    const rows = [['10', 'b'], ['9', 'a'], ['100', 'c']];
    expect(sortRows(rows, 0, 1).map((r) => r[0])).toEqual(['9', '10', '100']);
    expect(sortRows(rows, 1, -1).map((r) => r[1])).toEqual(['c', 'b', 'a']);
  });
});
```

`apps/content/viewer/test/tree.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { tree } from '../tree';

describe('tree', () => {
  it('renders objects and arrays as expandable nodes with counts, and leaves as text', () => {
    const el = tree({ name: 'x', tags: ['a', 'b'], n: 3, ok: true, none: null });
    expect(el.querySelector('summary')!.textContent).toBe('{5}');
    expect(el.textContent).toContain('tags');
    expect(el.textContent).toContain('[2]');
    expect(el.querySelector('.leaf.string')!.textContent).toBe('"x"');
    expect(el.querySelector('.leaf.null')!.textContent).toBe('null');
  });
  it('never interprets a string as markup', () => {
    expect(tree({ s: '<img src=x onerror=alert(1)>' }).querySelector('img')).toBeNull();
  });
});
```

`apps/content/viewer/test/render.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { ViewerData } from '@superlibrary/contract';
import { render } from '../render';

const base = { name: 'f', mediaType: 'text/plain', bytes: 1, sha256: 'a'.repeat(64), rawUrl: 'https://c.test/s/t/f', baseUrl: 'https://c.test/s/t/', host: 'https://app.test' };
const mount = async (d: Partial<ViewerData>) => {
  const el = document.createElement('main');
  await render(el, { ...base, path: 'f', view: 'text', ...d } as ViewerData);
  return el;
};

describe('render, part 1', () => {
  it('code is highlighted and paged at 2,000 lines', async () => {
    const el = await mount({ view: 'code', path: 'a.ts', text: Array.from({ length: 2500 }, (_, i) => `const x${i} = ${i};`).join('\n') });
    expect(el.querySelector('code.hljs')).not.toBeNull();
    expect(el.querySelector('code')!.textContent!.split('\n')).toHaveLength(2000);
    const more = el.querySelector<HTMLButtonElement>('button.more')!;
    expect(more.hidden).toBe(false);
    more.click();
    expect(el.querySelector('code')!.textContent!.split('\n')).toHaveLength(2500);
    expect(more.hidden).toBe(true);
  });

  it('text that looks like HTML stays text', async () => {
    const el = await mount({ view: 'text', text: '<script>alert(1)</script>' });
    expect(el.querySelector('script')).toBeNull();
    expect(el.textContent).toContain('<script>alert(1)</script>');
  });

  it('JSON, YAML and TOML have a structured view and a raw view; a parse error falls back to raw', async () => {
    for (const [view, text] of [['json', '{"a":[1,2]}'], ['yaml', 'a:\n  - 1\n  - 2\n'], ['toml', 'a = [1, 2]\n']] as const) {
      const el = await mount({ view, text });
      expect(el.querySelector('.tree'), view).not.toBeNull();
      expect(el.querySelector('pre.raw')!.textContent).toBe(text);
    }
    const bad = await mount({ view: 'yaml', text: 'a: [' });
    expect(bad.querySelector('.tree')).toBeNull();
    expect(bad.textContent).toContain('could not be parsed');
  });

  it('CSV is a sortable table of at most 5,000 rows, saying how many were left out', async () => {
    const text = ['n,name', ...Array.from({ length: 6000 }, (_, i) => `${i},row${i}`)].join('\n');
    const el = await mount({ view: 'csv', text });
    expect(el.querySelectorAll('tbody tr')).toHaveLength(5000);
    expect(el.textContent).toContain('Showing the first 5,000 of 6,000 rows');
    el.querySelector<HTMLElement>('th')!.click();
    el.querySelector<HTMLElement>('th')!.click();
    expect(el.querySelector('tbody tr td')!.textContent).toBe('4999');
  });

  it('images zoom; SVG is an <img> with its source, never inline markup; media get native players', async () => {
    const img = await mount({ view: 'image', path: 'p.png' });
    const i = img.querySelector('img')!;
    expect(i.getAttribute('src')).toBe(base.rawUrl);
    i.click();
    expect(i.classList.contains('zoomed')).toBe(true);
    const svg = await mount({ view: 'svg', path: 'd.svg', text: '<svg onload="alert(1)"></svg>' });
    expect(svg.querySelector('svg')).toBeNull();
    expect(svg.querySelector('img')!.getAttribute('src')).toBe(base.rawUrl);
    expect(svg.querySelector('pre')!.textContent).toContain('<svg onload');
    expect((await mount({ view: 'audio' })).querySelector('audio[controls]')).not.toBeNull();
    expect((await mount({ view: 'video' })).querySelector('video[controls]')).not.toBeNull();
  });

  it('anything else is a download card with type, size and hash', async () => {
    const el = await mount({ view: 'download', name: 'a.docx', mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', bytes: 2048 });
    expect(el.textContent).toContain('2.0 KB');
    expect(el.textContent).toContain('a'.repeat(64));
    expect(el.textContent).toContain('wordprocessingml');
  });
});
```

Run:

```bash
pnpm --filter @superlibrary/content exec vitest run -c viewer/vitest.config.ts
```

Expected: FAIL — `../protocol`, `../csv`, `../tree`, `../render` do not resolve.

- [ ] **Step 2: Implement the contract half of the protocol**

`packages/contract/src/protocol.ts`:

```ts
/** The frame protocol (spec §9, Embedding). Both sides use these guards. */
export type ResizeMessage = { type: 'superlibrary:resize'; height: number };
export type ThemeMessage = { type: 'superlibrary:theme'; theme: 'light' | 'dark' };
export const MAX_FRAME_HEIGHT = 20000;

const isObj = (d: unknown): d is Record<string, unknown> => typeof d === 'object' && d !== null;

export function isResizeMessage(d: unknown): d is ResizeMessage {
  return isObj(d) && d.type === 'superlibrary:resize' && typeof d.height === 'number' && Number.isFinite(d.height) && d.height >= 0;
}

export function isThemeMessage(d: unknown): d is ThemeMessage {
  return isObj(d) && d.type === 'superlibrary:theme' && (d.theme === 'light' || d.theme === 'dark');
}
```

Append `export * from './protocol';` to `packages/contract/src/index.ts`.

- [ ] **Step 3: Implement the viewer**

`apps/content/viewer/dom.ts`:

```ts
import type { ViewerData } from '@superlibrary/contract';

type Child = Node | string | null | undefined | false;
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string | boolean> = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false) continue;
    el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children) if (c) el.append(c);
  return el;
}

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${units[i]}`;
}

export function header(d: ViewerData): HTMLElement {
  return h('header', { class: 'file' }, h('span', { class: 'name' }, d.path), h('span', { class: 'meta' }, `${d.mediaType} · ${formatBytes(d.bytes)}`));
}
```

`apps/content/viewer/protocol.ts`:

```ts
import { isThemeMessage, type ResizeMessage } from '@superlibrary/contract';

/** Post the content height to the host — the one origin the token signed, never '*'. */
export function reportHeight(host: string, win: Window = window): () => void {
  const send = () => {
    const msg: ResizeMessage = { type: 'superlibrary:resize', height: Math.ceil(win.document.documentElement.scrollHeight) };
    win.parent.postMessage(msg, host);
  };
  const ro = new win.ResizeObserver(send);
  ro.observe(win.document.documentElement);
  send();
  return () => ro.disconnect();
}

/** Accept a theme only from the signed host. */
export function listenForTheme(host: string, apply: (theme: 'light' | 'dark') => void, win: Window = window): () => void {
  const on = (e: MessageEvent) => {
    if (e.origin !== host || !isThemeMessage(e.data)) return;
    apply(e.data.theme);
  };
  win.addEventListener('message', on);
  return () => win.removeEventListener('message', on);
}
```

`apps/content/viewer/lang.ts`:

```ts
const BY_EXT: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin', swift: 'swift', c: 'c', h: 'c',
  cc: 'cpp', cpp: 'cpp', hpp: 'cpp', cs: 'csharp', php: 'php', sh: 'bash', bash: 'bash', zsh: 'bash', sql: 'sql',
  lua: 'lua', r: 'r', scala: 'scala', css: 'css', html: 'xml', htm: 'xml', xml: 'xml', svelte: 'xml', vue: 'xml',
  json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'ini', ini: 'ini', diff: 'diff', patch: 'diff', md: 'markdown',
  dockerfile: 'dockerfile', makefile: 'makefile', graphql: 'graphql',
};

export function languageFor(path: string): string | null {
  const name = (path.split('/').pop() ?? '').toLowerCase();
  if (name === 'dockerfile' || name === 'makefile') return name;
  const i = name.lastIndexOf('.');
  return i > 0 ? (BY_EXT[name.slice(i + 1)] ?? null) : null;
}
```

`apps/content/viewer/csv.ts`:

```ts
/** RFC 4180, with the separator chosen by the caller. */
export function parseDelimited(text: string, sep: ',' | '\t'): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === sep) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

const num = (s: string) => (s.trim() !== '' && Number.isFinite(Number(s)) ? Number(s) : null);

export function sortRows(rows: string[][], col: number, dir: 1 | -1): string[][] {
  return [...rows].sort((a, b) => {
    const x = a[col] ?? '';
    const y = b[col] ?? '';
    const nx = num(x);
    const ny = num(y);
    const c = nx !== null && ny !== null ? nx - ny : x.localeCompare(y);
    return c * dir;
  });
}
```

`apps/content/viewer/tree.ts`:

```ts
import { h } from './dom';

/** A read-only structured view. Strings are set as text, never as markup. */
export function tree(value: unknown, key?: string, depth = 0): HTMLElement {
  const label = key !== undefined ? h('span', { class: 'key' }, key) : null;
  if (value !== null && typeof value === 'object') {
    const entries = Array.isArray(value) ? value.map((v, i) => [String(i), v] as const) : Object.entries(value);
    const count = Array.isArray(value) ? `[${entries.length}]` : `{${entries.length}}`;
    const details = h('details', { class: depth === 0 ? 'tree' : 'node', open: depth < 2 });
    details.append(h('summary', {}, label, label ? ' ' : '', count));
    for (const [k, v] of entries) details.append(tree(v, k, depth + 1));
    return details;
  }
  const type = value === null ? 'null' : typeof value;
  const text = typeof value === 'string' ? JSON.stringify(value) : String(value);
  const leaf = h('div', { class: depth === 0 ? 'tree' : 'row' }, label, label ? ': ' : '', h('span', { class: `leaf ${type}` }, text));
  return leaf;
}
```

`apps/content/viewer/render/code.ts`:

```ts
import hljs from 'highlight.js/lib/common';
import type { ViewerData } from '@superlibrary/contract';
import { escapeHtml, h, header } from '../dom';
import { languageFor } from '../lang';

const PAGE = 2000;

function highlight(text: string, lang: string | null): string {
  if (lang && hljs.getLanguage(lang)) return hljs.highlight(text, { language: lang, ignoreIllegals: true }).value;
  return escapeHtml(text);
}

/** Spec §9: "Syntax-highlighted, paged when large." hljs output is escaped HTML, so it may be inserted. */
export function renderCode(el: HTMLElement, d: ViewerData, lang = d.view === 'code' ? languageFor(d.path) : null): void {
  const lines = (d.text ?? '').split(/\r\n|\r|\n/);
  const code = h('code', { class: lang ? `hljs language-${lang}` : 'hljs' });
  const more = h('button', { type: 'button', class: 'more' });
  let shown = 0;
  const showMore = () => {
    const chunk = lines.slice(shown, shown + PAGE).join('\n');
    code.insertAdjacentHTML('beforeend', (shown > 0 ? '\n' : '') + highlight(chunk, lang));
    shown = Math.min(lines.length, shown + PAGE);
    more.hidden = shown >= lines.length;
    more.textContent = `Show more (${(lines.length - shown).toLocaleString('en')} lines left)`;
  };
  more.addEventListener('click', showMore);
  showMore();
  el.replaceChildren(header(d), h('pre', { class: 'code' }, code), more);
}
```

`apps/content/viewer/render/structured.ts`:

```ts
import YAML from 'yaml';
import { parse as parseToml } from 'smol-toml';
import type { ViewerData } from '@superlibrary/contract';
import { h, header } from '../dom';
import { tree } from '../tree';

/** Spec §9: "The readable structured view, plus raw." */
export function renderStructured(el: HTMLElement, d: ViewerData): void {
  const text = d.text ?? '';
  let value: unknown;
  let failure: string | null = null;
  try {
    value = d.view === 'json' ? JSON.parse(text) : d.view === 'yaml' ? YAML.parse(text) : parseToml(text);
  } catch (e) {
    failure = e instanceof Error ? e.message : String(e);
  }
  const raw = h('pre', { class: 'raw' }, text);
  if (failure !== null) {
    el.replaceChildren(header(d), h('p', { class: 'note' }, `This file could not be parsed as ${d.view.toUpperCase()}: ${failure}. Showing it as text.`), raw);
    return;
  }
  const structured = tree(value);
  raw.hidden = true;
  const toggle = h('button', { type: 'button', class: 'toggle' }, 'Show raw');
  toggle.addEventListener('click', () => {
    raw.hidden = !raw.hidden;
    structured.hidden = !raw.hidden;
    toggle.textContent = raw.hidden ? 'Show raw' : 'Show structured';
  });
  el.replaceChildren(header(d), toggle, structured, raw);
}
```

`apps/content/viewer/render/table.ts`:

```ts
import { LIMITS, type ViewerData } from '@superlibrary/contract';
import { h, header } from '../dom';
import { parseDelimited, sortRows } from '../csv';

/** Spec §9: "Sortable table (first 5,000 rows), plus download" (the download is the host toolbar's). */
export function renderTable(el: HTMLElement, d: ViewerData): void {
  const all = parseDelimited(d.text ?? '', d.view === 'tsv' ? '\t' : ',');
  const [head = [], ...rest] = all;
  const shownRows = rest.slice(0, LIMITS.csvRows);
  const tbody = h('tbody');
  const fill = (rows: string[][]) => tbody.replaceChildren(...rows.map((r) => h('tr', {}, ...r.map((c) => h('td', {}, c)))));
  let sortCol = -1;
  let dir: 1 | -1 = 1;
  const ths = head.map((name, i) => {
    const th = h('th', { scope: 'col', tabindex: '0' }, name);
    th.addEventListener('click', () => {
      dir = sortCol === i ? ((-dir) as 1 | -1) : 1;
      sortCol = i;
      fill(sortRows(shownRows, i, dir));
    });
    return th;
  });
  fill(shownRows);
  const note = rest.length > LIMITS.csvRows
    ? h('p', { class: 'note' }, `Showing the first ${LIMITS.csvRows.toLocaleString('en')} of ${rest.length.toLocaleString('en')} rows. Download the file for all of them.`)
    : null;
  el.replaceChildren(header(d), note, h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ...ths)), tbody)));
}
```

`apps/content/viewer/render/media.ts`:

```ts
import type { ViewerData } from '@superlibrary/contract';
import { h, header } from '../dom';

export function renderImage(el: HTMLElement, d: ViewerData): void {
  const img = h('img', { src: d.rawUrl, alt: d.name, class: 'zoomable' });
  img.addEventListener('click', () => img.classList.toggle('zoomed'));
  el.replaceChildren(header(d), img);
}

/** Spec §9: "As an image only (scripts cannot run), with the source available." */
export function renderSvg(el: HTMLElement, d: ViewerData): void {
  const img = h('img', { src: d.rawUrl, alt: d.name, class: 'zoomable' });
  img.addEventListener('click', () => img.classList.toggle('zoomed'));
  const source = h('details', {}, h('summary', {}, 'Source'), h('pre', { class: 'raw' }, d.text ?? ''));
  el.replaceChildren(header(d), img, h('p', { class: 'note' }, 'Shown as an image: scripts in it do not run.'), source);
}

export function renderMedia(el: HTMLElement, d: ViewerData): void {
  const player = d.view === 'audio' ? h('audio', { controls: true, preload: 'metadata', src: d.rawUrl }) : h('video', { controls: true, preload: 'metadata', src: d.rawUrl });
  el.replaceChildren(header(d), player);
}
```

`apps/content/viewer/render/download.ts`:

```ts
import type { ViewerData } from '@superlibrary/contract';
import { formatBytes, h } from '../dom';

/** Spec §9: "Download, with type, size and hash." The download itself is the host toolbar's (plan D6). */
export function renderDownload(el: HTMLElement, d: ViewerData): void {
  const row = (k: string, v: string) => [h('dt', {}, k), h('dd', {}, v)];
  el.replaceChildren(
    h('dl', { class: 'card' }, ...row('Name', d.name), ...row('Type', d.mediaType), ...row('Size', formatBytes(d.bytes)), ...row('SHA-256', d.sha256)),
    h('p', { class: 'note' }, 'This kind is not shown here. Use Download in the toolbar.'),
  );
}
```

`apps/content/viewer/render/index.ts`:

```ts
import type { ViewerData } from '@superlibrary/contract';
import { renderCode } from './code';
import { renderStructured } from './structured';
import { renderTable } from './table';
import { renderImage, renderMedia, renderSvg } from './media';
import { renderDownload } from './download';

/** One renderer for every host (spec §9, Embedding). Task 13 adds markdown, diagrams, notebooks and PDF. */
export async function render(el: HTMLElement, d: ViewerData): Promise<void> {
  switch (d.view) {
    case 'code':
    case 'text':
      return renderCode(el, d);
    case 'json':
    case 'yaml':
    case 'toml':
      return renderStructured(el, d);
    case 'csv':
    case 'tsv':
      return renderTable(el, d);
    case 'image':
      return renderImage(el, d);
    case 'svg':
      return renderSvg(el, d);
    case 'audio':
    case 'video':
      return renderMedia(el, d);
    default:
      return renderDownload(el, d);
  }
}
```

Replace `apps/content/viewer/main.ts`:

```ts
import 'highlight.js/styles/github.css';
import './viewer.css';
import type { ViewerData } from '@superlibrary/contract';
import { h } from './dom';
import { listenForTheme, reportHeight } from './protocol';
import { render } from './render';

const data = JSON.parse(document.getElementById('sl-data')!.textContent!) as ViewerData;
const app = document.getElementById('app')!;
listenForTheme(data.host, (theme) => { document.documentElement.dataset.theme = theme; });
render(app, data)
  .catch((e: unknown) => {
    app.replaceChildren(h('p', { class: 'note' }, `This file could not be shown: ${e instanceof Error ? e.message : String(e)}`));
  })
  .finally(() => reportHeight(data.host));
```

Append to `apps/content/viewer/viewer.css`:

```css
header.file { display: flex; gap: 12px; align-items: baseline; flex-wrap: wrap; margin-bottom: 12px; }
header.file .name { font-weight: 600; overflow-wrap: anywhere; }
header.file .meta, .note { color: var(--muted); font-size: 13px; }
pre { overflow: auto; margin: 0; font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
pre.code, pre.raw { border: 1px solid var(--line); border-radius: 8px; padding: 12px; }
button { font: inherit; padding: 6px 12px; border: 1px solid var(--line); border-radius: 6px; background: transparent; color: inherit; cursor: pointer; margin: 8px 0; }
.table-wrap { overflow: auto; }
table { border-collapse: collapse; font-size: 13px; }
th, td { border: 1px solid var(--line); padding: 4px 8px; text-align: left; vertical-align: top; white-space: pre-wrap; }
th { cursor: pointer; position: sticky; top: 0; background: var(--bg); }
img.zoomable { max-width: 100%; cursor: zoom-in; }
img.zoomable.zoomed { max-width: none; cursor: zoom-out; }
audio, video { width: 100%; }
details.tree, details.node { margin-left: 12px; font: 13px/1.6 ui-monospace, monospace; }
details.tree { margin-left: 0; }
.row { margin-left: 12px; font: 13px/1.6 ui-monospace, monospace; }
.key { color: var(--muted); }
.leaf.string { color: #0a7d32; } .leaf.number { color: #0b5cad; } .leaf.boolean, .leaf.null { color: #8a3ffc; }
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm --filter @superlibrary/contract test && pnpm --filter @superlibrary/content test
```

Expected: PASS (Worker tests from Task 11 and the four viewer files). Revert-proof the theme guard: drop `e.origin !== host ||`; the evil-origin assertion fails; restore.

- [ ] **Step 5: Commit**

```bash
git add apps/content packages/contract pnpm-lock.yaml
git commit -m "feat(viewer): frame protocol, code, structured data, tables, images, SVG, media, download card

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---

### Task 13: The viewer bundle, part 2 — Markdown, Mermaid, Graphviz, notebooks, PDF

**Files:**
- Create: `apps/content/viewer/render/{markdown,diagram,notebook,pdf}.ts`, `apps/content/viewer/shims.d.ts`
- Modify: `apps/content/viewer/render/index.ts` (five more cases), `apps/content/viewer/viewer.css`, `apps/content/package.json` (deps)
- Test: `apps/content/viewer/test/{markdown,notebook}.test.ts`

**Interfaces:**
- Consumes: `ViewerData`, `encodePath`, `h`, `header`, `escapeHtml`, `renderCode`.
- Produces: `resolveRelative(fromPath: string, href: string): string | null`, `markdownHtml(src: string): string` (sanitized), `renderMarkdown(el, d)` (`render/markdown.ts`); `renderMermaidInto(target: HTMLElement, src: string): Promise<void>`, `renderMermaid(el, d)`, `renderGraphviz(el, d)` (`render/diagram.ts`); `notebookElements(nb: unknown): HTMLElement[]`, `renderNotebook(el, d)` (`render/notebook.ts`); `renderPdf(el, d)` (`render/pdf.ts`). Heavy libraries load as lazy chunks, served from `'self'` (`/_viewer/chunks/*`).

- [ ] **Step 1: Write the failing tests**

```bash
cd apps/content && pnpm add marked dompurify mermaid viz.js@2.1.2 pdfjs-dist@^4 && cd ../..
```

`apps/content/viewer/test/markdown.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { ViewerData } from '@superlibrary/contract';
import { markdownHtml, renderMarkdown, resolveRelative } from '../render/markdown';

describe('resolveRelative', () => {
  it('resolves against the file’s folder, refuses to leave the root, and leaves absolute links alone', () => {
    expect(resolveRelative('docs/guide.md', 'img/a b.png')).toBe('docs/img/a b.png');
    expect(resolveRelative('docs/guide.md', '../logo.svg')).toBe('logo.svg');
    expect(resolveRelative('docs/guide.md', './x%20y.png')).toBe('docs/x y.png');
    expect(resolveRelative('guide.md', '../../etc/passwd')).toBeNull();
    for (const abs of ['https://example.com/a.png', '//cdn.test/a.png', 'data:image/png;base64,AA', '#top']) expect(resolveRelative('a.md', abs)).toBeNull();
  });
});

describe('markdown (spec §9: tables, task lists, code, Mermaid, images from the same folder)', () => {
  it('is sanitized: no script, no event handlers, no javascript: links', () => {
    const html = markdownHtml('<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n\n[x](javascript:alert(1))');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('javascript:');
  });

  it('renders GFM tables and task lists', () => {
    const html = markdownHtml('| a | b |\n|---|---|\n| 1 | 2 |\n\n- [x] done\n- [ ] todo\n');
    expect(html).toContain('<table>');
    expect(html).toMatch(/<input[^>]*checked[^>]*type="checkbox"|<input[^>]*type="checkbox"[^>]*checked/);
  });

  it('a relative image with a space resolves to the signed base, segment-encoded', async () => {
    const el = document.createElement('main');
    // Angle brackets let a Markdown link destination hold a space; %23 is the file's own '#'.
    const d = { view: 'markdown', path: 'docs/guide.md', name: 'guide.md', mediaType: 'text/markdown', bytes: 1, sha256: 'a'.repeat(64), rawUrl: '', baseUrl: 'https://c.test/s/T/', host: 'https://app.test', text: '![logo](<img/a b%231.png>)\n\n```ts\nconst x = 1;\n```\n' } as ViewerData;
    await renderMarkdown(el, d);
    expect(el.querySelector('img')!.getAttribute('src')).toBe('https://c.test/s/T/docs/img/a%20b%231.png');
    expect(el.querySelector('pre code.hljs')).not.toBeNull();
  });
});
```

`apps/content/viewer/test/notebook.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { notebookElements } from '../render/notebook';

const nb = {
  nbformat: 4,
  metadata: { kernelspec: { language: 'python' } },
  cells: [
    { cell_type: 'markdown', source: ['# Title\n', 'text'] },
    { cell_type: 'code', execution_count: 3, source: 'print(1)', outputs: [
      { output_type: 'stream', name: 'stdout', text: ['1\n'] },
      { output_type: 'display_data', data: { 'image/png': 'iVBORw0KGgo=\n', 'text/plain': ['<Figure>'] } },
      { output_type: 'execute_result', data: { 'text/html': ['<script>alert(1)</script><b>x</b>'] } },
      { output_type: 'error', ename: 'ValueError', evalue: 'bad', traceback: ['\u001b[31mValueError\u001b[0m: bad'] },
    ] },
  ],
};

describe('notebooks: cells and saved outputs, never executed', () => {
  it('renders markdown cells, highlighted code with its count, and outputs', () => {
    const root = document.createElement('div');
    root.append(...notebookElements(nb));
    expect(root.querySelector('h1')!.textContent).toBe('Title');
    expect(root.querySelector('.prompt')!.textContent).toBe('In [3]:');
    expect(root.querySelector('code.hljs')).not.toBeNull();
    expect(root.textContent).toContain('1\n');
    expect(root.querySelector('img')!.getAttribute('src')).toBe('data:image/png;base64,iVBORw0KGgo=');
    expect(root.textContent).toContain('ValueError: bad');
    expect(root.textContent).not.toContain('\u001b[');
  });

  it('shows an HTML output as source: nothing from it reaches the DOM as markup', () => {
    const root = document.createElement('div');
    root.append(...notebookElements(nb));
    expect(root.querySelector('script')).toBeNull();
    expect(root.querySelector('b')).toBeNull();
    expect(root.textContent).toContain('<script>alert(1)</script><b>x</b>');
  });
});
```

Run:

```bash
pnpm --filter @superlibrary/content exec vitest run -c viewer/vitest.config.ts
```

Expected: FAIL — `../render/markdown` and `../render/notebook` do not resolve.

- [ ] **Step 2: Implement Markdown and diagrams**

`apps/content/viewer/render/markdown.ts`:

```ts
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/common';
import { encodePath, type ViewerData } from '@superlibrary/contract';
import { h, header } from '../dom';

/** A link inside the same version, as a manifest path; null for anything absolute or above the root. */
export function resolveRelative(fromPath: string, href: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//') || href.startsWith('#')) return null;
  const pathPart = href.split(/[?#]/)[0] ?? '';
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathPart);
  } catch {
    decoded = pathPart;
  }
  const parts = decoded.startsWith('/') ? [] : fromPath.split('/').slice(0, -1);
  for (const seg of decoded.split('/')) {
    if (seg === '..') {
      if (parts.length === 0) return null;
      parts.pop();
    } else if (seg !== '' && seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

export function markdownHtml(src: string): string {
  const html = marked.parse(src, { gfm: true, async: false }) as string;
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}

export async function renderMarkdown(el: HTMLElement, d: ViewerData): Promise<void> {
  const article = h('article', { class: 'markdown' });
  article.innerHTML = markdownHtml(d.text ?? '');
  for (const img of article.querySelectorAll('img')) {
    const rel = resolveRelative(d.path, img.getAttribute('src') ?? '');
    if (rel) img.setAttribute('src', d.baseUrl + encodePath(rel));
  }
  const mermaidBlocks: HTMLElement[] = [];
  for (const code of article.querySelectorAll<HTMLElement>('pre > code')) {
    if (/\blanguage-mermaid\b/.test(code.className)) mermaidBlocks.push(code);
    else {
      code.classList.add('hljs');
      hljs.highlightElement(code);
    }
  }
  el.replaceChildren(header(d), article);
  if (mermaidBlocks.length > 0) {
    const { renderMermaidInto } = await import('./diagram');
    for (const code of mermaidBlocks) await renderMermaidInto(code.parentElement!, code.textContent ?? '');
  }
}
```

`apps/content/viewer/render/diagram.ts`:

```ts
import type { ViewerData } from '@superlibrary/contract';
import { h, header } from '../dom';

let counter = 0;
const sourceOf = (d: ViewerData) => h('details', {}, h('summary', {}, 'Source'), h('pre', { class: 'raw' }, d.text ?? ''));

/** Mermaid in strict mode. Its injected <style> is blocked by the spec CSP (plan D3): shapes render, theming may not. */
export async function renderMermaidInto(target: HTMLElement, src: string): Promise<void> {
  const { default: mermaid } = await import('mermaid');
  const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: dark ? 'dark' : 'default' });
  const { svg } = await mermaid.render(`sl-mermaid-${++counter}`, src);
  const fig = h('figure', { class: 'diagram' });
  fig.innerHTML = svg;
  target.replaceWith(fig);
}

export async function renderMermaid(el: HTMLElement, d: ViewerData): Promise<void> {
  const holder = h('div');
  el.replaceChildren(header(d), holder, sourceOf(d));
  await renderMermaidInto(holder, d.text ?? '');
}

/** viz.js 2.1.2's asm.js build: the spec CSP has no 'wasm-unsafe-eval' (plan D4). */
export async function renderGraphviz(el: HTMLElement, d: ViewerData): Promise<void> {
  const [{ default: Viz }, { Module, render }] = await Promise.all([import('viz.js'), import('viz.js/full.render.js')]);
  const viz = new Viz({ Module, render });
  const svg = await viz.renderSVGElement(d.text ?? '');
  el.replaceChildren(header(d), h('figure', { class: 'diagram' }, svg), sourceOf(d));
}
```

`apps/content/viewer/shims.d.ts`:

```ts
declare module 'viz.js' {
  export default class Viz {
    constructor(opts: { Module: unknown; render: unknown });
    renderSVGElement(src: string): Promise<SVGSVGElement>;
  }
}
declare module 'viz.js/full.render.js' {
  export const Module: unknown;
  export const render: unknown;
}
declare module 'pdfjs-dist/build/pdf.worker.mjs';
```

- [ ] **Step 3: Implement notebooks and PDF, and wire the cases**

`apps/content/viewer/render/notebook.ts`:

```ts
import hljs from 'highlight.js/lib/common';
import type { ViewerData } from '@superlibrary/contract';
import { escapeHtml, h, header } from '../dom';
import { markdownHtml } from './markdown';

type Lines = string | string[] | undefined;
const join = (s: Lines) => (Array.isArray(s) ? s.join('') : (s ?? ''));
const stripAnsi = (s: string) => s.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '');

interface Output { output_type: string; text?: Lines; data?: Record<string, Lines>; traceback?: string[] }
interface Cell { cell_type: string; source?: Lines; execution_count?: number | null; outputs?: Output[] }

function outputElement(o: Output): HTMLElement {
  if (o.output_type === 'stream') return h('pre', { class: 'out' }, join(o.text));
  if (o.output_type === 'error') return h('pre', { class: 'out error' }, stripAnsi((o.traceback ?? []).join('\n')));
  const data = o.data ?? {};
  for (const type of ['image/png', 'image/jpeg', 'image/gif']) {
    if (data[type]) return h('img', { src: `data:${type};base64,${join(data[type]).replace(/\s+/g, '')}`, alt: 'output' });
  }
  if (data['image/svg+xml']) return h('img', { src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(join(data['image/svg+xml']))}`, alt: 'output' });
  if (data['text/markdown']) {
    const div = h('div', { class: 'out markdown' });
    div.innerHTML = markdownHtml(join(data['text/markdown']));
    return div;
  }
  // Never as markup: a notebook's HTML output may carry script (spec §9: "never executed").
  if (data['text/html']) return h('div', { class: 'out' }, h('p', { class: 'note' }, 'HTML output, shown as source:'), h('pre', {}, join(data['text/html'])));
  return h('pre', { class: 'out' }, join(data['text/plain']));
}

export function notebookElements(nb: unknown): HTMLElement[] {
  const book = nb as { cells?: Cell[]; metadata?: { kernelspec?: { language?: string }; language_info?: { name?: string } } };
  const lang = book.metadata?.kernelspec?.language ?? book.metadata?.language_info?.name ?? 'python';
  return (book.cells ?? []).map((cell) => {
    const src = join(cell.source);
    if (cell.cell_type === 'markdown') {
      const div = h('div', { class: 'cell markdown' });
      div.innerHTML = markdownHtml(src);
      return div;
    }
    if (cell.cell_type !== 'code') return h('pre', { class: 'cell raw' }, src);
    const code = h('code', { class: `hljs language-${lang}` });
    code.innerHTML = hljs.getLanguage(lang) ? hljs.highlight(src, { language: lang, ignoreIllegals: true }).value : escapeHtml(src);
    return h('div', { class: 'cell code' },
      h('div', { class: 'prompt' }, `In [${cell.execution_count ?? ' '}]:`),
      h('pre', {}, code),
      ...(cell.outputs ?? []).map(outputElement));
  });
}

export function renderNotebook(el: HTMLElement, d: ViewerData): void {
  el.replaceChildren(header(d), ...notebookElements(JSON.parse(d.text ?? '{}')));
}
```

`apps/content/viewer/render/pdf.ts`:

```ts
import type { ViewerData } from '@superlibrary/contract';
import { h, header } from '../dom';

/** pdf.js on the main thread: an opaque-origin frame cannot start a Worker from its host (plan D5). */
export async function renderPdf(el: HTMLElement, d: ViewerData): Promise<void> {
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.mjs')]);
  (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = worker;
  const bin = atob(d.base64 ?? '');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const doc = await pdfjs.getDocument({ data: bytes, isEvalSupported: false }).promise;
  const pages = h('div', { class: 'pdf' });
  el.replaceChildren(header(d), pages);
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = h('canvas', { 'aria-label': `Page ${n}` });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    pages.append(canvas);
    await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
  }
}
```

Add to the switch in `apps/content/viewer/render/index.ts`, before `default`:

```ts
    case 'markdown':
      return (await import('./markdown')).renderMarkdown(el, d);
    case 'mermaid':
      return (await import('./diagram')).renderMermaid(el, d);
    case 'graphviz':
      return (await import('./diagram')).renderGraphviz(el, d);
    case 'ipynb':
      return (await import('./notebook')).renderNotebook(el, d);
    case 'pdf':
      return (await import('./pdf')).renderPdf(el, d);
```

Append to `apps/content/viewer/viewer.css`:

```css
article.markdown { max-width: 860px; }
article.markdown img { max-width: 100%; }
article.markdown table { margin: 12px 0; }
figure.diagram { margin: 12px 0; overflow: auto; }
.cell { margin: 12px 0; }
.cell .prompt { color: var(--muted); font: 12px ui-monospace, monospace; }
.cell pre { border: 1px solid var(--line); border-radius: 6px; padding: 8px; }
.out { margin-top: 6px; } .out.error { color: #c0392b; }
.pdf canvas { width: 100%; height: auto; border: 1px solid var(--line); margin-bottom: 12px; }
```

- [ ] **Step 4: Run the tests and the build to verify they pass**

```bash
pnpm --filter @superlibrary/content test && pnpm --filter @superlibrary/content typecheck && ls apps/content/viewer-dist/_viewer/chunks | head
```

Expected: PASS, and lazy chunks for mermaid, viz.js and pdf.js listed under `viewer-dist/_viewer/chunks/`. Mermaid, Graphviz and PDF are exercised in a real browser by Task 18. Revert-proof sanitizing: return the unsanitized `html` from `markdownHtml`; the sanitize case fails; restore.

- [ ] **Step 5: Commit**

```bash
git add apps/content pnpm-lock.yaml
git commit -m "feat(viewer): sanitized Markdown, Mermaid, Graphviz, notebooks (never executed), PDF

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---

### Task 14: `@superlibrary/embed` — the host SDK

**Files:**
- Create: `packages/embed/{package.json,tsconfig.json,vitest.config.ts,README.md}`, `packages/embed/src/index.ts`
- Test: `packages/embed/test/embed.test.ts`

**Interfaces:**
- Consumes: `isResizeMessage`, `MAX_FRAME_HEIGHT`, `type EmbedGrant` (contract).
- Produces (the web app, Task 17, and later Superpipeline/console integrations call this):
  ```ts
  export interface MountOptions {
    itemId: string;
    version?: number;
    /** The host calls POST /api/v1/items/:id/embed with ITS person's token and returns the grant. */
    getEmbedUrl: (q: { itemId: string; version?: number }) => Promise<EmbedGrant>;
    appUrl?: string;         // default 'https://app.superlibrary.dev'
    height?: number;         // initial px; default 480; HTML artifacts keep it (plan D18)
    clipboard?: Pick<Clipboard, 'writeText'>;
  }
  export interface Mounted { iframe: HTMLIFrameElement; setTheme(theme: 'light' | 'dark'): void; destroy(): void }
  export function mountArtifact(el: HTMLElement, opts: MountOptions): Promise<Mounted>;
  export const SANDBOX = 'allow-scripts allow-popups-to-escape-sandbox';
  ```

`README.md` documents exactly the frame protocol and the host's two duties: mint with the person's own token, and list the host in `FRAME_ANCESTORS`/`EMBED_HOSTS` (both vars, held together by the invariants test).

- [ ] **Step 1: Write the failing test**

```bash
mkdir -p packages/embed/src packages/embed/test
```

`packages/embed/package.json`:

```json
{
  "name": "@superlibrary/embed",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": { "test": "vitest run", "typecheck": "tsc --noEmit" },
  "dependencies": { "@superlibrary/contract": "workspace:*" },
  "devDependencies": { "jsdom": "^30.1.2" }
}
```

`packages/embed/tsconfig.json`: `{ "extends": "../../tsconfig.base.json", "compilerOptions": { "lib": ["ES2023", "DOM"] }, "include": ["src", "test"] }`

`packages/embed/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'jsdom', include: ['test/**/*.test.ts'] } });
```

`packages/embed/test/embed.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SANDBOX, mountArtifact } from '../src/index';

const GRANT = { url: 'https://itm-00000000000000a1.superlibrarycontent.dev/_view?sig=T', downloadUrl: 'https://itm-00000000000000a1.superlibrarycontent.dev/s/T/a.md?download=1', expiresAt: '2026-10-09T00:05:00.000Z', version: 3, itemUrl: 'https://app.superlibrary.dev/a/itm_00000000000000a1/v/3' };
let el: HTMLElement;
beforeEach(() => { document.body.innerHTML = ''; el = document.body.appendChild(document.createElement('div')); });
const mount = (over: Record<string, unknown> = {}) => mountArtifact(el, { itemId: 'itm_00000000000000a1', getEmbedUrl: async () => GRANT, ...over });
const post = (data: unknown, source: MessageEventSource | null, origin = 'null') => window.dispatchEvent(new MessageEvent('message', { data, source, origin }));

describe('mountArtifact', () => {
  it('renders the sandboxed frame exactly as spec §9 says', async () => {
    const m = await mount();
    expect(m.iframe.getAttribute('sandbox')).toBe(SANDBOX);
    expect(SANDBOX).toBe('allow-scripts allow-popups-to-escape-sandbox');
    expect(m.iframe.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(m.iframe.getAttribute('src')).toBe(GRANT.url);
    expect(m.iframe.style.height).toBe('480px');
  });

  it('asks the host for a URL for the requested version', async () => {
    const getEmbedUrl = vi.fn(async () => GRANT);
    await mount({ version: 3, getEmbedUrl });
    expect(getEmbedUrl).toHaveBeenCalledWith({ itemId: 'itm_00000000000000a1', version: 3 });
  });

  it('honours a resize only from its own frame, with the opaque origin, within bounds', async () => {
    const m = await mount();
    const other = document.body.appendChild(document.createElement('iframe'));
    post({ type: 'superlibrary:resize', height: 900 }, other.contentWindow);
    expect(m.iframe.style.height).toBe('480px');
    post({ type: 'superlibrary:resize', height: 900 }, m.iframe.contentWindow, 'https://evil.test');
    expect(m.iframe.style.height).toBe('480px');
    post({ type: 'superlibrary:resize', height: 'tall' }, m.iframe.contentWindow);
    expect(m.iframe.style.height).toBe('480px');
    post({ type: 'superlibrary:resize', height: 900.2 }, m.iframe.contentWindow);
    expect(m.iframe.style.height).toBe('901px');
    post({ type: 'superlibrary:resize', height: 1e9 }, m.iframe.contentWindow);
    expect(m.iframe.style.height).toBe('20000px');
  });

  it('has a toolbar: version label, Open in new window, Download and Copy link, all correct', async () => {
    const writeText = vi.fn(async () => {});
    await mount({ version: 3, clipboard: { writeText } });
    expect(el.querySelector('.sl-version')!.textContent).toBe('v3');
    const open = el.querySelector<HTMLAnchorElement>('a.sl-open')!;
    expect(open.href).toBe('https://app.superlibrary.dev/a/itm_00000000000000a1/v/3');
    expect(open.target).toBe('_blank');
    expect(open.rel).toBe('noopener noreferrer');
    expect(el.querySelector<HTMLAnchorElement>('a.sl-download')!.href).toBe(GRANT.downloadUrl);
    el.querySelector<HTMLButtonElement>('button.sl-copy')!.click();
    expect(writeText).toHaveBeenCalledWith('https://app.superlibrary.dev/a/itm_00000000000000a1/v/3');
  });

  it('without a version, links to the item; a folder has no Download', async () => {
    await mount({ getEmbedUrl: async () => ({ ...GRANT, downloadUrl: null }) });
    expect(el.querySelector<HTMLAnchorElement>('a.sl-open')!.href).toBe('https://app.superlibrary.dev/a/itm_00000000000000a1');
    expect(el.querySelector('a.sl-download')).toBeNull();
  });

  it('sends a theme to its frame, and stops listening when destroyed', async () => {
    const m = await mount();
    const send = vi.spyOn(m.iframe.contentWindow!, 'postMessage');
    m.setTheme('dark');
    expect(send).toHaveBeenCalledWith({ type: 'superlibrary:theme', theme: 'dark' }, '*');
    m.destroy();
    expect(el.children).toHaveLength(0);
  });
});
```

Run:

```bash
pnpm install && pnpm --filter @superlibrary/embed test
```

Expected: FAIL — `../src/index` does not resolve.

- [ ] **Step 2: Implement**

`packages/embed/src/index.ts`:

```ts
/**
 * @superlibrary/embed — mount Superlibrary's viewer in any product (spec §9, Embedding). The host
 * mints the URL with its own person's token; the frame needs no sign-in, so it works where
 * third-party storage is partitioned (Safari, iOS).
 */
import { MAX_FRAME_HEIGHT, isResizeMessage, type EmbedGrant } from '@superlibrary/contract';

export const SANDBOX = 'allow-scripts allow-popups-to-escape-sandbox';

export interface MountOptions {
  itemId: string;
  version?: number;
  getEmbedUrl: (q: { itemId: string; version?: number }) => Promise<EmbedGrant>;
  appUrl?: string;
  height?: number;
  clipboard?: Pick<Clipboard, 'writeText'>;
}

export interface Mounted {
  iframe: HTMLIFrameElement;
  setTheme(theme: 'light' | 'dark'): void;
  destroy(): void;
}

export async function mountArtifact(el: HTMLElement, opts: MountOptions): Promise<Mounted> {
  const grant = await opts.getEmbedUrl(opts.version === undefined ? { itemId: opts.itemId } : { itemId: opts.itemId, version: opts.version });
  const app = (opts.appUrl ?? 'https://app.superlibrary.dev').replace(/\/+$/, '');
  const link = `${app}/a/${opts.itemId}${opts.version === undefined ? '' : `/v/${opts.version}`}`;

  const root = document.createElement('div');
  root.className = 'sl-embed';
  const bar = document.createElement('div');
  bar.className = 'sl-toolbar';
  const version = Object.assign(document.createElement('span'), { className: 'sl-version', textContent: `v${grant.version}` });
  const open = Object.assign(document.createElement('a'), { className: 'sl-open', href: link, target: '_blank', rel: 'noopener noreferrer', textContent: 'Open in new window' });
  bar.append(version, open);
  if (grant.downloadUrl) {
    bar.append(Object.assign(document.createElement('a'), { className: 'sl-download', href: grant.downloadUrl, rel: 'noopener noreferrer', textContent: 'Download' }));
  }
  const copy = Object.assign(document.createElement('button'), { className: 'sl-copy', type: 'button', textContent: 'Copy link' });
  copy.addEventListener('click', () => {
    void (opts.clipboard ?? navigator.clipboard).writeText(link).then(() => { copy.textContent = 'Copied'; });
  });
  bar.append(copy);

  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', SANDBOX);
  iframe.setAttribute('referrerpolicy', 'no-referrer');
  iframe.setAttribute('title', 'Superlibrary artifact');
  iframe.setAttribute('src', grant.url);
  iframe.style.width = '100%';
  iframe.style.border = '0';
  iframe.style.height = `${opts.height ?? 480}px`;

  root.append(bar, iframe);
  el.append(root);

  // The frame's origin is opaque, so its messages arrive with origin "null": identity is the
  // frame's own window (plan D18). Anything else is ignored.
  const onMessage = (e: MessageEvent) => {
    if (e.source !== iframe.contentWindow || e.origin !== 'null' || !isResizeMessage(e.data)) return;
    iframe.style.height = `${Math.min(Math.ceil(e.data.height), MAX_FRAME_HEIGHT)}px`;
  };
  window.addEventListener('message', onMessage);

  return {
    iframe,
    // An opaque origin cannot be named as a targetOrigin; the frame checks the sender (viewer/protocol.ts).
    setTheme: (theme) => iframe.contentWindow?.postMessage({ type: 'superlibrary:theme', theme }, '*'),
    destroy: () => {
      window.removeEventListener('message', onMessage);
      root.remove();
    },
  };
}
```

`packages/embed/README.md`:

````markdown
# @superlibrary/embed

Mount Superlibrary's viewer in another product, with **Open in new window**, **Download** and **Copy link**.

```ts
import { mountArtifact } from '@superlibrary/embed';

const view = await mountArtifact(el, {
  itemId: 'itm_…',
  version: 3, // optional; the newest live version otherwise
  getEmbedUrl: async ({ itemId, version }) => {
    // With the signed-in person's own token for the audience https://app.superlibrary.dev.
    const res = await fetch(`https://app.superlibrary.dev/api/v1/items/${itemId}/embed`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(version ? { version } : {}),
    });
    if (!res.ok) throw new Error(`embed refused: ${res.status}`);
    return res.json();
  },
});
view.setTheme('dark');
```

**A host must be allowed.** Its origin is in the content Worker's `FRAME_ANCESTORS` and the API's
`EMBED_HOSTS` (one test holds the two together), and its web client may request the Superlibrary
audience in Accounts.

**Frame protocol.** The frame posts `{ type: "superlibrary:resize", height }` to the host origin
signed into its URL; the SDK accepts it only from its own frame (`event.source`), whose origin reads
`"null"` because the frame is sandboxed without `allow-same-origin`. The host may send
`{ type: "superlibrary:theme", theme: "light" | "dark" }`; the frame accepts it only from the signed
host. HTML artifacts render their own page and do not report a height.

The URL lives five minutes. Mount again to view after that.
````

- [ ] **Step 3: Run the test to verify it passes**

```bash
pnpm --filter @superlibrary/embed test && pnpm --filter @superlibrary/embed typecheck
```

Expected: PASS. Revert-proof: remove `e.source !== iframe.contentWindow ||`; the other-frame case fails; restore.

- [ ] **Step 4: Commit and open PR 3**

```bash
git add packages/embed pnpm-lock.yaml
git commit -m "feat(embed): host SDK — sandboxed frame, origin-checked resize and theme, toolbar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

This ends PR 3 (`feat/phase-1-viewer`, Tasks 11-14).

---

### Task 15: The web app — SvelteKit on Pages, in-memory PKCE copied from the AgentPod console

**Files:**
- Create: `apps/web/{package.json,svelte.config.js,vite.config.ts,vitest.config.ts,tsconfig.json}`, `apps/web/static/_headers`, `apps/web/src/{app.html,app.d.ts,app.css}`
- Create (copied, then edited as below): `apps/web/src/lib/auth/{org-plane,pkce}.ts`, `apps/web/src/lib/auth/{org-plane,pkce}.test.ts`
- Create: `apps/web/src/lib/{api,return-to}.ts`, `apps/web/src/lib/session.svelte.ts`
- Create: `apps/web/src/routes/{+layout.ts,+layout.svelte,+page.svelte}`, `apps/web/src/routes/login/+page.svelte`, `apps/web/src/routes/auth/callback/+page.svelte`
- Test: `apps/web/src/lib/{api,return-to}.test.ts` and the copied auth tests

**Interfaces:**
- Consumes: the API's `/.well-known/oauth-protected-resource` and `GET /api/v1/me` (Task 3).
- Produces:
  - Everything the console's `org-plane.ts` exports (`beginSignIn`, `completeSignIn`, `planeAccessToken`, `autoSignIn`, `discardToken`, `hasTokens`, `signOut`, `signOutLocal`, `abandonPendingSignIn`, `suppressAutoSignIn`, `resetPageLoadState`, `userSignedOut`, `watchSession`, `planeOrigin`, `type PlaneDiscovery`), with `CLIENT_ID = "superlibrary-web"` and `discoverPlane(origin: string, fetchFn?): Promise<PlaneDiscovery | null>` reading RFC 9728 metadata from the app's own origin.
  - `createApi(deps: { plane: () => PlaneDiscovery | null; token: (p: PlaneDiscovery) => Promise<string | null>; onUnauthorized: (sent: string | null) => void; dev: boolean; fetchFn?: typeof fetch }): (path: string, init?: RequestInit) => Promise<Response>`, `DEV_PRINCIPAL`, `DEV_ORG` (`lib/api.ts`)
  - `session` (`$state`: `{ me: Me | null; notEnabled: { org: string } | null }`), `initSession()`, `refreshMe()`, `currentPlane()`, `devMode()`, `planeSessionLost(sent)`, `api` (`lib/session.svelte.ts`); `type Me = { principalId: string; org: string; workspaceId: string; role: 'owner' | 'member' }`
  - `safeReturnTo(raw: string | null | undefined): string` (`lib/return-to.ts`)

- [ ] **Step 1: Scaffold the app**

```bash
mkdir -p apps/web/src/lib/auth apps/web/src/routes/login apps/web/src/routes/auth/callback apps/web/static
```

`apps/web/package.json` (Superpipeline's web, minus Tailwind and drag-and-drop):

```json
{
  "name": "@superlibrary/web",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
    "test": "vitest run",
    "e2e": "node ../../scripts/dev-keys.mjs && playwright test"
  },
  "dependencies": {
    "@superlibrary/contract": "workspace:*",
    "@superlibrary/embed": "workspace:*",
    "fflate": "^0.8.2"
  },
  "devDependencies": {
    "@playwright/test": "^1.61.0",
    "@sveltejs/adapter-static": "^3.0.10",
    "@sveltejs/kit": "^2.66.0",
    "@sveltejs/vite-plugin-svelte": "^7.1.2",
    "jsdom": "^30.1.2",
    "svelte": "^5.56.3",
    "svelte-check": "^4.6.0",
    "typescript": "^6.0.3",
    "vite": "^8.0.16"
  }
}
```

`apps/web/svelte.config.js`:

```js
import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** A client-only SPA on Cloudflare Pages; index.html answers every route (Pages' SPA mode). */
export default { preprocess: vitePreprocess(), kit: { adapter: adapter({ fallback: 'index.html' }) } };
```

`apps/web/vite.config.ts` (Superpipeline's proxy, for this API):

```ts
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8787', changeOrigin: false },
      '/.well-known/oauth-protected-resource': { target: 'http://localhost:8787', changeOrigin: false },
    },
  },
});
```

`changeOrigin: false` keeps the browser's `Origin: http://localhost:5173`, which the API signs as the frame host (plan D18).

`apps/web/vitest.config.ts`: copy Superpipeline's verbatim:

```bash
git -C /Users/rakeshgangwar/SuperJackfruit/superpipeline show f81f3f5:apps/web/vitest.config.ts > apps/web/vitest.config.ts
git -C /Users/rakeshgangwar/SuperJackfruit/superpipeline show f81f3f5:apps/web/tsconfig.json > apps/web/tsconfig.json
```

`apps/web/src/routes/+layout.ts`:

```ts
export const ssr = false;
export const prerender = false;
```

`apps/web/src/app.d.ts`:

```ts
declare global {
  namespace App {}
}
export {};
```

`apps/web/src/app.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Superlibrary</title>
    %sveltekit.head%
  </head>
  <body data-sveltekit-preload-data="hover">
    <div style="display: contents">%sveltekit.body%</div>
  </body>
</html>
```

`apps/web/src/app.css`:

```css
:root { color-scheme: light dark; --fg: #1d1d1f; --bg: #fbfbfd; --muted: #6e6e73; --line: #e5e5ea; --accent: #0a66c2; font: 15px/1.5 system-ui, sans-serif; }
@media (prefers-color-scheme: dark) { :root { --fg: #f5f5f7; --bg: #161618; --muted: #a1a1a6; --line: #343437; --accent: #4ea1ff; } }
body { margin: 0; background: var(--bg); color: var(--fg); }
a { color: var(--accent); }
.shell { max-width: 1100px; margin: 0 auto; padding: 16px; }
.top { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--line); margin-bottom: 16px; }
.status, .notice { padding: 32px 16px; text-align: center; color: var(--muted); }
button, input, select, textarea { font: inherit; }
button { padding: 6px 12px; border: 1px solid var(--line); border-radius: 6px; background: transparent; color: inherit; cursor: pointer; }
.error { color: #c0392b; }
.sl-toolbar { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; padding: 8px 0; font-size: 14px; }
.sl-embed iframe { display: block; border: 1px solid var(--line) !important; border-radius: 8px; background: #fff; }
```

`apps/web/static/_headers` (the app itself must not be framed; the content origin is framed instead):

```
/*
  X-Frame-Options: DENY
  Content-Security-Policy: frame-ancestors 'none'
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
```

- [ ] **Step 2: Copy the console's sign-in, then adapt it**

```bash
AP=/Users/rakeshgangwar/SuperJackfruit/agentpod
for f in org-plane.ts pkce.ts org-plane.test.ts pkce.test.ts; do
  git -C $AP show 2efe25a8:apps/console/src/lib/auth/$f > apps/web/src/lib/auth/$f
done
python3 - <<'PY'
import re, pathlib
p = pathlib.Path('apps/web/src/lib/auth/org-plane.ts'); s = p.read_text()
for a, b in [('"agentpod-console"', '"superlibrary-web"'), ('"agentpod.pkce"', '"superlibrary.pkce"'),
             ('"agentpod.planeSignedOut"', '"superlibrary.planeSignedOut"'), ('"agentpod.autoSignIn"', '"superlibrary.autoSignIn"')]:
    assert a in s, a; s = s.replace(a, b)
head_end = s.index('import { challengeFor')
s = '''/**
 * Signing in through the organization plane (issuer contract §3.1): OAuth 2.1 authorization code +
 * PKCE S256, as the first-party public client `superlibrary-web`, with `resource` = the Superlibrary
 * audience on every token request. Copied from the AgentPod console (apps/console/src/lib/auth/
 * org-plane.ts at 2efe25a8, which carries the fixes from #695, #698 and #704); only the client id,
 * the storage keys and discovery differ. Keep it in step with that file.
 *
 * Tokens live in this module's memory only. Which plane comes from this app's own API: RFC 9728
 * protected-resource metadata at `/.well-known/oauth-protected-resource` (same origin).
 */
''' + s[head_end:]
start = s.index('/** Ask the hub which plane it trusts.')
end = s.index("/** Leave for the plane's authorize page.")
s = s[:start] + '''/** Ask this app's API which plane it trusts. `null`: no plane (local dev) or no usable answer. */
export async function discoverPlane(origin: string, fetchFn: typeof fetch = fetch): Promise<PlaneDiscovery | null> {
  try {
    const res = await fetchFn(`${base(origin)}/.well-known/oauth-protected-resource`);
    if (!res.ok) return null;
    const body = (await res.json()) as { resource?: unknown; authorization_servers?: unknown } | null;
    const server = Array.isArray(body?.authorization_servers) ? body.authorization_servers[0] : null;
    if (typeof server !== "string" || !server || typeof body?.resource !== "string" || !body.resource) return null;
    if (!planeOrigin(server)) return null; // a non-https plane is not followed
    return { issuer: server, url: base(server), audience: body.resource };
  } catch {
    return null;
  }
}

''' + s[end:]
s = re.sub(r"\bthe hub's\b", "the API's", s)
s = re.sub(r'\b[Tt]he hub\b', lambda m: 'The API' if m.group(0)[0] == 'T' else 'the API', s)
s = re.sub(r'\ba hub\b', 'an API', s)
p.write_text(s)

t = pathlib.Path('apps/web/src/lib/auth/org-plane.test.ts'); s = t.read_text()
s = s.replace('"agentpod-console"', '"superlibrary-web"').replace('"agentpod.', '"superlibrary.')
start = s.index('describe("discoverPlane", () => {'); end = s.index('describe("authorization code + PKCE"')
s = s[:start] + '''const META = { resource: "https://hub.test", authorization_servers: ["https://accounts.test"] };
describe("discoverPlane", () => {
  test("a 404 (plane off) or an unreachable API means no plane", async () => {
    expect(await discoverPlane("https://app.test", async () => json(404, {}))).toBeNull();
    expect(await discoverPlane("https://app.test", async () => { throw new TypeError("offline"); })).toBeNull();
    expect(await discoverPlane("https://app.test", async () => new Response("<html>", { status: 200 }))).toBeNull();
  });
  test("protected-resource metadata names the plane and the audience", async () => {
    const seen: string[] = [];
    const out = await discoverPlane("https://app.test/", async (u) => { seen.push(String(u)); return json(200, META); });
    expect(out).toEqual(PLANE);
    expect(seen).toEqual(["https://app.test/.well-known/oauth-protected-resource"]);
  });
});

''' + s[end:]
start = s.index('  test("discoverPlane treats a non-https plane URL as no plane at all"'); end = s.index('  test("beginSignIn refuses to navigate anywhere but an https plane"')
s = s[:start] + '''  test("discoverPlane treats a non-https plane URL as no plane at all", async () => {
    for (const url of ["http://accounts.test", "javascript:alert(1)", "file:///etc/passwd", "data:text/html,x", "accounts.test"]) {
      expect(await discoverPlane("https://app.test", async () => json(200, { ...META, authorization_servers: [url] }))).toBeNull();
    }
    for (const url of ["https://accounts.test", "http://localhost:8787", "http://127.0.0.1:8787", "http://[::1]:8787"]) {
      expect(await discoverPlane("https://app.test", async () => json(200, { ...META, authorization_servers: [url] }))).not.toBeNull();
    }
  });

''' + s[end:]
t.write_text('// @vitest-environment jsdom\n' + s)
for f in ['apps/web/src/lib/auth/pkce.test.ts']:
    q = pathlib.Path(f); q.write_text('// @vitest-environment jsdom\n' + q.read_text())
PY
grep -n -i "agentpod\|hub" apps/web/src/lib/auth/org-plane.ts || echo "no product-specific names left"
```

Expected: the last line prints `no product-specific names left` (the test file keeps `https://hub.test` only as an opaque audience string). Then:

```bash
pnpm install && pnpm --filter @superlibrary/web test
```

Expected: PASS — every console test still passes against the copy (the behaviour is unchanged), plus the two replaced discovery tests.

- [ ] **Step 3: Write the failing tests for the API client and the return path**

`apps/web/src/lib/api.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { DEV_ORG, DEV_PRINCIPAL, createApi } from './api';

const PLANE = { issuer: 'https://accounts.test', url: 'https://accounts.test', audience: 'https://app.test' };
const ok = () => new Response('{}', { status: 200 });

describe('createApi', () => {
  it('asks for a token on every request, so a long upload outlives a 5-minute token', async () => {
    let n = 0;
    const token = vi.fn(async () => `t${++n}`);
    const seen: string[] = [];
    const api = createApi({ plane: () => PLANE, token, onUnauthorized: () => {}, dev: false, fetchFn: (async (_u: string, init: RequestInit) => { seen.push(new Headers(init.headers).get('authorization')!); return ok(); }) as never });
    await api('/api/v1/me');
    await api('/api/v1/me');
    expect(token).toHaveBeenCalledTimes(2);
    expect(seen).toEqual(['Bearer t1', 'Bearer t2']);
  });

  it('a 401 reports the token it sent — not a sign-out (console behaviour, #698)', async () => {
    const onUnauthorized = vi.fn();
    const api = createApi({ plane: () => PLANE, token: async () => 'sent-token', onUnauthorized, dev: false, fetchFn: (async () => new Response('{}', { status: 401 })) as never });
    expect((await api('/api/v1/me')).status).toBe(401);
    expect(onUnauthorized).toHaveBeenCalledWith('sent-token');
  });

  it('sends the dev headers only in dev with no plane, never alongside a plane', async () => {
    const heads: Headers[] = [];
    const fetchFn = (async (_u: string, init: RequestInit) => { heads.push(new Headers(init.headers)); return ok(); }) as never;
    await createApi({ plane: () => null, token: async () => null, onUnauthorized: () => {}, dev: true, fetchFn })('/x');
    await createApi({ plane: () => PLANE, token: async () => 't', onUnauthorized: () => {}, dev: true, fetchFn })('/x');
    await createApi({ plane: () => null, token: async () => null, onUnauthorized: () => {}, dev: false, fetchFn })('/x');
    expect([heads[0]!.get('x-dev-principal'), heads[0]!.get('x-dev-org')]).toEqual([DEV_PRINCIPAL, DEV_ORG]);
    expect(heads[1]!.get('x-dev-principal')).toBeNull();
    expect(heads[2]!.get('x-dev-principal')).toBeNull();
  });
});
```

`apps/web/src/lib/return-to.test.ts`:

```ts
import { expect, it } from 'vitest';
import { safeReturnTo } from './return-to';

it('only ever returns a path on this origin', () => {
  expect(safeReturnTo('/a/itm_0000000000000001?x=1')).toBe('/a/itm_0000000000000001?x=1');
  for (const bad of ['//evil.test', '/\\evil.test', 'https://evil.test', 'javascript:alert(1)', '', null, undefined, '/\u0000x']) expect(safeReturnTo(bad)).toBe('/');
});
```

Run `pnpm --filter @superlibrary/web test`. Expected: FAIL — `./api` and `./return-to` do not resolve.

- [ ] **Step 4: Implement the client, the session and the routes**

`apps/web/src/lib/return-to.ts`:

```ts
/** Where a completed sign-in may go: a path on this origin, nothing else. */
export function safeReturnTo(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\') || /[\u0000-\u001f]/.test(raw)) return '/';
  return raw;
}
```

`apps/web/src/lib/api.ts`:

```ts
import type { PlaneDiscovery } from './auth/org-plane';

/** The local-dev person (API DEV_AUTH, plane off). Never sent when a plane is configured. */
export const DEV_PRINCIPAL = 'prn_0000000000000000de01';
export const DEV_ORG = 'org_0000000000000000de01';

export interface ApiDeps {
  plane: () => PlaneDiscovery | null;
  token: (p: PlaneDiscovery) => Promise<string | null>;
  onUnauthorized: (sent: string | null) => void;
  dev: boolean;
  fetchFn?: typeof fetch;
}

/** Every call asks for a token: a refresh happens whenever one is due, mid-upload included. */
export function createApi(deps: ApiDeps) {
  return async function api(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    const plane = deps.plane();
    let sent: string | null = null;
    if (plane) {
      sent = await deps.token(plane);
      if (sent) headers.set('Authorization', `Bearer ${sent}`);
    } else if (deps.dev) {
      headers.set('X-Dev-Principal', DEV_PRINCIPAL);
      headers.set('X-Dev-Org', DEV_ORG);
    }
    const res = await (deps.fetchFn ?? fetch)(path, { ...init, headers });
    if (res.status === 401) deps.onUnauthorized(sent);
    return res;
  };
}
```

`apps/web/src/lib/session.svelte.ts`:

```ts
import { discardToken, discoverPlane, hasTokens, planeAccessToken, type PlaneDiscovery } from './auth/org-plane';
import { createApi } from './api';

export interface Me { principalId: string; org: string; workspaceId: string; role: 'owner' | 'member' }

let plane: PlaneDiscovery | null = null;
export const session = $state<{ me: Me | null; notEnabled: { org: string } | null }>({ me: null, notEnabled: null });

export const currentPlane = () => plane;
export const devMode = () => import.meta.env.DEV && plane === null;

/** A 401 for `sent` (null: none sent). Not a sign-out: the guard re-authorizes (console #698). */
export function planeSessionLost(sent: string | null): void {
  discardToken(sent);
  if (!hasTokens()) session.me = null;
}

export const api = createApi({ plane: currentPlane, token: (p) => planeAccessToken(p), onUnauthorized: planeSessionLost, dev: import.meta.env.DEV });

export async function refreshMe(): Promise<void> {
  if (plane && !hasTokens()) { session.me = null; return; }
  const res = await api('/api/v1/me');
  if (res.ok) {
    session.me = (await res.json()) as Me;
    session.notEnabled = null;
    return;
  }
  session.me = null;
  if (res.status === 403) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; org?: string };
    if (body.error === 'product_not_enabled' && body.org) session.notEnabled = { org: body.org };
  }
}

export async function initSession(): Promise<void> {
  plane = await discoverPlane(window.location.origin);
  await refreshMe();
}

/** Issuer contract §2: a browser product links the person to the plane's enable page. */
export function enableUrl(org: string): string | null {
  return plane ? `${plane.url}/enable?product=superlibrary&workspace=${encodeURIComponent(org)}&return=${encodeURIComponent(window.location.href)}` : null;
}
```

`apps/web/src/routes/+layout.svelte` (the console's guard, apps/console/src/routes/+layout.svelte at 2efe25a8):

```svelte
<script lang="ts">
  import '../app.css';
  import { onDestroy, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { autoSignIn, signOut, watchSession } from '$lib/auth/org-plane';
  import { currentPlane, devMode, enableUrl, initSession, planeSessionLost, session } from '$lib/session.svelte';

  let { children } = $props();
  let initializing = $state(true);
  let autoSigningIn = $state(false);
  const publicRoutes = ['/login', '/auth/callback'];
  let isPublic = $derived(publicRoutes.some((r) => page.url.pathname.startsWith(r)));
  let stop: (() => void) | undefined;

  onMount(async () => {
    await initSession();
    initializing = false;
    stop = watchSession(currentPlane, { onSignedOut: () => planeSessionLost(null) });
  });
  onDestroy(() => stop?.());

  // Tokens are memory-only: a new tab, a reload or a 401 leaves none. Go straight to a silent
  // authorize (prompt=none); /login only after an explicit sign-out or a failed attempt (#704).
  $effect(() => {
    if (initializing || isPublic || session.me || session.notEnabled || devMode()) {
      autoSigningIn = false;
      return;
    }
    const started = autoSignIn(currentPlane(), `${page.url.pathname}${page.url.search}`, {
      onError: () => { autoSigningIn = false; goto('/login'); },
    });
    autoSigningIn = started;
    if (!started) goto('/login');
  });

  async function logOut() {
    await signOut(currentPlane());
    session.me = null;
    await goto('/login');
  }
</script>

{#if initializing || autoSigningIn}
  <p class="status" role="status">Connecting…</p>
{:else if isPublic}
  {@render children()}
{:else if session.notEnabled}
  <main class="notice">
    <h1>Superlibrary is not enabled for this workspace</h1>
    {#if enableUrl(session.notEnabled.org)}<p><a href={enableUrl(session.notEnabled.org)}>Enable it</a> (an owner of the workspace can).</p>{/if}
  </main>
{:else if session.me}
  <div class="shell">
    <header class="top">
      <a href="/"><strong>Superlibrary</strong></a>
      <nav><a href="/upload">Upload</a> · <button type="button" onclick={logOut}>Sign out</button></nav>
    </header>
    {@render children()}
  </div>
{:else}
  <p class="status">Not signed in. <a href="/login">Sign in</a></p>
{/if}
```

`apps/web/src/routes/+page.svelte` (Task 16 replaces it with the library):

```svelte
<h1>Library</h1>
```

`apps/web/src/routes/login/+page.svelte`:

```svelte
<script lang="ts">
  import { beginSignIn } from '$lib/auth/org-plane';
  import { currentPlane } from '$lib/session.svelte';
  let error = $state<string | null>(null);
  async function signIn() {
    const p = currentPlane();
    if (!p) { error = 'This deployment has no sign-in service configured.'; return; }
    try { await beginSignIn(p, { returnTo: '/' }); } catch (e) { error = e instanceof Error ? e.message : 'Sign-in failed.'; }
  }
</script>

<svelte:head><title>Sign in · Superlibrary</title></svelte:head>
<main class="notice">
  <h1>Superlibrary</h1>
  <p>Sign in with your Super Jackfruit Labs account.</p>
  <button type="button" onclick={signIn}>Sign in</button>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</main>
```

`apps/web/src/routes/auth/callback/+page.svelte` (the console's callback, apps/console/src/routes/auth/callback/+page.svelte at 2efe25a8):

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { beginSignIn, completeSignIn, suppressAutoSignIn } from '$lib/auth/org-plane';
  import { currentPlane, initSession, refreshMe, session } from '$lib/session.svelte';
  import { safeReturnTo } from '$lib/return-to';

  let message = $state('Signing you in…');
  let failed = $state(false);

  onMount(async () => {
    if (!currentPlane()) await initSession();
    const p = currentPlane();
    if (!p) { failed = true; message = 'This deployment has no sign-in service configured.'; return; }
    try {
      const { returnTo, interactive } = await completeSignIn(new URLSearchParams(window.location.search), p);
      if (interactive) {
        // The silent authorize found no plane session: ask again, and let the plane show its page.
        message = 'Taking you to sign in…';
        await beginSignIn(p, { returnTo });
        return;
      }
      await refreshMe();
      if (!session.me && !session.notEnabled) {
        // The API refused the new token: going on would loop through the plane. Stop here.
        suppressAutoSignIn();
        failed = true;
        message = 'Superlibrary did not accept the sign-in.';
        return;
      }
      await goto(safeReturnTo(returnTo), { replaceState: true });
    } catch (err) {
      failed = true;
      message = err instanceof Error ? err.message : 'Sign-in failed.';
    }
  });
</script>

<svelte:head><title>Signing in · Superlibrary</title></svelte:head>
<main class="notice">
  <p role={failed ? 'alert' : 'status'} class={failed ? 'error' : ''}>{message}</p>
  {#if failed}<a href="/login">Back to sign-in</a>{/if}
</main>
```

- [ ] **Step 5: Run the tests and the type check**

```bash
pnpm --filter @superlibrary/web test && pnpm --filter @superlibrary/web typecheck && pnpm --filter @superlibrary/web build
```

Expected: PASS, and `apps/web/build/index.html` exists. Revert-proof the console fix #698 in the copy: make `signOutLocal` also call `abandonPendingSignIn()`; the copied test "signOutLocal (the 401 path) keeps the pending sign-in" fails; restore.

- [ ] **Step 6: Commit**

```bash
git add apps/web pnpm-lock.yaml
git commit -m "feat(web): SvelteKit app with the console's in-memory PKCE sign-in

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---

### Task 16: The web app — library list and upload (files, folders, zips)

**Files:**
- Create: `apps/web/src/lib/upload.ts`, `apps/web/src/routes/upload/+page.svelte`
- Replace: `apps/web/src/routes/+page.svelte`
- Test: `apps/web/src/lib/upload.test.ts`

**Interfaces:**
- Consumes: `api` (Task 15), `checkPath`, `LIMITS`, `type CommitResult`, `type ItemSummary`; the upload protocol of Tasks 7-8.
- Produces (`lib/upload.ts`):
  - `interface LocalFile { path: string; bytes: Uint8Array }`
  - `filesFromPicker(files: ArrayLike<File>): Promise<LocalFile[]>` — uses `webkitRelativePath`, dropping the picked folder's own name
  - `zipEntries(zip: Uint8Array): { name: string; size: number; symlink: boolean; dir: boolean }[]`, `expandZip(zip: Uint8Array): LocalFile[] | { refused: string }`
  - `precheck(files: LocalFile[]): string | null` (a sentence, or null when fine)
  - `uploadFiles(api, files, meta: { title: string; item?: string; expiresAt?: string }): Promise<UploadOutcome>` with `type UploadOutcome = { ok: true; result: CommitResult } | { ok: false; status: number; error: string; uploadId?: string; findings?: { path: string; line: number; rule: string }[] }`
  - `overrideAndCommit(api, uploadId: string, reason: string): Promise<UploadOutcome>`

- [ ] **Step 1: Write the failing test**

`apps/web/src/lib/upload.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { zipSync } from 'fflate';
import { LIMITS } from '@superlibrary/contract';
import { expandZip, overrideAndCommit, precheck, uploadFiles, zipEntries } from './upload';

const enc = (s: string) => new TextEncoder().encode(s);
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

function fakeApi(handlers: Record<string, (init: RequestInit) => Response>) {
  const calls: string[] = [];
  const api = async (path: string, init: RequestInit = {}) => {
    const key = `${init.method ?? 'GET'} ${path.replace(/upl_[0-9a-f]{16}/, ':id').replace(/\?path=.*/, '?path')}`;
    calls.push(key);
    return handlers[key]!(init);
  };
  return { api, calls };
}

describe('zips are expanded here, and checked before anything is sent (plan D16)', () => {
  it('expands files, skipping directory entries', () => {
    const zip = zipSync({ 'site/': new Uint8Array(), 'site/index.html': enc('<!doctype html>'), 'site/a.css': enc('p{}') });
    expect(expandZip(zip)).toEqual([{ path: 'site/a.css', bytes: enc('p{}') }, { path: 'site/index.html', bytes: enc('<!doctype html>') }]);
  });

  it('refuses a zip with a symlink entry, naming it', () => {
    const zip = zipSync({ 'ok.txt': enc('x'), 'link': [enc('/etc/passwd'), { os: 3, attrs: (0o120777 << 16) >>> 0 }] });
    expect(zipEntries(zip).find((e) => e.name === 'link')!.symlink).toBe(true);
    expect(expandZip(zip)).toEqual({ refused: 'The zip contains a symbolic link, link, which is not uploaded.' });
  });

  it('refuses a zip whose declared size is over the folder cap before inflating it', () => {
    const zip = zipSync({ 'a.bin': new Uint8Array(10) });
    const view = new DataView(zip.buffer, zip.byteOffset);
    // Patch the central directory's uncompressed size (offset 24) to just over the cap.
    for (let i = zip.length - 22; i >= 0; i--) if (view.getUint32(i, true) === 0x02014b50) { view.setUint32(i + 24, LIMITS.folderBytes + 1, true); break; }
    expect(expandZip(zip)).toMatchObject({ refused: expect.stringContaining('100 MB') });
  });

  it('precheck says why, in a sentence', () => {
    expect(precheck([{ path: '.env', bytes: enc('A=1') }])).toBe('.env is not uploaded: it matches the .env* rule.');
    expect(precheck([{ path: '../x', bytes: enc('') }])).toBe('../x is not uploaded: it leaves the folder.');
    expect(precheck([])).toBe('Choose at least one file.');
    expect(precheck([{ path: 'a.md', bytes: enc('ok') }])).toBeNull();
  });
});

describe('uploadFiles', () => {
  it('declares, sends each file, commits — in that order', async () => {
    const { api, calls } = fakeApi({
      'POST /api/v1/uploads': () => json(201, { uploadId: 'upl_0000000000000001', expiresAt: 'x', entry: 'a.md' }),
      'PUT /api/v1/uploads/:id/files?path': () => json(200, { findings: [] }),
      'POST /api/v1/uploads/:id/commit': () => json(201, { itemId: 'itm_0000000000000001', version: 1 }),
    });
    const out = await uploadFiles(api, [{ path: 'a.md', bytes: enc('# a') }, { path: 'b.md', bytes: enc('# b') }], { title: 'T' });
    expect(out).toMatchObject({ ok: true, result: { itemId: 'itm_0000000000000001' } });
    expect(calls).toEqual(['POST /api/v1/uploads', 'PUT /api/v1/uploads/:id/files?path', 'PUT /api/v1/uploads/:id/files?path', 'POST /api/v1/uploads/:id/commit']);
  });

  it('a secret finding comes back with the upload id, and an override with a reason then commits', async () => {
    const { api, calls } = fakeApi({
      'POST /api/v1/uploads': () => json(201, { uploadId: 'upl_0000000000000002' }),
      'PUT /api/v1/uploads/:id/files?path': () => json(200, { findings: [{ line: 2, rule: 'github-token' }] }),
      'POST /api/v1/uploads/:id/commit': () => json(422, { error: 'secret_found', findings: [{ path: 'c.ts', line: 2, rule: 'github-token' }] }),
      'POST /api/v1/uploads/:id/override': (init) => (JSON.parse(String(init.body)).reason === 'rotated already' ? json(200, { overridden: true }) : json(400, { error: 'invalid' })),
    });
    const first = await uploadFiles(api, [{ path: 'c.ts', bytes: enc('x') }], { title: 'T' });
    expect(first).toEqual({ ok: false, status: 422, error: 'secret_found', uploadId: 'upl_0000000000000002', findings: [{ path: 'c.ts', line: 2, rule: 'github-token' }] });
    await overrideAndCommit(api, 'upl_0000000000000002', 'rotated already');
    expect(calls.slice(-2)).toEqual(['POST /api/v1/uploads/:id/override', 'POST /api/v1/uploads/:id/commit']);
  });
});
```

Run `pnpm --filter @superlibrary/web test src/lib/upload.test.ts`. Expected: FAIL — `./upload` does not resolve.

- [ ] **Step 2: Implement the upload library**

`apps/web/src/lib/upload.ts`:

```ts
import { unzipSync } from 'fflate';
import { LIMITS, checkPath, type CommitResult } from '@superlibrary/contract';

export interface LocalFile { path: string; bytes: Uint8Array }
export type Api = (path: string, init?: RequestInit) => Promise<Response>;
export type UploadOutcome =
  | { ok: true; result: CommitResult }
  | { ok: false; status: number; error: string; uploadId?: string; findings?: { path: string; line: number; rule: string }[] };

/** Files from an <input type=file>, with a folder pick's own name dropped from every path. */
export async function filesFromPicker(files: ArrayLike<File>): Promise<LocalFile[]> {
  const list = Array.from(files);
  const rel = list.map((f) => (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name);
  const tops = new Set(rel.map((p) => p.split('/')[0]));
  const strip = list.length > 0 && rel.every((p) => p.includes('/')) && tops.size === 1;
  return Promise.all(list.map(async (f, i) => ({ path: strip ? rel[i]!.split('/').slice(1).join('/') : rel[i]!, bytes: new Uint8Array(await f.arrayBuffer()) })));
}

/** The central directory, read directly: fflate does not expose an entry's Unix mode. */
export function zipEntries(zip: Uint8Array): { name: string; size: number; symlink: boolean; dir: boolean }[] {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i--) if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('not a zip file');
  const count = view.getUint16(eocd + 10, true);
  let at = view.getUint32(eocd + 16, true);
  const out: { name: string; size: number; symlink: boolean; dir: boolean }[] = [];
  for (let n = 0; n < count; n++) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new Error('damaged zip file');
    const size = view.getUint32(at + 24, true);
    const nameLen = view.getUint16(at + 28, true);
    const extraLen = view.getUint16(at + 30, true);
    const commentLen = view.getUint16(at + 32, true);
    const mode = view.getUint32(at + 38, true) >>> 16;
    const name = new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLen));
    out.push({ name, size, symlink: (mode & 0o170000) === 0o120000, dir: name.endsWith('/') });
    at += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

export function expandZip(zip: Uint8Array): LocalFile[] | { refused: string } {
  let entries;
  try {
    entries = zipEntries(zip);
  } catch (e) {
    return { refused: `This file could not be read as a zip: ${e instanceof Error ? e.message : String(e)}.` };
  }
  const link = entries.find((e) => e.symlink);
  if (link) return { refused: `The zip contains a symbolic link, ${link.name}, which is not uploaded.` };
  const files = entries.filter((e) => !e.dir);
  if (files.length > LIMITS.folderFiles) return { refused: `The zip has ${files.length} files; a folder may have at most ${LIMITS.folderFiles}.` };
  if (files.reduce((n, e) => n + e.size, 0) > LIMITS.folderBytes) return { refused: 'The zip expands to more than 100 MB, the limit for a folder.' };
  const inflated = unzipSync(zip, { filter: (f) => !f.name.endsWith('/') });
  return Object.keys(inflated).sort().map((path) => ({ path, bytes: inflated[path]! }));
}

const REASONS: Record<string, string> = {
  parent: 'it leaves the folder', absolute: 'it is an absolute path', backslash: 'it contains a backslash',
  empty: 'it has no name', control_character: 'it contains a control character', too_long: 'its path is too long',
};

/** The server decides; this only says it first, in the same words for every client. */
export function precheck(files: LocalFile[]): string | null {
  if (files.length === 0) return 'Choose at least one file.';
  for (const f of files) {
    const c = checkPath(f.path);
    if (!c.ok) return `${f.path} is not uploaded: ${c.reason === 'denied' ? `it matches the ${c.rule} rule` : REASONS[c.reason]}.`;
    if (f.bytes.length > LIMITS.fileBytes) return `${f.path} is larger than 25 MB, the limit for one file.`;
  }
  if (files.length > LIMITS.folderFiles) return `A folder may have at most ${LIMITS.folderFiles} files.`;
  if (files.reduce((n, f) => n + f.bytes.length, 0) > LIMITS.folderBytes) return 'Together these are more than 100 MB, the limit for a folder.';
  return null;
}

async function sha256Hex(b: Uint8Array): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].map((x) => x.toString(16).padStart(2, '0')).join('');
}

async function refusal(res: Response, uploadId?: string): Promise<UploadOutcome> {
  const body = (await res.json().catch(() => ({}))) as { error?: string; findings?: { path: string; line: number; rule: string }[] };
  return { ok: false, status: res.status, error: body.error ?? `http_${res.status}`, ...(uploadId ? { uploadId } : {}), ...(body.findings ? { findings: body.findings } : {}) };
}

async function commit(api: Api, uploadId: string): Promise<UploadOutcome> {
  const res = await api(`/api/v1/uploads/${uploadId}/commit`, { method: 'POST' });
  if (!res.ok) return refusal(res, uploadId);
  return { ok: true, result: (await res.json()) as CommitResult };
}

export async function uploadFiles(api: Api, files: LocalFile[], meta: { title: string; item?: string; expiresAt?: string }): Promise<UploadOutcome> {
  const declared = await Promise.all(files.map(async (f) => ({ path: f.path, bytes: f.bytes.length, sha256: await sha256Hex(f.bytes) })));
  const created = await api('/api/v1/uploads', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...meta, files: declared }) });
  if (created.status !== 201) return refusal(created);
  const { uploadId } = (await created.json()) as { uploadId: string };
  for (const f of files) {
    const res = await api(`/api/v1/uploads/${uploadId}/files?path=${encodeURIComponent(f.path)}`, { method: 'PUT', body: f.bytes });
    if (!res.ok) return refusal(res, uploadId);
  }
  return commit(api, uploadId);
}

/** Spec §8: a person may override one artifact's secret refusal; the server records who and why. */
export async function overrideAndCommit(api: Api, uploadId: string, reason: string): Promise<UploadOutcome> {
  const res = await api(`/api/v1/uploads/${uploadId}/override`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason }) });
  if (!res.ok) return refusal(res, uploadId);
  return commit(api, uploadId);
}
```

- [ ] **Step 3: Write the two pages**

`apps/web/src/routes/+page.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import type { ItemSummary } from '@superlibrary/contract';
  import { api } from '$lib/session.svelte';

  let items = $state<ItemSummary[]>([]);
  let next = $state<string | null>(null);
  let error = $state<string | null>(null);

  async function load(before: string | null = null) {
    const res = await api(`/api/v1/items?limit=50${before ? `&before=${encodeURIComponent(before)}` : ''}`);
    if (!res.ok) { error = `The library could not be loaded (HTTP ${res.status}).`; return; }
    const body = (await res.json()) as { items: ItemSummary[]; next: string | null };
    items = before ? [...items, ...body.items] : body.items;
    next = body.next;
  }
  onMount(() => load());
</script>

<svelte:head><title>Library · Superlibrary</title></svelte:head>
<h1>Library</h1>
{#if error}<p class="error" role="alert">{error}</p>{/if}
{#if items.length === 0 && !error}
  <p>Nothing here yet. <a href="/upload">Upload a file or a folder</a>.</p>
{:else}
  <ul class="items">
    {#each items as item (item.id)}
      <li><a href={`/a/${item.id}`}>{item.title}</a> <small>v{item.latestVersion} · {item.scope} · {new Date(item.createdAt + 'Z').toLocaleString()}</small></li>
    {/each}
  </ul>
  {#if next}<button type="button" onclick={() => load(next)}>More</button>{/if}
{/if}
```

`apps/web/src/routes/upload/+page.svelte`:

```svelte
<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { api } from '$lib/session.svelte';
  import { expandZip, filesFromPicker, overrideAndCommit, precheck, uploadFiles, type LocalFile, type UploadOutcome } from '$lib/upload';

  let title = $state('');
  let expires = $state('');
  let asFolder = $state(true);
  let files = $state<LocalFile[]>([]);
  let message = $state<string | null>(null);
  let busy = $state(false);
  let refused = $state<Extract<UploadOutcome, { ok: false }> | null>(null);
  let reason = $state('');
  const item = page.url.searchParams.get('item') ?? undefined;

  async function picked(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    let chosen = await filesFromPicker(input.files ?? []);
    if (asFolder && chosen.length === 1 && chosen[0]!.path.toLowerCase().endsWith('.zip')) {
      const out = expandZip(chosen[0]!.bytes);
      if ('refused' in out) { message = out.refused; files = []; return; }
      chosen = out;
    }
    files = chosen;
    message = precheck(files);
    if (!title && files[0]) title = files.length === 1 ? files[0].path : (input.files?.[0] as File & { webkitRelativePath?: string })?.webkitRelativePath?.split('/')[0] || 'Folder';
  }

  async function finish(out: UploadOutcome) {
    busy = false;
    if (out.ok) { await goto(`/a/${out.result.itemId}`); return; }
    if (out.error === 'secret_found') { refused = out; message = null; return; }
    message = `The upload was refused: ${out.error} (HTTP ${out.status}).`;
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    const problem = precheck(files);
    if (problem) { message = problem; return; }
    busy = true;
    await finish(await uploadFiles(api, files, { title: title.trim() || 'Untitled', item, ...(expires ? { expiresAt: new Date(expires).toISOString() } : {}) }));
  }

  async function override(e: SubmitEvent) {
    e.preventDefault();
    if (!refused?.uploadId || reason.trim() === '') return;
    busy = true;
    await finish(await overrideAndCommit(api, refused.uploadId, reason.trim()));
  }
</script>

<svelte:head><title>Upload · Superlibrary</title></svelte:head>
<h1>{item ? 'Upload a new version' : 'Upload'}</h1>
<form onsubmit={submit}>
  <p><label>Title <input name="title" bind:value={title} required maxlength="200" /></label></p>
  <p><label>Files <input name="files" type="file" multiple onchange={picked} /></label></p>
  <p><label>Folder <input name="folder" type="file" webkitdirectory onchange={picked} /></label></p>
  <p><label><input type="checkbox" bind:checked={asFolder} /> Upload a .zip as the folder inside it</label></p>
  <p><label>Delete on (optional) <input name="expires" type="date" bind:value={expires} /></label></p>
  <p>{files.length} file{files.length === 1 ? '' : 's'} chosen.</p>
  <button type="submit" disabled={busy}>{busy ? 'Uploading…' : 'Upload'}</button>
</form>
{#if message}<p class="error" role="alert">{message}</p>{/if}
{#if refused?.findings}
  <section aria-labelledby="secrets">
    <h2 id="secrets">This looks like it contains a secret</h2>
    <ul>{#each refused.findings as f}<li><code>{f.path}</code> line {f.line}: {f.rule}</li>{/each}</ul>
    <p>Nothing was stored. Remove the secret and upload again, or, if it is not a live secret, say why and upload anyway. Your name and reason are recorded.</p>
    <form onsubmit={override}>
      <label>Reason <input name="reason" bind:value={reason} required maxlength="500" /></label>
      <button type="submit" disabled={busy}>Upload anyway</button>
    </form>
  </section>
{/if}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm --filter @superlibrary/web test && pnpm --filter @superlibrary/web typecheck
```

Expected: PASS. Revert-proof: make `zipEntries` report `symlink: false` always; the symlink case fails; restore.

- [ ] **Step 5: Commit**

```bash
git add apps/web pnpm-lock.yaml
git commit -m "feat(web): library list and upload of files, folders and zips, with the scan override

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---

### Task 17: The web app — the item page, through the same embed as every host

**Files:**
- Create: `apps/web/src/lib/item.ts`, `apps/web/src/lib/ItemView.svelte`
- Create: `apps/web/src/routes/a/[itemId]/+page.svelte`, `apps/web/src/routes/a/[itemId]/v/[version]/+page.svelte`
- Test: `apps/web/src/lib/item.test.ts`

**Interfaces:**
- Consumes: `api`, `mountArtifact` (`@superlibrary/embed`), `GET /api/v1/items/:id`, `POST …/embed`, `POST …/revoke`, `POST …/versions/:n/revoke`, `PATCH /api/v1/items/:id`.
- Produces: `embedUrlGetter(api): MountOptions['getEmbedUrl']` (throws `ItemError` with the server's code), `class ItemError extends Error { status: number; code: string }`, `parseVersion(raw: string | undefined): number | undefined`, `explain(code: string): string` (`lib/item.ts`); the route `https://app.superlibrary.dev/a/<id>[/v/<n>]` that `@superlibrary/embed`'s **Open in new window** and the spec §5 URL point to.

- [ ] **Step 1: Write the failing test**

`apps/web/src/lib/item.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ItemError, embedUrlGetter, explain, parseVersion } from './item';

describe('item helpers', () => {
  it('asks the API for an embed URL with the version, if any', async () => {
    const bodies: string[] = [];
    const get = embedUrlGetter(async (path, init) => { bodies.push(`${path} ${init?.body}`); return new Response(JSON.stringify({ url: 'u', version: 2 }), { status: 200 }); });
    await get({ itemId: 'itm_0000000000000001', version: 2 });
    await get({ itemId: 'itm_0000000000000001' });
    expect(bodies).toEqual(['/api/v1/items/itm_0000000000000001/embed {"version":2}', '/api/v1/items/itm_0000000000000001/embed {}']);
  });
  it('turns a refusal into an ItemError with the server’s code', async () => {
    const get = embedUrlGetter(async () => new Response(JSON.stringify({ error: 'revoked' }), { status: 410 }));
    await expect(get({ itemId: 'itm_0000000000000001' })).rejects.toMatchObject({ status: 410, code: 'revoked' });
    expect(new ItemError(410, 'revoked')).toBeInstanceOf(Error);
  });
  it('parses a version from the route, and explains codes in words', () => {
    expect(parseVersion('3')).toBe(3);
    for (const bad of ['0', '-1', 'x', '1.5', undefined]) expect(parseVersion(bad)).toBeUndefined();
    expect(explain('revoked')).toBe('This was revoked.');
    expect(explain('not_found')).toBe('Nothing here, or you cannot see it.');
  });
});
```

Run `pnpm --filter @superlibrary/web test src/lib/item.test.ts`. Expected: FAIL — `./item` does not resolve.

- [ ] **Step 2: Implement**

`apps/web/src/lib/item.ts`:

```ts
import type { EmbedGrant } from '@superlibrary/contract';
import type { MountOptions } from '@superlibrary/embed';

type Api = (path: string, init?: RequestInit) => Promise<Response>;

export class ItemError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}

/** The app is one more host of the embed (spec §9, Embedding): no renderer of its own. */
export function embedUrlGetter(api: Api): MountOptions['getEmbedUrl'] {
  return async ({ itemId, version }) => {
    const res = await api(`/api/v1/items/${itemId}/embed`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(version ? { version } : {}) });
    if (!res.ok) throw new ItemError(res.status, ((await res.json().catch(() => ({}))) as { error?: string }).error ?? `http_${res.status}`);
    return (await res.json()) as EmbedGrant;
  };
}

export function parseVersion(raw: string | undefined): number | undefined {
  return raw && /^[1-9][0-9]*$/.test(raw) ? Number(raw) : undefined;
}

const WORDS: Record<string, string> = {
  revoked: 'This was revoked.', expired: 'This has expired.', not_found: 'Nothing here, or you cannot see it.',
  not_permitted: 'Only the person who uploaded it, or an owner of the workspace, may do that.',
};
export const explain = (code: string) => WORDS[code] ?? `Something went wrong (${code}).`;
```

`apps/web/src/lib/ItemView.svelte`:

```svelte
<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { ItemSummary, VersionSummary } from '@superlibrary/contract';
  import { mountArtifact, type Mounted } from '@superlibrary/embed';
  import { api } from '$lib/session.svelte';
  import { ItemError, embedUrlGetter, explain } from '$lib/item';

  let { itemId, version }: { itemId: string; version?: number } = $props();
  let item = $state<ItemSummary | null>(null);
  let versions = $state<VersionSummary[]>([]);
  let error = $state<string | null>(null);
  let frame = $state<HTMLElement | null>(null);
  let mounted: Mounted | null = null;
  let expires = $state('');

  async function load() {
    error = null;
    const res = await api(`/api/v1/items/${itemId}`);
    if (!res.ok) { error = explain(((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'unknown'); return; }
    const body = (await res.json()) as { item: ItemSummary; versions: VersionSummary[] };
    item = body.item;
    versions = body.versions;
  }

  $effect(() => {
    if (!frame || !item) return;
    mounted?.destroy();
    mountArtifact(frame, { itemId, version, getEmbedUrl: embedUrlGetter(api), appUrl: window.location.origin })
      .then((m) => { mounted = m; })
      .catch((e: unknown) => { error = e instanceof ItemError ? explain(e.code) : String(e); });
  });
  onDestroy(() => mounted?.destroy());
  $effect(() => { void itemId; void version; load(); });

  async function act(path: string, init: RequestInit) {
    const res = await api(path, { headers: { 'content-type': 'application/json' }, ...init });
    if (!res.ok) { error = explain(((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'unknown'); return; }
    await load();
  }
  const revokeItem = () => confirm('Revoke this item? Nobody will be able to view it.') && act(`/api/v1/items/${itemId}/revoke`, { method: 'POST', body: JSON.stringify({ reason: prompt('Why? (optional)') ?? undefined }) });
  const revokeVersion = (n: number) => confirm(`Revoke version ${n}?`) && act(`/api/v1/items/${itemId}/versions/${n}/revoke`, { method: 'POST', body: '{}' });
  const setExpiry = () => act(`/api/v1/items/${itemId}`, { method: 'PATCH', body: JSON.stringify({ expiresAt: expires ? new Date(expires).toISOString() : null }) });
</script>

{#if error}<p class="error" role="alert">{error}</p>{/if}
{#if item}
  <h1>{item.title}</h1>
  <p><small>Uploaded by <code>{item.createdBy}</code> · {new Date(item.createdAt + 'Z').toLocaleString()} · scope {item.scope} · {item.outcome}{item.expiresAt ? ` · deleted on ${new Date(item.expiresAt).toLocaleDateString()}` : ''}</small></p>
  <div bind:this={frame}></div>
  <h2>Versions</h2>
  <ul>
    {#each versions as v (v.version)}
      <li>
        <a href={`/a/${itemId}/v/${v.version}`}>v{v.version}</a> · {v.fileCount} file{v.fileCount === 1 ? '' : 's'} · <code>{v.sha256.slice(0, 12)}</code>
        {#if v.scanOverride} · secret scan overridden{/if}
        {#if v.revokedAt} · revoked{:else} <button type="button" onclick={() => revokeVersion(v.version)}>Revoke</button>{/if}
      </li>
    {/each}
  </ul>
  <p><a href={`/upload?item=${itemId}`}>Upload a new version</a></p>
  <p><label>Delete on <input type="date" bind:value={expires} /></label> <button type="button" onclick={setExpiry}>{expires ? 'Set' : 'Keep (clear the date)'}</button></p>
  <p><button type="button" onclick={revokeItem}>Revoke this item</button></p>
{/if}
```

`apps/web/src/routes/a/[itemId]/+page.svelte`:

```svelte
<script lang="ts">
  import { page } from '$app/state';
  import ItemView from '$lib/ItemView.svelte';
</script>

<ItemView itemId={page.params.itemId!} />
```

`apps/web/src/routes/a/[itemId]/v/[version]/+page.svelte`:

```svelte
<script lang="ts">
  import { page } from '$app/state';
  import ItemView from '$lib/ItemView.svelte';
  import { parseVersion } from '$lib/item';
</script>

<ItemView itemId={page.params.itemId!} version={parseVersion(page.params.version)} />
```

- [ ] **Step 3: Run the tests to verify they pass**

```bash
pnpm --filter @superlibrary/web test && pnpm --filter @superlibrary/web typecheck && pnpm --filter @superlibrary/web build
```

Expected: PASS. The page itself is exercised end to end by Task 18.

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "feat(web): item page embedding the content-origin viewer, versions, revoke and expiry

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---

### Task 18: End to end — every kind renders, and the malicious-HTML security suite (spec §15)

**Files:**
- Create: `apps/web/playwright.config.ts`, `apps/web/e2e/helpers.ts`, `apps/web/e2e/kinds.spec.ts`, `apps/web/e2e/security.spec.ts`, `apps/web/e2e/upload.spec.ts`, `apps/web/e2e/fixtures/probe.js`
- Modify: `.github/workflows/ci.yml` (add the `e2e` job), `.gitignore` (`.wrangler-e2e/`)

**Interfaces:**
- Consumes: the three dev servers — API `:8787` (`DEV_AUTH`), content `:8788` (`CONTENT_DOMAIN=localhost`, so `http://itm-<hex>.localhost:8788`), web `:5173` — sharing one local R2 through `--persist-to ../../.wrangler-e2e`; `DEV_PRINCIPAL`/`DEV_ORG` (Task 15).
- Produces: `uploadViaApi(request: APIRequestContext, files: { path: string; body: string | Buffer }[], opts?: { title?: string; override?: string }): Promise<CommitResult>` and `frameOf(page: Page)` (`e2e/helpers.ts`).

- [ ] **Step 1: Write the Playwright configuration and helpers**

`apps/web/playwright.config.ts` (Superpipeline's shape, three servers):

```ts
import { defineConfig, devices } from '@playwright/test';

// The real stack: the API Worker, the content Worker and the SvelteKit dev server. Both Workers
// persist to one directory, so the bytes the API writes are the bytes the content Worker reads.
// `pnpm e2e` writes a fresh dev signing pair first (scripts/dev-keys.mjs).
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: { baseURL: 'http://localhost:5173', trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: process.env.PW_CHANNEL || undefined } }],
  webServer: [
    {
      command: 'pnpm --filter @superlibrary/api exec wrangler d1 migrations apply superlibrary-catalog --local --persist-to ../../.wrangler-e2e && pnpm --filter @superlibrary/api dev --persist-to ../../.wrangler-e2e',
      url: 'http://localhost:8787/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      command: 'pnpm --filter @superlibrary/content dev --persist-to ../../.wrangler-e2e',
      port: 8788,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    { command: 'pnpm --filter @superlibrary/web dev', url: 'http://localhost:5173', reuseExistingServer: !process.env.CI, timeout: 120_000 },
  ],
});
```

`apps/web/e2e/helpers.ts`:

```ts
import { createHash } from 'node:crypto';
import type { APIRequestContext, FrameLocator, Page } from '@playwright/test';
import type { CommitResult } from '@superlibrary/contract';

const API = 'http://localhost:8787';
export const DEV = { 'X-Dev-Principal': 'prn_0000000000000000de01', 'X-Dev-Org': 'org_0000000000000000de01' };

/** The whole upload protocol, as a person (DEV_AUTH). */
export async function uploadViaApi(request: APIRequestContext, files: { path: string; body: string | Buffer }[], opts: { title?: string; override?: string } = {}): Promise<CommitResult> {
  const bufs = files.map((f) => ({ path: f.path, buf: Buffer.isBuffer(f.body) ? f.body : Buffer.from(f.body) }));
  const created = await request.post(`${API}/api/v1/uploads`, {
    headers: DEV,
    data: { title: opts.title ?? 'e2e', files: bufs.map((f) => ({ path: f.path, bytes: f.buf.length, sha256: createHash('sha256').update(f.buf).digest('hex') })) },
  });
  if (created.status() !== 201) throw new Error(`declare: ${created.status()} ${await created.text()}`);
  const { uploadId } = await created.json();
  for (const f of bufs) {
    const put = await request.put(`${API}/api/v1/uploads/${uploadId}/files?path=${encodeURIComponent(f.path)}`, { headers: DEV, data: f.buf });
    if (!put.ok()) throw new Error(`put ${f.path}: ${put.status()} ${await put.text()}`);
  }
  if (opts.override) await request.post(`${API}/api/v1/uploads/${uploadId}/override`, { headers: DEV, data: { reason: opts.override } });
  const committed = await request.post(`${API}/api/v1/uploads/${uploadId}/commit`, { headers: DEV });
  if (committed.status() !== 201) throw new Error(`commit: ${committed.status()} ${await committed.text()}`);
  return committed.json();
}

export async function embedUrl(request: APIRequestContext, itemId: string): Promise<string> {
  const res = await request.post(`${API}/api/v1/items/${itemId}/embed`, { headers: { ...DEV, Origin: 'http://localhost:5173' }, data: {} });
  return (await res.json()).url;
}

export const frameOf = (page: Page): FrameLocator => page.frameLocator('iframe[title="Superlibrary artifact"]');
```

`apps/web/e2e/fixtures/probe.js` — the malicious artifact's script (external: the CSP forbids inline script, plan D3):

```js
// Tries everything an artifact must not be able to do (spec §15 "Content origin"), and writes what
// happened into #results for the test to read.
const out = {};
const attempt = async (name, fn) => {
  try {
    const v = await fn();
    out[name] = 'allowed:' + String(v).slice(0, 60);
  } catch (e) {
    out[name] = 'blocked:' + ((e && e.name) || 'Error');
  }
};
(async () => {
  await attempt('localStorage', () => localStorage.getItem('secret'));
  await attempt('sessionStorage', () => sessionStorage.getItem('secret'));
  await attempt('cookie', () => document.cookie);
  await attempt('indexedDB', () => new Promise((res, rej) => { const r = indexedDB.open('probe'); r.onsuccess = () => res('opened'); r.onerror = () => rej(r.error); }));
  await attempt('parentStorage', () => parent.localStorage.getItem('secret'));
  await attempt('parentDocument', () => parent.document.title);
  await attempt('topLocation', () => top.location.href);
  await attempt('fetchExternal', () => fetch('https://example.com/').then((r) => r.status));
  await attempt('fetchSelf', () => fetch(location.href).then((r) => r.status));
  await attempt('xhr', () => new Promise((res, rej) => { const x = new XMLHttpRequest(); x.open('GET', 'https://example.com/'); x.onload = () => res(x.status); x.onerror = () => rej(new Error('xhr')); x.send(); }));
  await attempt('websocket', () => new Promise((res, rej) => { const w = new WebSocket('wss://example.com/'); w.onopen = () => res('open'); w.onerror = () => rej(new Error('ws')); }));
  await attempt('popup', () => { const w = window.open('https://example.com/'); if (!w) throw new Error('null'); return 'opened'; });
  await attempt('beacon', () => navigator.sendBeacon('https://example.com/beacon', 'x'));
  await attempt('topNavigation', () => { top.location.href = 'https://example.com/'; return 'assigned'; });
  document.getElementById('results').textContent = JSON.stringify(out);
})();
```

- [ ] **Step 2: Write the security suite**

`apps/web/e2e/security.spec.ts`:

```ts
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { embedUrl, frameOf, uploadViaApi } from './helpers';

const PROBE = readFileSync(new URL('./fixtures/probe.js', import.meta.url), 'utf8');
const HTML = '<!doctype html><html><body><pre id="results"></pre><script src="probe.js"></script></body></html>';

test.describe('the content origin, under a malicious HTML artifact (spec §15)', () => {
  test('it runs, and can read no storage, reach no network, navigate nothing and open nothing', async ({ page, request }) => {
    const item = await uploadViaApi(request, [{ path: 'index.html', body: HTML }, { path: 'probe.js', body: PROBE }], { title: 'probe' });
    const outbound: string[] = [];
    page.on('request', (r) => { if (r.url().includes('example.com')) outbound.push(r.url()); });
    const popups: string[] = [];
    page.on('popup', (p) => popups.push(p.url()));
    await page.goto('/');
    await page.evaluate(() => { localStorage.setItem('secret', 'app-secret'); sessionStorage.setItem('secret', 'app-secret'); });
    await page.goto(`/a/${item.itemId}`);
    const results = frameOf(page).locator('#results');
    await expect(results).not.toBeEmpty({ timeout: 15_000 });
    const r = JSON.parse((await results.textContent())!) as Record<string, string>;

    for (const k of ['localStorage', 'sessionStorage', 'cookie', 'indexedDB', 'parentStorage', 'parentDocument', 'topLocation', 'fetchExternal', 'fetchSelf', 'xhr', 'websocket', 'popup']) {
      expect(r[k], k).toMatch(/^blocked:/);
    }
    expect(JSON.stringify(r)).not.toContain('app-secret');
    await page.waitForTimeout(1000);
    expect(outbound, 'no request reached the network').toEqual([]);
    expect(popups).toEqual([]);
    expect(new URL(page.url()).pathname, 'the top window did not navigate').toBe(`/a/${item.itemId}`);
  });

  test('it cannot be framed by an origin outside the allowlist', async ({ page, request }) => {
    const item = await uploadViaApi(request, [{ path: 'index.html', body: HTML }, { path: 'probe.js', body: PROBE }]);
    const url = await embedUrl(request, item.itemId);
    await page.route('http://evil.localhost:9999/**', (route) => route.fulfill({ contentType: 'text/html', body: `<iframe sandbox="allow-scripts" src="${url}"></iframe>` }));
    await page.goto('http://evil.localhost:9999/');
    await expect.poll(() => page.frames().find((f) => f !== page.mainFrame())?.url() ?? '', { timeout: 10_000 }).toMatch(/^chrome-error:/);
  });

  test('the frame the app renders has exactly the spec §9 sandbox and referrer policy', async ({ page, request }) => {
    const item = await uploadViaApi(request, [{ path: 'a.md', body: '# a' }]);
    await page.goto(`/a/${item.itemId}`);
    const frame = page.locator('iframe[title="Superlibrary artifact"]');
    await expect(frame).toHaveAttribute('sandbox', 'allow-scripts allow-popups-to-escape-sandbox');
    await expect(frame).toHaveAttribute('referrerpolicy', 'no-referrer');
  });
});
```

- [ ] **Step 3: Write the kinds and upload suites**

`apps/web/e2e/kinds.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { frameOf, uploadViaApi } from './helpers';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR4nGP4z8DwHwyBNAMDACKlBPylyd9TAAAAAElFTkSuQmCC', 'base64');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
function wav(): Buffer {
  const data = Buffer.alloc(800);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(8000, 24);
  h.writeUInt32LE(8000, 28); h.writeUInt16LE(1, 32); h.writeUInt16LE(8, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

const cases: Array<[string, { path: string; body: string | Buffer }[], (f: ReturnType<typeof frameOf>) => Promise<void>]> = [
  ['Markdown with a table, a task list and a Mermaid block', [{ path: 'r.md', body: '| a | b |\n|---|---|\n| 1 | 2 |\n\n- [x] done\n\n```mermaid\ngraph TD; A-->B;\n```\n' }],
    async (f) => { await expect(f.locator('table')).toBeVisible(); await expect(f.locator('input[type=checkbox]')).toBeVisible(); await expect(f.locator('figure.diagram svg')).toBeVisible({ timeout: 15_000 }); }],
  ['code, highlighted', [{ path: 'a.ts', body: 'export const x: number = 1;\n' }], async (f) => { await expect(f.locator('code.hljs .hljs-keyword').first()).toBeVisible(); }],
  ['CSV as a table', [{ path: 'd.csv', body: 'n,name\n1,a\n2,b\n' }], async (f) => { await expect(f.locator('tbody tr')).toHaveCount(2); }],
  ['JSON as a tree', [{ path: 'd.json', body: '{"a":{"b":[1,2]}}' }], async (f) => { await expect(f.locator('.tree')).toBeVisible(); }],
  ['a PNG', [{ path: 'p.png', body: PNG }], async (f) => { await expect.poll(() => f.locator('img.zoomable').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(2); }],
  ['SVG as an image', [{ path: 's.svg', body: '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4"/></svg>' }],
    async (f) => { await expect.poll(() => f.locator('img.zoomable').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(4); }],
  ['a PDF', [{ path: 'p.pdf', body: PDF }], async (f) => { await expect(f.locator('.pdf canvas')).toHaveCount(1, { timeout: 15_000 }); }],
  ['Graphviz', [{ path: 'g.dot', body: 'digraph { a -> b }' }], async (f) => { await expect(f.locator('figure.diagram svg')).toBeVisible({ timeout: 15_000 }); }],
  ['a notebook', [{ path: 'n.ipynb', body: JSON.stringify({ nbformat: 4, metadata: {}, cells: [{ cell_type: 'code', source: 'print(1)', execution_count: 1, outputs: [{ output_type: 'stream', text: '1\n' }] }] }) }],
    async (f) => { await expect(f.locator('.cell.code')).toBeVisible(); }],
  ['audio', [{ path: 'a.wav', body: wav() }], async (f) => { await expect(f.locator('audio[controls]')).toBeVisible(); }],
  ['an Office file as a download card', [{ path: 'a.docx', body: Buffer.from('PK\u0003\u0004....word/document.xml') }], async (f) => { await expect(f.locator('.card')).toContainText('wordprocessingml'); }],
  ['a multi-file HTML app: its own module script and CSS load (plan D2)', [
    { path: 'index.html', body: '<!doctype html><link rel="stylesheet" href="style.css"><p id="t">waiting</p><script type="module" src="app.js"></script>' },
    { path: 'style.css', body: '#t { color: rgb(1, 2, 3); }' },
    { path: 'app.js', body: 'document.getElementById("t").textContent = "ran";' },
  ], async (f) => { await expect(f.locator('#t')).toHaveText('ran'); await expect(f.locator('#t')).toHaveCSS('color', 'rgb(1, 2, 3)'); }],
];

for (const [name, files, check] of cases) {
  test(`renders ${name}`, async ({ page, request }) => {
    const item = await uploadViaApi(request, files, { title: name });
    await page.goto(`/a/${item.itemId}`);
    await check(frameOf(page));
  });
}

test('the frame grows to its content, and the toolbar links are right', async ({ page, request }) => {
  const item = await uploadViaApi(request, [{ path: 'long.md', body: Array.from({ length: 300 }, (_, i) => `Line ${i}\n`).join('\n') }]);
  await page.goto(`/a/${item.itemId}`);
  const frame = page.locator('iframe[title="Superlibrary artifact"]');
  await expect.poll(async () => (await frame.boundingBox())!.height).toBeGreaterThan(480);
  await expect(page.locator('a.sl-open')).toHaveAttribute('href', `http://localhost:5173/a/${item.itemId}`);
  await expect(page.locator('a.sl-download')).toHaveAttribute('href', /\/s\/[^/]+\/long\.md\?download=1$/);
  await expect(page.locator('.sl-version')).toHaveText('v1');
});
```

`apps/web/e2e/upload.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { frameOf } from './helpers';

test('a person uploads a file and lands on its page', async ({ page }) => {
  await page.goto('/upload');
  await page.locator('input[name=files]').setInputFiles({ name: 'hello.md', mimeType: 'text/markdown', buffer: Buffer.from('# Hello from e2e\n') });
  await page.getByRole('button', { name: 'Upload' }).click();
  await expect(page).toHaveURL(/\/a\/itm_[0-9a-f]{16}$/);
  await expect(frameOf(page).locator('h1')).toHaveText('Hello from e2e');
});

test('a secret is refused with its file and line; an override with a reason uploads it', async ({ page }) => {
  await page.goto('/upload');
  const secret = 'const t = "' + 'gh' + 'p_' + 'aB3xQ9zK7mP2wR5t'.repeat(3) + '";\n';
  await page.locator('input[name=files]').setInputFiles({ name: 'config.ts', mimeType: 'text/plain', buffer: Buffer.from('const a = 1;\n' + secret) });
  await page.getByRole('button', { name: 'Upload' }).click();
  await expect(page.getByText('config.ts')).toBeVisible();
  await expect(page.getByText('line 2: github-token')).toBeVisible();
  await page.locator('input[name=reason]').fill('fixture, not a live key');
  await page.getByRole('button', { name: 'Upload anyway' }).click();
  await expect(page).toHaveURL(/\/a\/itm_[0-9a-f]{16}$/);
});

test('a denylisted path is refused before anything is sent', async ({ page }) => {
  await page.goto('/upload');
  await page.locator('input[name=files]').setInputFiles({ name: '.env', mimeType: 'text/plain', buffer: Buffer.from('A=1\n') });
  await expect(page.getByRole('alert')).toHaveText('.env is not uploaded: it matches the .env* rule.');
});
```

- [ ] **Step 4: Run the suite**

```bash
pnpm --filter @superlibrary/web exec playwright install chromium
pnpm --filter @superlibrary/web e2e
```

Expected: PASS (security 3, kinds 13, upload 3). If `security.spec.ts`'s storage checks report `allowed:`, stop: that is a sandbox regression, not a flaky test. If the multi-file HTML case fails on colour or text, D2's split headers are not being applied — check `subresourceHeaders`. Revert-proof the sandbox: in `packages/embed/src/index.ts` set `SANDBOX` to `'allow-scripts allow-same-origin'`; the storage checks turn `allowed:` (and the attribute test fails); restore.

- [ ] **Step 5: Add the e2e job to CI**

Append to `.github/workflows/ci.yml` under `jobs:` (Superpipeline's `e2e` job):

```yaml
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @superlibrary/web exec playwright install --with-deps chromium
      # Boots the API (:8787), the content Worker (:8788) and the web dev server (:5173).
      - run: pnpm --filter @superlibrary/web e2e
```

- [ ] **Step 6: Commit and open PR 4**

```bash
git add apps/web .github/workflows/ci.yml .gitignore
git commit -m "test(e2e): every kind renders; malicious HTML cannot reach storage, network, top or outside framers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

This ends PR 4 (`feat/phase-1-web`, Tasks 15-18).

---

### Task 19: `suli` — command table, generated reference with drift guard, sign-in

**Files:**
- Create: `packages/cli/{package.json,tsconfig.json,vitest.config.ts}`, `packages/cli/src/{index,commands,reference,args,credential,plane-login}.ts`
- Create (generated): `docs/reference/cli/{index,session,artifacts}.md`
- Modify: `.github/workflows/ci.yml` (bun in the `test` job)
- Test: `packages/cli/src/{reference,credential,plane-login}.test.ts`

**Interfaces:**
- Consumes: the API's `/.well-known/oauth-protected-resource` and `GET /api/v1/me`; the plane's device flow (issuer contract §3.2) with `client_id: "suli"` (Accounts plan Task A1).
- Produces:
  - `COMMANDS: CommandSpec[]`, `GROUPS`, `GLOBAL_FLAGS`, `ENV_VARS`, `commandName(c)`, `synopsis(c)`, `findCommands(words)`, `renderUsage()`, `renderCommandHelp(c)` (`commands.ts`, Superpipeline's shape with `Access = { person: 'member' | 'uploader-or-owner' | null; agent: 'refused' | null; note?: string }`)
  - `renderReference(): Map<string, string>`, `REFERENCE_DIR = 'docs/reference/cli'` (`reference.ts`)
  - `flag`, `positionals`, `VALUELESS` (`args.ts`, copied from `supi`)
  - `SULI_CLIENT_ID = 'suli'`, `discoverPlane(base, fetch?)`, `deviceLogin(target, io, fetch?)`, `exchangeDevice(target, credential, fetch?)` (`plane-login.ts`, copied from `supi`)
  - `ENV_TOKEN = 'SUPERLIBRARY_TOKEN'`, `ENV_BASE = 'SUPERLIBRARY_URL'`, `DEFAULT_BASE`, `baseUrl()`, `configDir(platform?)`, `saveDevice(d)`, `clearCredentials()`, `tokenSource(deps?): { token(): Promise<string | null>; kind: 'env' | 'device' | 'none' }` (`credential.ts`) — Task 20's client calls `token()` before **every** request.

- [ ] **Step 1: Scaffold and copy what `supi` already got right**

```bash
mkdir -p packages/cli/src docs/reference/cli
SP=/Users/rakeshgangwar/SuperJackfruit/superpipeline
git -C $SP show f81f3f5:packages/cli/src/args.ts > packages/cli/src/args.ts
git -C $SP show f81f3f5:packages/cli/src/plane-login.ts > packages/cli/src/plane-login.ts
python3 - <<'PY'
import pathlib
a = pathlib.Path('packages/cli/src/args.ts'); s = a.read_text()
old = 'export const VALUELESS = new Set(["--json", "--help", "--check", "--clear-instructions", "--clear-completion", "--on", "--off"]);'
assert old in s; a.write_text(s.replace(old, 'export const VALUELESS = new Set(["--json", "--help", "--embed"]);'))
p = pathlib.Path('packages/cli/src/plane-login.ts'); s = p.read_text()
for x, y in [("export const SUPI_CLIENT_ID = 'supi';", "export const SULI_CLIENT_ID = 'suli';"), ('SUPI_CLIENT_ID', 'SULI_CLIENT_ID'), ('`supi login`', '`suli login`'), ('Run supi login again', 'Run suli login again')]:
    s = s.replace(x, y)
assert 'supi' not in s.lower().replace('superpipeline', ''), 'a supi reference is left'
p.write_text(s)
PY
```

`packages/cli/package.json`:

```json
{
  "name": "@superlibrary/cli",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "bin": { "suli": "./src/index.ts", "superlibrary": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "reference": "UPDATE_REFERENCE=1 vitest run src/reference.test.ts",
    "build": "bun build --compile src/index.ts --outfile dist/suli"
  },
  "dependencies": { "@superlibrary/contract": "workspace:*" },
  "devDependencies": { "@types/node": "^22.20.2" }
}
```

`packages/cli/tsconfig.json`: `{ "extends": "../../tsconfig.base.json", "compilerOptions": { "types": ["node"], "allowImportingTsExtensions": true }, "include": ["src"] }`

`packages/cli/vitest.config.ts`: `import { defineConfig } from 'vitest/config'; export default defineConfig({ test: { environment: 'node' } });`

- [ ] **Step 2: Write the failing tests**

`packages/cli/src/reference.test.ts` — Superpipeline's drift guard (`packages/cli/src/reference.test.ts` at f81f3f5), pointed at this repo:

```ts
/**
 * The command table, held to the switch it describes and to the pages generated from it
 * (Superpipeline's packages/cli/src/reference.test.ts): a verb or flag the switch handles with no
 * entry, an entry the switch never reads, or committed pages that differ from what renders today.
 * Regenerate: `pnpm -F @superlibrary/cli reference`.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { COMMANDS, ENV_VARS, GLOBAL_FLAGS, findCommands, renderCommandHelp, renderUsage } from './commands.ts';
import { REFERENCE_DIR, renderReference } from './reference.ts';
import { VALUELESS } from './args.ts';

const SRC = import.meta.dirname;
const REPO = join(SRC, '..', '..', '..');
const source = readFileSync(join(SRC, 'index.ts'), 'utf8');

function arms(): Array<{ verbs: string[]; subs: Set<string>; flags: Set<string> }> {
  const start = source.indexOf('  switch (cmd) {');
  const end = source.indexOf('    default:', start);
  expect(start, "main's switch was not found").toBeGreaterThan(0);
  const body = source.slice(start, end);
  const runs = [...body.matchAll(/((?:^ {4}case [^\n]+:[^\n]*\n)+)/gm)];
  return runs.map((m, i) => {
    const text = body.slice(m.index! + m[0].length, i + 1 < runs.length ? runs[i + 1]!.index : body.length);
    return {
      verbs: [...m[1]!.matchAll(/case "([^"]+)":/g)].map((x) => x[1]!),
      subs: new Set([...text.matchAll(/\bsub [!=]== "([a-z-]+)"/g)].map((x) => x[1]!)),
      flags: new Set([...text.matchAll(/(?:\bflags?\(rest, |rest\.includes\()"(--[a-z-]+)"/g)].map((x) => x[1]!)),
    };
  });
}
const HELP_ALIASES = new Set(['-h', '--help']);

describe('the command table matches the switch', () => {
  it('parses the switch at all — a guard on the guard', () => {
    const verbs = arms().flatMap((a) => a.verbs);
    expect(verbs).toContain('upload');
    expect(arms().find((a) => a.verbs.includes('upload'))!.flags).toContain('--override');
  });
  it('has an entry for every verb the switch dispatches, and no other', () => {
    const dispatched = new Set<string>();
    for (const arm of arms()) for (const verb of arm.verbs) {
      if (HELP_ALIASES.has(verb)) continue;
      if (arm.subs.size === 0) dispatched.add(verb);
      for (const sub of arm.subs) dispatched.add(`${verb} ${sub}`);
    }
    const documented = new Set(COMMANDS.map((c) => c.path.join(' ')));
    expect([...dispatched].filter((v) => !documented.has(v))).toEqual([]);
    expect([...documented].filter((v) => !dispatched.has(v))).toEqual([]);
  });
  it('documents exactly the flags each verb reads', () => {
    const global = new Set(GLOBAL_FLAGS.map((f) => f.name));
    for (const arm of arms()) for (const verb of arm.verbs) {
      if (HELP_ALIASES.has(verb)) continue;
      const read = [...arm.flags].filter((f) => !global.has(f)).sort();
      const documented = [...new Set(COMMANDS.filter((c) => c.path[0] === verb).flatMap((c) => c.flags.map((f) => f.name)))].sort();
      expect(documented, `suli ${verb}`).toEqual(read);
    }
  });
  it('treats every boolean flag as valueless, and nothing else', () => {
    const booleans = new Set([...GLOBAL_FLAGS, ...COMMANDS.flatMap((c) => c.flags)].filter((f) => f.type === 'boolean').map((f) => f.name));
    expect([...VALUELESS].sort()).toEqual([...booleans].sort());
  });
  it('renders help for every command, reachable by its own words', () => {
    for (const c of COMMANDS) {
      expect(c.examples.every((e) => e.startsWith('suli '))).toBe(true);
      expect(findCommands(c.path)).toContain(c);
      expect(renderCommandHelp(c)).toContain(`suli ${c.path.join(' ')}`);
      expect(renderUsage()).toContain(`suli ${c.path.join(' ')}`);
    }
  });
  it('documents every environment variable it reads, and only those', () => {
    const names = new Set<string>();
    for (const f of readdirSync(SRC).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))) {
      const text = readFileSync(join(SRC, f), 'utf8');
      for (const m of text.matchAll(/export const ENV_[A-Z_]+ = "([A-Z_]+)"/g)) names.add(m[1]!);
      for (const m of text.matchAll(/process\.env\.([A-Z_]+)/g)) names.add(m[1]!);
    }
    expect(ENV_VARS.map((e) => e.name).sort()).toEqual([...names].sort());
  });
});

describe('the published reference', () => {
  const pages = renderReference();
  const dir = join(REPO, REFERENCE_DIR);
  if (process.env.UPDATE_REFERENCE === '1') {
    rmSync(dir, { recursive: true, force: true });
    for (const [rel, text] of pages) { mkdirSync(dirname(join(REPO, rel)), { recursive: true }); writeFileSync(join(REPO, rel), text); }
  }
  it('is committed exactly as the generator writes it', () => {
    for (const [rel, text] of pages) {
      expect(existsSync(join(REPO, rel)), `${rel} is missing — run pnpm -F @superlibrary/cli reference`).toBe(true);
      expect(readFileSync(join(REPO, rel), 'utf8'), `${rel} is stale — run pnpm -F @superlibrary/cli reference`).toBe(text);
    }
  });
  it('holds no page the generator does not write', () => {
    expect(readdirSync(dir).map((f) => `${REFERENCE_DIR}/${f}`).filter((f) => !pages.has(f))).toEqual([]);
  });
});
```

`packages/cli/src/credential.test.ts`:

```ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { configDir, tokenSource } from './credential.ts';

describe('configDir', () => {
  it('follows the platform rules supi uses', () => {
    expect(configDir('darwin')).toMatch(/Library\/Application Support\/superlibrary$/);
    expect(configDir('linux')).toMatch(/superlibrary$/);
  });
});

describe('tokenSource', () => {
  const dir = () => mkdtempSync(join(tmpdir(), 'suli-'));
  it('an environment token is used as supplied and never renewed', async () => {
    const exchange = vi.fn();
    const src = tokenSource({ env: { SUPERLIBRARY_TOKEN: 'env-token' }, dir: dir(), exchange, now: () => 0 });
    expect(src.kind).toBe('env');
    expect(await src.token()).toBe('env-token');
    expect(exchange).not.toHaveBeenCalled();
  });
  it('a device credential is exchanged, cached, and exchanged again when the cached token is under 30 s from expiry', async () => {
    let t = 0;
    let n = 0;
    const exchange = vi.fn(async () => ({ token: `tok${++n}`, expiresIn: 300 }));
    const d = dir();
    const src = tokenSource({ env: {}, dir: d, exchange, now: () => t, device: { credential: 'dev_00000000000000000000:' + 'a'.repeat(43), plane: 'https://accounts.test', audience: 'https://app.test' } });
    expect(src.kind).toBe('device');
    expect(await src.token()).toBe('tok1');
    t = 200_000;
    expect(await src.token()).toBe('tok1');
    t = 280_000;
    expect(await src.token()).toBe('tok2');
    expect(exchange).toHaveBeenCalledTimes(2);
  });
  it('with nothing, there is no token', async () => {
    expect(await tokenSource({ env: {}, dir: dir(), exchange: vi.fn(), now: () => 0 }).token()).toBeNull();
  });
});
```

`packages/cli/src/plane-login.test.ts`:

```ts
import { expect, it } from 'vitest';
import { SULI_CLIENT_ID, deviceLogin, discoverPlane } from './plane-login.ts';

it('discovers the plane from the API and signs in as the suli device client', async () => {
  const target = await discoverPlane('https://app.test', (async () => Response.json({ resource: 'https://app.test', authorization_servers: ['https://accounts.test'] })) as never);
  expect(target).toEqual({ plane: 'https://accounts.test', audience: 'https://app.test' });
  const bodies: unknown[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    if (url.endsWith('/device/code')) return Response.json({ device_code: 'd', user_code: 'ABCD-EFGH', verification_uri_complete: 'https://accounts.test/device?c=1', interval: 1 });
    return Response.json({ device_credential: 'dev_00000000000000000000:' + 'a'.repeat(43) });
  }) as never;
  const lines: string[] = [];
  await deviceLogin(target!, { print: (l) => lines.push(l), sleep: async () => {} }, fetchFn);
  expect(SULI_CLIENT_ID).toBe('suli');
  expect(bodies[0]).toEqual({ client_id: 'suli', scope: 'openid' });
  expect(lines[0]).toContain('ABCD-EFGH');
});
```

Run `pnpm install && pnpm --filter @superlibrary/cli test`. Expected: FAIL — `./commands.ts`, `./reference.ts`, `./credential.ts`, `./index.ts` missing.

- [ ] **Step 3: Implement the credential, the table, the reference and the entry point**

`packages/cli/src/credential.ts`:

```ts
/**
 * Where `suli` gets a person's token: $SUPERLIBRARY_TOKEN as supplied, else `suli login`'s cached
 * token while it has 30 s left, else its device credential exchanged at the plane recorded at login
 * (issuer contract §3.2). Files are written atomically, mode 0600 (supi's credential.ts).
 */
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { exchangeDevice, type PlaneTarget } from './plane-login.ts';

export const ENV_TOKEN = "SUPERLIBRARY_TOKEN";
export const ENV_BASE = "SUPERLIBRARY_URL";
export const DEFAULT_BASE = 'https://app.superlibrary.dev';

export function baseUrl(env: Record<string, string | undefined> = process.env): string {
  return (env[ENV_BASE] || DEFAULT_BASE).replace(/\/+$/, '');
}

export function configDir(platform: NodeJS.Platform = process.platform): string {
  if (platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'superlibrary');
  if (platform === 'win32') {
    if (!process.env.APPDATA) throw new Error('APPDATA is not set; cannot locate suli credentials.');
    return join(process.env.APPDATA, 'superlibrary');
  }
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'superlibrary');
}

export interface Device { credential: string; plane: string; audience: string }

function writePrivate(dir: string, name: string, value: unknown): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const staging = mkdtempSync(join(dir, '.suli-'));
  try {
    const tmp = join(staging, 'f.json');
    writeFileSync(tmp, JSON.stringify(value), { mode: 0o600 });
    renameSync(tmp, join(dir, name));
    chmodSync(join(dir, name), 0o600);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

const readJson = <T>(path: string): T | null => { try { return JSON.parse(readFileSync(path, 'utf8')) as T; } catch { return null; } };

export function saveDevice(d: Device, dir = configDir()): void {
  writePrivate(dir, 'device.json', d);
  rmSync(join(dir, 'token.json'), { force: true });
}
export function loadDevice(dir = configDir()): Device | null { return readJson<Device>(join(dir, 'device.json')); }
export function clearCredentials(dir = configDir()): void {
  rmSync(join(dir, 'device.json'), { force: true });
  rmSync(join(dir, 'token.json'), { force: true });
}

export interface TokenDeps {
  env?: Record<string, string | undefined>;
  dir?: string;
  device?: Device | null;
  now?: () => number;
  exchange?: (t: PlaneTarget, credential: string) => Promise<{ token: string; expiresIn: number }>;
}

export function tokenSource(deps: TokenDeps = {}): { kind: 'env' | 'device' | 'none'; token(): Promise<string | null> } {
  const env = deps.env ?? process.env;
  const fixed = env[ENV_TOKEN];
  if (fixed) return { kind: 'env', token: async () => fixed };
  const dir = deps.dir ?? configDir();
  const device = deps.device === undefined ? loadDevice(dir) : deps.device;
  if (!device) return { kind: 'none', token: async () => null };
  const now = deps.now ?? Date.now;
  const exchange = deps.exchange ?? ((t, c) => exchangeDevice(t, c));
  return {
    kind: 'device',
    async token() {
      const cached = readJson<{ token: string; expiresAt: number }>(join(dir, 'token.json'));
      if (cached && cached.expiresAt - now() > 30_000) return cached.token;
      const { token, expiresIn } = await exchange({ plane: device.plane, audience: device.audience }, device.credential);
      writePrivate(dir, 'token.json', { token, expiresAt: now() + expiresIn * 1000 });
      return token;
    },
  };
}
```

`packages/cli/src/commands.ts`:

```ts
/**
 * Every command `suli` has, stated once (Superpipeline's packages/cli/src/commands.ts pattern): the
 * help, the published reference under docs/reference/cli/, and reference.test.ts all read this.
 * The access column is a claim about the SERVER; suli checks no permission itself.
 */
export type FlagType = 'boolean' | 'string' | 'integer' | 'date' | 'path';
export interface FlagSpec { name: string; value?: string; type: FlagType; required?: boolean; default?: string; description: string }
export interface ArgSpec { name: string; description: string; optional?: boolean }
export interface Access { person: 'member' | 'uploader-or-owner' | null; agent: 'refused' | null; note?: string }
export interface Route { method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; path: string }
export type GroupId = 'session' | 'artifacts';
export interface CommandSpec { path: string[]; group: GroupId; args: ArgSpec[]; flags: FlagSpec[]; summary: string; description: string; routes: Route[]; access: Access; output: string; fails: string[]; examples: string[] }
export interface GroupSpec { id: GroupId; title: string; label: string; description: string; intro: string }

export const GROUPS: GroupSpec[] = [
  { id: 'session', title: 'Signing in', label: 'Session', description: 'suli login, logout, whoami, help and version.', intro: 'Signing in through your Super Jackfruit Labs account, and seeing which identity is in force. `help`, `version` and `logout` send no credential anywhere.' },
  { id: 'artifacts', title: 'Artifacts', label: 'Artifacts', description: 'suli upload, get and revoke.', intro: 'Uploading files and folders, reading what is there, and revoking. Every upload passes the path rules, size caps and secret scan before anything is stored.' },
];

const LOCAL: Access = { person: null, agent: null };
const PERSON: Access = { person: 'member', agent: 'refused', note: 'Agents reach Superlibrary from a later release; an agent token is refused today.' };

export const GLOBAL_FLAGS: FlagSpec[] = [
  { name: '--json', type: 'boolean', description: 'Print machine-stable JSON instead of text' },
  { name: '--help', type: 'boolean', description: 'Print this command’s help' },
];

export const COMMANDS: CommandSpec[] = [
  { path: ['help'], group: 'session', args: [{ name: 'verb', description: 'A command to explain', optional: true }], flags: [], summary: 'Every command, or one in full', description: 'Prints the command summary, or one command in full. Sends nothing.', routes: [], access: LOCAL, output: 'help text', fails: ['the verb is unknown'], examples: ['suli help upload'] },
  { path: ['version'], group: 'session', args: [], flags: [], summary: 'The version of suli', description: 'Prints the version, platform and architecture. Sends nothing.', routes: [], access: LOCAL, output: 'one line', fails: [], examples: ['suli version'] },
  { path: ['login'], group: 'session', args: [], flags: [], summary: 'Sign in from this terminal', description: 'Finds the sign-in service from the server (`/.well-known/oauth-protected-resource`) and runs its device flow: open the printed link, confirm the code, and suli keeps a device credential of its own. Every command after that exchanges it for a token that lives five minutes, without a browser.', routes: [{ method: 'GET', path: '/.well-known/oauth-protected-resource' }], access: { person: null, agent: null, note: 'Talks to the sign-in service; sends no credential to Superlibrary.' }, output: 'the link and code, then "Signed in."', fails: ['the server names no sign-in service', 'the code expires or is declined'], examples: ['suli login'] },
  { path: ['logout'], group: 'session', args: [], flags: [], summary: 'Forget this terminal’s credential', description: 'Deletes suli’s device credential and cached token. Sends nothing.', routes: [], access: LOCAL, output: '"Signed out."', fails: [], examples: ['suli logout'] },
  { path: ['whoami'], group: 'session', args: [], flags: [], summary: 'Who you are signed in as', description: 'Shows the person, workspace and role the server sees for your credential.', routes: [{ method: 'GET', path: '/api/v1/me' }], access: PERSON, output: 'principal, workspace and role', fails: [], examples: ['suli whoami'] },
  {
    path: ['upload'], group: 'artifacts', args: [{ name: 'path', description: 'A file or a folder' }],
    flags: [
      { name: '--title', value: '<text>', type: 'string', default: 'the file or folder name', description: 'What the item is called' },
      { name: '--item', value: '<itm_…>', type: 'string', description: 'Upload as a new version of this item' },
      { name: '--board', value: '<brd_…>', type: 'string', description: 'Scope it to a board (visible only to you until board access arrives)' },
      { name: '--entry', value: '<path>', type: 'string', default: 'index.html, then README.md, then the first file', description: 'The file a folder opens on' },
      { name: '--expires', value: '<YYYY-MM-DD>', type: 'date', description: 'Delete it on this date' },
      { name: '--override', value: '<reason>', type: 'string', description: 'Upload despite a secret-scan finding; your reason is recorded' },
    ],
    summary: 'Upload a file or a folder',
    description: 'Checks every path against the rules (no `..`, no paths outside the folder, nothing on the denylist such as `.env*`, `.ssh/`, keys and credential files), checks the sizes (25 MB a file; 100 MB and 500 files a folder), then sends each file and commits. A secret found by the scan refuses the upload, naming the file and line; `--override` uploads it anyway and records your reason.',
    routes: [{ method: 'POST', path: '/api/v1/uploads' }, { method: 'PUT', path: '/api/v1/uploads/:id/files' }, { method: 'POST', path: '/api/v1/uploads/:id/override' }, { method: 'POST', path: '/api/v1/uploads/:id/commit' }],
    access: PERSON, output: 'the item URL (and with --json the item id, version, SHA-256, type and size)',
    fails: ['a path is refused or a size is over its cap', 'the secret scan finds something and --override is not given', 'a symbolic link points outside the folder'],
    examples: ['suli upload report.md', 'suli upload ./site --title "Launch page" --entry index.html', 'suli upload notes.md --item itm_0123456789abcdef'],
  },
  {
    path: ['get'], group: 'artifacts', args: [{ name: 'item', description: 'The item id (itm_…)' }],
    flags: [{ name: '--embed', type: 'boolean', description: 'Also mint a 5-minute signed viewer URL' }, { name: '--version', value: '<n>', type: 'integer', description: 'The version for --embed' }],
    summary: 'Show an item and its versions', description: 'Shows the item, its provenance and its versions. With `--embed`, also mints a signed viewer URL for one version, which works for five minutes (and is recorded as a view).',
    routes: [{ method: 'GET', path: '/api/v1/items/:id' }, { method: 'POST', path: '/api/v1/items/:id/embed' }],
    access: PERSON, output: 'the item and its versions', fails: ['the item does not exist or you cannot see it (404)', 'it is revoked or expired (410)'], examples: ['suli get itm_0123456789abcdef', 'suli get itm_0123456789abcdef --embed --version 2'],
  },
  {
    path: ['revoke'], group: 'artifacts', args: [{ name: 'item', description: 'The item id (itm_…)' }],
    flags: [{ name: '--version', value: '<n>', type: 'integer', description: 'Revoke only this version' }, { name: '--reason', value: '<text>', type: 'string', description: 'Why; recorded' }],
    summary: 'Revoke an item or one version', description: 'Revokes at once: a viewer URL already handed out stops working immediately. Only the uploader or an owner of the workspace may.',
    routes: [{ method: 'POST', path: '/api/v1/items/:id/revoke' }, { method: 'POST', path: '/api/v1/items/:id/versions/:n/revoke' }],
    access: { ...PERSON, person: 'uploader-or-owner' }, output: '"Revoked."', fails: ['you are not the uploader or an owner (403)'], examples: ['suli revoke itm_0123456789abcdef --reason "posted by mistake"', 'suli revoke itm_0123456789abcdef --version 2'],
  },
];

export const ENV_VARS: Array<{ name: string; description: string }> = [
  { name: 'SUPERLIBRARY_TOKEN', description: 'a person’s token, used exactly as supplied and never renewed' },
  { name: 'SUPERLIBRARY_URL', description: 'the server (default https://app.superlibrary.dev)' },
  { name: 'XDG_CONFIG_HOME', description: 'Linux: the config directory credentials live under' },
  { name: 'APPDATA', description: 'Windows: the config directory credentials live under' },
];

export const commandName = (c: CommandSpec) => `suli ${c.path.join(' ')}`;

export function synopsis(c: CommandSpec): string {
  const args = c.args.map((a) => (a.optional ? `[<${a.name}>]` : `<${a.name}>`));
  const flags = c.flags.map((f) => { const body = f.value ? `${f.name} ${f.value}` : f.name; return f.required ? body : `[${body}]`; });
  return [commandName(c), ...args, ...flags].join(' ');
}

export function findCommands(words: string[]): CommandSpec[] {
  return COMMANDS.filter((c) => c.path[0] === words[0]);
}

const plain = (s: string) => s.replace(/`/g, '');
const ACCESS_TEXT = { member: 'a member of the workspace', 'uploader-or-owner': 'the person who uploaded it, or an owner of the workspace' } as const;

export function accessLines(a: Access): string[] {
  if (a.person === null && a.agent === null) return [a.note ?? 'Local: sends no credential to Superlibrary.'];
  const out: string[] = [];
  if (a.person) out.push(`A person: ${ACCESS_TEXT[a.person]}.`);
  if (a.agent === 'refused') out.push('An agent token: refused.');
  if (a.note) out.push(a.note);
  return out;
}

export function renderUsage(): string {
  const lines = ['suli — Superlibrary from a terminal', ''];
  for (const g of GROUPS) {
    lines.push(`${g.title}:`);
    for (const c of COMMANDS.filter((x) => x.group === g.id)) lines.push(`  ${commandName(c).padEnd(16)} ${plain(c.summary)}`);
    lines.push('');
  }
  lines.push('  --json              machine-stable output, on any command', '  suli help <verb>    one command in full (or: suli <verb> --help)', '', `Credential, first found wins: $SUPERLIBRARY_TOKEN, then suli login's cached token, then its device credential.`, 'Exit status: 0 on success, 1 otherwise.');
  return lines.join('\n');
}

export function renderCommandHelp(c: CommandSpec): string {
  const lines = [plain(synopsis(c)), '', plain(c.description), ''];
  if (c.args.length) { lines.push('Arguments:'); for (const a of c.args) lines.push(`  <${a.name}>`.padEnd(20) + plain(a.description)); lines.push(''); }
  if (c.flags.length) { lines.push('Flags:'); for (const f of c.flags) lines.push(`  ${f.value ? `${f.name} ${f.value}` : f.name}`.padEnd(30) + plain(f.description) + (f.default ? `. Default: ${plain(f.default)}.` : '')); lines.push(''); }
  lines.push('Who may run it:', ...accessLines(c.access).map((l) => `  ${plain(l)}`), '', 'Examples:', ...c.examples.map((e) => `  ${e}`));
  return lines.join('\n');
}
```

`packages/cli/src/reference.ts`:

```ts
/** The published `suli` reference, generated from commands.ts; reference.test.ts fails when it is stale. */
import { COMMANDS, ENV_VARS, GLOBAL_FLAGS, GROUPS, accessLines, commandName, synopsis, type CommandSpec, type FlagSpec } from './commands.ts';

export const REFERENCE_DIR = 'docs/reference/cli';
const GENERATED = '<!-- Generated from packages/cli/src/commands.ts by `pnpm -F @superlibrary/cli reference`. Do not edit by hand: CI fails when this file differs from what the generator writes. -->';
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n+/g, ' ');

function flagTable(flags: FlagSpec[]): string[] {
  return ['| flag | type | default | meaning |', '|---|---|---|---|', ...flags.map((f) => `| \`${cell(f.value ? `${f.name} ${f.value}` : f.name)}\` | ${f.type} | ${cell(f.required ? '**required**' : f.default ?? '—')} | ${cell(f.description)} |`)];
}

function renderCommand(c: CommandSpec): string[] {
  const out = [`## \`${commandName(c)}\``, '', c.description, '', '```sh', synopsis(c), '```', ''];
  if (c.args.length) { out.push('| argument | meaning |', '|---|---|', ...c.args.map((a) => `| \`<${a.name}>\` | ${cell(a.description)}${a.optional ? ' (optional)' : ''} |`), ''); }
  if (c.flags.length) out.push(...flagTable(c.flags), '');
  out.push('**Who may run it**', '', ...accessLines(c.access).map((l) => `- ${l}`), '');
  if (c.routes.length) out.push(`**Calls** ${c.routes.map((r) => `\`${r.method} ${r.path}\``).join(', ')}`, '');
  out.push(`**Prints** ${c.output}.`, '', '**Exit status** `0` on success. `1` when:', '');
  const fails = [...c.fails];
  if (c.routes.some((r) => r.path.startsWith('/api/'))) fails.push('there is no usable credential, or the server refuses it (401) or the act (403), or answers any other error');
  if (fails.length === 0) fails.push('it cannot write its output (never in normal use)');
  out.push(...fails.map((f) => `- ${f}`), '', '**Example**', '', '```sh', ...c.examples, '```', '');
  return out;
}

export function renderReference(): Map<string, string> {
  const pages = new Map<string, string>();
  const index = ['# suli command reference', '', GENERATED, '', '`suli` is Superlibrary from a terminal; `superlibrary` is the same program under its full name.', '', '```sh', 'suli <verb> [<arguments>] [--flags] [--json]', 'suli help <verb>', '```', ''];
  for (const g of GROUPS) {
    index.push(`## ${g.title}`, '', '| command | what it does |', '|---|---|', ...COMMANDS.filter((c) => c.group === g.id).map((c) => `| [\`${commandName(c)}\`](${g.id}.md#${commandName(c).replace(/ /g, '-')}) | ${cell(c.summary)} |`), '');
  }
  index.push('## Flags every command takes', '', ...flagTable(GLOBAL_FLAGS), '', '## Environment', '', '| variable | meaning |', '|---|---|', ...ENV_VARS.map((e) => `| \`${e.name}\` | ${cell(e.description)} |`), '');
  pages.set(`${REFERENCE_DIR}/index.md`, index.join('\n').replace(/\n+$/, '\n'));
  for (const g of GROUPS) {
    const lines = [`# ${g.title}`, '', GENERATED, '', g.intro, ''];
    for (const c of COMMANDS.filter((x) => x.group === g.id)) lines.push(...renderCommand(c));
    pages.set(`${REFERENCE_DIR}/${g.id}.md`, lines.join('\n').replace(/\n+$/, '\n'));
  }
  return pages;
}
```

`packages/cli/src/index.ts` (the session verbs now; Task 20 fills the artifact arms):

```ts
#!/usr/bin/env bun
/** `suli` — Superlibrary from a terminal. A client: it adds no authority and renders the server's refusals. */
import { baseUrl, clearCredentials, saveDevice, tokenSource } from './credential.ts';
import { deviceLogin, discoverPlane } from './plane-login.ts';
import { findCommands, renderCommandHelp, renderUsage } from './commands.ts';
import { flag, positionals } from './args.ts';
import { getItem, revoke, upload } from './artifacts.ts';

const VERSION = '0.0.1';

function fail(message: string): never {
  process.stderr.write(`suli: ${message}\n`);
  process.exit(1);
}

async function main(argv: string[]): Promise<void> {
  const [cmd, ...rest] = argv;
  const pos = positionals(rest);
  const json = rest.includes("--json");
  if (rest.includes("--help") && cmd) { process.stdout.write(findCommands([cmd]).map(renderCommandHelp).join('\n\n') + '\n'); return; }
  switch (cmd) {
    case undefined:
    case "-h":
    case "--help":
      process.stdout.write(renderUsage() + '\n');
      return;

    case "help": {
      const found = pos.length ? findCommands(pos) : [];
      if (pos.length && found.length === 0) fail(`unknown command: ${pos.join(' ')}`);
      process.stdout.write((pos.length ? found.map(renderCommandHelp).join('\n\n') : renderUsage()) + '\n');
      return;
    }

    case "version":
      process.stdout.write(`suli ${VERSION} ${process.platform}/${process.arch}\n`);
      return;

    case "login": {
      const target = await discoverPlane(baseUrl()).catch(() => null);
      if (!target) fail(`${baseUrl()} names no sign-in service.`);
      const credential = await deviceLogin(target, { print: (l) => process.stdout.write(l + '\n'), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) });
      saveDevice({ credential, plane: target.plane, audience: target.audience });
      process.stdout.write('Signed in.\n');
      return;
    }

    case "logout":
      clearCredentials();
      process.stdout.write('Signed out.\n');
      return;

    case "whoami": {
      const token = await tokenSource().token();
      if (!token) fail('not signed in. Run suli login.');
      const res = await fetch(`${baseUrl()}/api/v1/me`, { headers: { Authorization: `Bearer ${token}` }, redirect: 'error' });
      if (!res.ok) fail(`the server refused (${res.status}): ${await res.text()}`);
      const me = (await res.json()) as { principalId: string; org: string; role: string };
      process.stdout.write(json ? JSON.stringify(me) + '\n' : `${me.principalId} in ${me.org} (${me.role})\n`);
      return;
    }

    case "upload":
      return upload(pos[0], { title: flag(rest, "--title"), item: flag(rest, "--item"), board: flag(rest, "--board"), entry: flag(rest, "--entry"), expires: flag(rest, "--expires"), override: flag(rest, "--override"), json });

    case "get":
      return getItem(pos[0], { embed: rest.includes("--embed"), version: flag(rest, "--version"), json });

    case "revoke":
      return revoke(pos[0], { version: flag(rest, "--version"), reason: flag(rest, "--reason"), json });

    default:
      fail(`unknown command: ${cmd}. Run suli help.`);
  }
}

await main(process.argv.slice(2)).catch((e: unknown) => fail(e instanceof Error ? e.message : String(e)));
```

`packages/cli/src/artifacts.ts` is created in Task 20; for this task create it with three stubs so the entry point compiles:

```ts
export async function upload(_path: string | undefined, _o: Record<string, unknown>): Promise<void> { throw new Error('upload arrives in Task 20'); }
export async function getItem(_id: string | undefined, _o: Record<string, unknown>): Promise<void> { throw new Error('get arrives in Task 20'); }
export async function revoke(_id: string | undefined, _o: Record<string, unknown>): Promise<void> { throw new Error('revoke arrives in Task 20'); }
```

Generate the reference and run the tests:

```bash
pnpm -F @superlibrary/cli reference && pnpm --filter @superlibrary/cli test && pnpm --filter @superlibrary/cli typecheck
```

Expected: PASS; `docs/reference/cli/{index,session,artifacts}.md` written. Revert-proof the drift guard: add `case "scope":` with `return;` to the switch; "has an entry for every verb" fails; remove it.

- [ ] **Step 4: Put bun in CI's test job**

In `.github/workflows/ci.yml`'s `test` job, after `actions/setup-node`, add (Superpipeline's reason: the CLI runs under bun):

```yaml
      - uses: oven-sh/setup-bun@v2
```

- [ ] **Step 5: Commit**

```bash
git add packages/cli docs/reference .github/workflows/ci.yml pnpm-lock.yaml
git commit -m "feat(cli): suli — command table, generated reference with drift guard, device sign-in

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---

### Task 20: `suli upload`, `get` and `revoke`

**Files:**
- Replace: `packages/cli/src/artifacts.ts`
- Test: `packages/cli/src/artifacts.test.ts`

**Interfaces:**
- Consumes: `tokenSource`, `baseUrl`, `checkPath`, `LIMITS`, `type CommitResult`, `type EmbedGrant`; the upload protocol (Tasks 7-8), the read and revoke routes (Tasks 9-10).
- Produces: `walk(root: string): LocalFile[]` (refuses a symlink that leaves the root), `type Client = (method: string, path: string, body?: unknown) => Promise<Response>`, `makeClient(base: string, token: () => Promise<string | null>, fetchImpl?): Client` (asks for a token on every request), `uploadWith(client, root: string, o): Promise<CommitResult>`, and the three verbs `upload`, `getItem`, `revoke` used by `index.ts`.

- [ ] **Step 1: Write the failing test**

`packages/cli/src/artifacts.test.ts`:

```ts
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { makeClient, uploadWith, walk } from './artifacts.ts';
import { tokenSource } from './credential.ts';

const tmp = () => mkdtempSync(join(tmpdir(), 'suli-up-'));

describe('walk', () => {
  it('reads a folder as relative paths; a single file as its name', () => {
    const d = tmp();
    mkdirSync(join(d, 'img'));
    writeFileSync(join(d, 'index.html'), '<!doctype html>');
    writeFileSync(join(d, 'img', 'a b.png'), 'x');
    expect(walk(d).map((f) => f.path).sort()).toEqual(['img/a b.png', 'index.html']);
    expect(walk(join(d, 'index.html')).map((f) => f.path)).toEqual(['index.html']);
  });
  it('follows a symlink inside the folder and refuses one that leaves it (spec §8)', () => {
    const d = tmp();
    writeFileSync(join(d, 'real.md'), '# r');
    symlinkSync(join(d, 'real.md'), join(d, 'alias.md'));
    expect(walk(d).map((f) => f.path).sort()).toEqual(['alias.md', 'real.md']);
    symlinkSync('/etc/hosts', join(d, 'escape'));
    expect(() => walk(d)).toThrow('escape points outside the folder; it is not uploaded.');
  });
  it('refuses a denylisted path before sending anything', () => {
    const d = tmp();
    writeFileSync(join(d, '.env'), 'A=1');
    expect(() => walk(d)).toThrow('.env is not uploaded: it matches the .env* rule.');
  });
});

describe('uploadWith', () => {
  const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  it('re-exchanges the device credential when the cached token expires mid-upload', async () => {
    let clock = 0;
    let n = 0;
    const exchange = vi.fn(async () => ({ token: `tok${++n}`, expiresIn: 300 }));
    const src = tokenSource({ env: {}, dir: tmp(), exchange, now: () => clock, device: { credential: 'dev_00000000000000000000:' + 'a'.repeat(43), plane: 'https://accounts.test', audience: 'https://app.test' } });
    const auth: string[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      auth.push(new Headers(init.headers).get('authorization')!);
      clock += 200_000; // each file takes 200 s on this link
      if (url.endsWith('/api/v1/uploads')) return ok({ uploadId: 'upl_0000000000000001' }, 201);
      if (url.includes('/files?')) return ok({ findings: [] });
      return ok({ itemId: 'itm_0000000000000001', version: 1, url: 'https://app.test/a/itm_0000000000000001', sha256: 'x', mediaType: 'text/plain', bytes: 2 }, 201);
    }) as never;
    const d = tmp();
    writeFileSync(join(d, 'a.txt'), 'a');
    writeFileSync(join(d, 'b.txt'), 'b');
    const result = await uploadWith(makeClient('https://app.test', () => src.token(), fetchImpl), d, { title: 'T' });
    expect(result.itemId).toBe('itm_0000000000000001');
    expect(auth).toEqual(['Bearer tok1', 'Bearer tok1', 'Bearer tok2', 'Bearer tok2']);
  });

  it('a secret finding stops the upload with file and line, unless --override is given', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push(`${init.method} ${new URL(url).pathname}`);
      if (url.endsWith('/api/v1/uploads')) return ok({ uploadId: 'upl_0000000000000002' }, 201);
      if (url.includes('/files?')) return ok({ findings: [{ line: 3, rule: 'github-token' }] });
      if (url.endsWith('/override')) return ok({ overridden: true });
      return calls.includes('POST /api/v1/uploads/upl_0000000000000002/override')
        ? ok({ itemId: 'itm_0000000000000002', version: 1 }, 201)
        : ok({ error: 'secret_found', findings: [{ path: 'c.ts', line: 3, rule: 'github-token' }] }, 422);
    }) as never;
    const d = tmp();
    writeFileSync(join(d, 'c.ts'), 'x');
    const client = makeClient('https://app.test', async () => 't', fetchImpl);
    await expect(uploadWith(client, d, { title: 'T' })).rejects.toThrow('c.ts line 3: github-token');
    await expect(uploadWith(client, d, { title: 'T', override: 'rotated already' })).resolves.toMatchObject({ itemId: 'itm_0000000000000002' });
  });
});
```

Run `pnpm --filter @superlibrary/cli test src/artifacts.test.ts`. Expected: FAIL — `walk`, `makeClient`, `uploadWith` are not exported.

- [ ] **Step 2: Implement**

`packages/cli/src/artifacts.ts`:

```ts
import { lstatSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { LIMITS, checkPath, type CommitResult, type EmbedGrant } from '@superlibrary/contract';
import { baseUrl, tokenSource } from './credential.ts';

export interface LocalFile { path: string; bytes: Uint8Array }
export type Client = (method: string, path: string, body?: unknown) => Promise<Response>;

const REASONS: Record<string, string> = { parent: 'it leaves the folder', absolute: 'it is an absolute path', backslash: 'it contains a backslash', empty: 'it has no name', control_character: 'it contains a control character', too_long: 'its path is too long' };

/** A file or a folder as upload paths. Symlinks are followed only while they stay inside (spec §8). */
export function walk(root: string): LocalFile[] {
  const rootReal = realpathSync(root);
  if (statSync(rootReal).isFile()) return [{ path: basename(root), bytes: readFileSync(rootReal) }];
  const out: LocalFile[] = [];
  const visit = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      const rel = relative(root, full).split(sep).join('/');
      let target = full;
      if (lstatSync(full).isSymbolicLink()) {
        target = realpathSync(full);
        if (target !== rootReal && !target.startsWith(rootReal + sep)) throw new Error(`${rel} points outside the folder; it is not uploaded.`);
      }
      const c = checkPath(rel);
      if (!c.ok) throw new Error(`${rel} is not uploaded: ${c.reason === 'denied' ? `it matches the ${c.rule} rule` : REASONS[c.reason]}.`);
      if (statSync(target).isDirectory()) visit(full);
      else out.push({ path: c.path, bytes: readFileSync(target) });
    }
  };
  visit(root);
  if (out.length > LIMITS.folderFiles) throw new Error(`a folder may have at most ${LIMITS.folderFiles} files; this has ${out.length}.`);
  const big = out.find((f) => f.bytes.length > LIMITS.fileBytes);
  if (big) throw new Error(`${big.path} is larger than 25 MB, the limit for one file.`);
  if (out.reduce((n, f) => n + f.bytes.length, 0) > LIMITS.folderBytes) throw new Error('together these are more than 100 MB, the limit for a folder.');
  return out;
}

/** A token per request, never one per upload: a long upload outlives a five-minute token. */
export function makeClient(base: string, token: () => Promise<string | null>, fetchImpl: typeof fetch = fetch): Client {
  return async (method, path, body) => {
    const t = await token();
    if (!t) throw new Error('not signed in. Run suli login.');
    const headers: Record<string, string> = { Authorization: `Bearer ${t}` };
    let payload: BodyInit | undefined;
    if (body instanceof Uint8Array) payload = body;
    else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetchImpl(`${base}${path}`, { method, headers, body: payload, redirect: 'error' });
    if (res.status === 401) throw new Error('the server did not accept your sign-in. Run suli login.');
    return res;
  };
}

async function refused(res: Response, what: string): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as { error?: string; path?: string; reason?: string; rule?: string; org?: string };
  if (body.error === 'product_not_enabled') throw new Error(`Superlibrary is not enabled for workspace ${body.org}. An owner can enable it in the account settings.`);
  throw new Error(`${what} was refused (${res.status} ${body.error ?? ''}${body.path ? `: ${body.path}` : ''}${body.rule ? ` matches ${body.rule}` : ''}).`);
}

export async function uploadWith(client: Client, root: string, o: { title?: string; item?: string; board?: string; entry?: string; expires?: string; override?: string }): Promise<CommitResult> {
  const files = walk(root);
  const declared = files.map((f) => ({ path: f.path, bytes: f.bytes.length, sha256: createHash('sha256').update(f.bytes).digest('hex') }));
  const created = await client('POST', '/api/v1/uploads', {
    title: o.title ?? basename(root), files: declared,
    ...(o.item ? { item: o.item } : {}), ...(o.board ? { scope: `board:${o.board}` } : {}), ...(o.entry ? { entry: o.entry } : {}),
    ...(o.expires ? { expiresAt: new Date(`${o.expires}T00:00:00Z`).toISOString() } : {}),
  });
  if (created.status !== 201) return refused(created, 'the upload');
  const { uploadId } = (await created.json()) as { uploadId: string };
  for (const f of files) {
    const res = await client('PUT', `/api/v1/uploads/${uploadId}/files?path=${encodeURIComponent(f.path)}`, f.bytes);
    if (!res.ok) return refused(res, f.path);
  }
  let committed = await client('POST', `/api/v1/uploads/${uploadId}/commit`);
  if (committed.status === 422) {
    const { findings = [] } = (await committed.json()) as { findings?: { path: string; line: number; rule: string }[] };
    const where = findings.map((f) => `${f.path} line ${f.line}: ${f.rule}`).join('; ');
    if (!o.override) throw new Error(`this looks like it contains a secret, so nothing was stored — ${where}. Remove it, or pass --override "<why>" to upload anyway (recorded).`);
    const ov = await client('POST', `/api/v1/uploads/${uploadId}/override`, { reason: o.override });
    if (!ov.ok) return refused(ov, 'the override');
    committed = await client('POST', `/api/v1/uploads/${uploadId}/commit`);
  }
  if (!committed.ok) return refused(committed, 'the commit');
  return (await committed.json()) as CommitResult;
}

const client = () => makeClient(baseUrl(), () => tokenSource().token());

export async function upload(path: string | undefined, o: { title: string | null; item: string | null; board: string | null; entry: string | null; expires: string | null; override: string | null; json: boolean }): Promise<void> {
  if (!path) throw new Error('name a file or a folder: suli upload <path>');
  if (o.expires && !/^\d{4}-\d{2}-\d{2}$/.test(o.expires)) throw new Error('--expires takes a date, YYYY-MM-DD');
  const r = await uploadWith(client(), path, { title: o.title ?? undefined, item: o.item ?? undefined, board: o.board ?? undefined, entry: o.entry ?? undefined, expires: o.expires ?? undefined, override: o.override ?? undefined });
  process.stdout.write(o.json ? JSON.stringify(r) + '\n' : `${r.url} (v${r.version})\n`);
}

export async function getItem(id: string | undefined, o: { embed: boolean; version: string | null; json: boolean }): Promise<void> {
  if (!id) throw new Error('name an item: suli get <itm_…>');
  const c = client();
  const res = await c('GET', `/api/v1/items/${id}`);
  if (!res.ok) return refused(res, id);
  const body = (await res.json()) as { item: { title: string; scope: string; createdBy: string; createdAt: string }; versions: { version: number; fileCount: number; sha256: string; revokedAt: string | null }[] };
  let grant: EmbedGrant | null = null;
  if (o.embed) {
    const e = await c('POST', `/api/v1/items/${id}/embed`, o.version ? { version: Number(o.version) } : {});
    if (!e.ok) return refused(e, 'the viewer URL');
    grant = (await e.json()) as EmbedGrant;
  }
  if (o.json) { process.stdout.write(JSON.stringify({ ...body, ...(grant ? { embed: grant } : {}) }) + '\n'); return; }
  const lines = [`${body.item.title}  (${id})`, `scope ${body.item.scope} · uploaded by ${body.item.createdBy} · ${body.item.createdAt}`];
  for (const v of body.versions) lines.push(`  v${v.version}  ${v.fileCount} file(s)  ${v.sha256.slice(0, 12)}${v.revokedAt ? '  revoked' : ''}`);
  if (grant) lines.push(`viewer (until ${grant.expiresAt}): ${grant.url}`);
  process.stdout.write(lines.join('\n') + '\n');
}

export async function revoke(id: string | undefined, o: { version: string | null; reason: string | null; json: boolean }): Promise<void> {
  if (!id) throw new Error('name an item: suli revoke <itm_…>');
  const path = o.version ? `/api/v1/items/${id}/versions/${o.version}/revoke` : `/api/v1/items/${id}/revoke`;
  const res = await client()('POST', path, o.reason ? { reason: o.reason } : {});
  if (!res.ok) return refused(res, 'the revocation');
  process.stdout.write(o.json ? JSON.stringify(await res.json()) + '\n' : 'Revoked.\n');
}
```

- [ ] **Step 3: Run the tests to verify they pass, and try it against the dev stack**

```bash
pnpm --filter @superlibrary/cli test && pnpm --filter @superlibrary/cli typecheck
node scripts/dev-keys.mjs
(pnpm --filter @superlibrary/api exec wrangler d1 migrations apply superlibrary-catalog --local && pnpm --filter @superlibrary/api dev) &
sleep 20
echo '# from suli' > /tmp/suli-note.md
SUPERLIBRARY_URL=http://localhost:8787 SUPERLIBRARY_TOKEN=dev bun packages/cli/src/index.ts upload /tmp/suli-note.md || true
kill %1
```

Expected: tests PASS. The dev-stack call answers `the server did not accept your sign-in` — correct: dev auth takes headers, not a bearer, and `suli` never sends dev headers. The real end-to-end run of `suli` is Task 21 Step 6, against production. Revert-proof the per-request token: in `makeClient` cache the first token in a closure variable; the mid-upload case fails; restore.

- [ ] **Step 4: Commit and open PR 5**

```bash
git add packages/cli
git commit -m "feat(cli): suli upload, get and revoke, with a fresh token for every request

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

This ends PR 5 (`feat/phase-1-cli`, Tasks 19-20).

---

### Task 21: Deploy — Cloudflare resources, CI deploy jobs, keys, DNS, and a live check

**Files:**
- Create: `scripts/url-signing-key.mjs`
- Modify: `.github/workflows/ci.yml` (three deploy jobs), `apps/api/wrangler.jsonc` (`database_id`), `README.md` (status, how to run locally)

**Interfaces:**
- Consumes: everything above; the Accounts plan live (Task A3).
- Produces: `https://app.superlibrary.dev` (Pages + API routes) and `https://<itm-label>.superlibrarycontent.dev` live; `main` deploys on every merge, as Superpipeline's does.

**PR recipe (used at the end of every group above):**

```bash
git push -u origin HEAD
gh pr create --repo SuperJackfruitLabs/superlibrary --base main --title "<group title>" --body "$(cat <<'BODY'
<what this group delivers, which plan tasks, and what was revert-proofed>

Plan: docs/superpowers/plans/2026-10-09-superlibrary-phase-1-core.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8
BODY
)"
gh pr checks --watch
```

Then stop for the operator's merge; the next group branches from the merged `main`.

- [ ] **Step 1: The one browser step — an API token (plan D19)**

Ask the operator to create a Cloudflare API token on account `88acd85618f099112eadc9374996b9f7` with: Workers Scripts Edit, Workers Routes Edit (both zones), D1 Edit, Workers R2 Storage Edit, Queues Edit, Cloudflare Pages Edit, DNS Edit (zones `superlibrary.dev` and `superlibrarycontent.dev`). Then store it without it appearing in any file or transcript:

```bash
gh secret set CLOUDFLARE_API_TOKEN --repo SuperJackfruitLabs/superlibrary   # paste at the prompt
```

and, for the DNS calls below, read it once into the shell: `read -rs CF_TOKEN` (paste; nothing echoes).

- [ ] **Step 2: Create the resources**

```bash
cd /Users/rakeshgangwar/SuperJackfruit/superlibrary
export CLOUDFLARE_ACCOUNT_ID=88acd85618f099112eadc9374996b9f7
pnpm --filter @superlibrary/api exec wrangler d1 create superlibrary-catalog
pnpm --filter @superlibrary/api exec wrangler r2 bucket create superlibrary-blobs
pnpm --filter @superlibrary/api exec wrangler queues create superlibrary-retention
pnpm --filter @superlibrary/web exec wrangler pages project create superlibrary-web --production-branch main
```

Expected: each prints success; `d1 create` prints a `database_id`. Put that id in place of the all-zero one in `apps/api/wrangler.jsonc` and commit:

```bash
git checkout -b feat/phase-1-deploy origin/main
# edit apps/api/wrangler.jsonc: "database_id": "<the printed id>"
git add apps/api/wrangler.jsonc && git commit -m "chore(api): the production D1 id

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

- [ ] **Step 3: Add the deploy jobs**

Append to `.github/workflows/ci.yml` (Superpipeline's `deploy` and `deploy-docs` shapes):

```yaml
  # Continuous deploy, as Superpipeline: after test and e2e pass on main, migrate D1 and ship.
  deploy-api:
    needs: [test, e2e]
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    concurrency: { group: deploy-api, cancel-in-progress: false }
    environment: { name: production, url: https://app.superlibrary.dev/api/health }
    env:
      CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
      CLOUDFLARE_ACCOUNT_ID: 88acd85618f099112eadc9374996b9f7
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @superlibrary/api db:migrate
      - run: pnpm --filter @superlibrary/api run deploy

  deploy-content:
    needs: [test, e2e]
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    concurrency: { group: deploy-content, cancel-in-progress: false }
    environment: { name: content }
    env:
      CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
      CLOUDFLARE_ACCOUNT_ID: 88acd85618f099112eadc9374996b9f7
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @superlibrary/content run deploy

  # The SPA to Pages project superlibrary-web. wrangler runs from a neutral directory with an
  # absolute path: Superpipeline's deploy-docs found that project detection rewrites a checkout.
  deploy-web:
    needs: [test, e2e]
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    concurrency: { group: deploy-web, cancel-in-progress: false }
    environment: { name: web, url: https://app.superlibrary.dev }
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @superlibrary/web build
      - name: Deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: 88acd85618f099112eadc9374996b9f7
        run: |
          mkdir -p "$RUNNER_TEMP/wrangler-cwd"
          cd "$RUNNER_TEMP/wrangler-cwd"
          npx --yes wrangler@4 pages deploy "$GITHUB_WORKSPACE/apps/web/build" --project-name=superlibrary-web --branch=main
```

Commit, push, open the PR (recipe above), wait for the operator's merge. The merge deploys all three; the API answers `500 unexpected` to embeds (no signing key) and the content Worker answers `503 not_configured` until Step 4 sets the keys.

- [ ] **Step 4: Set the URL-signing keys (secrets only)**

`scripts/url-signing-key.mjs`:

```js
// Generates the production Ed25519 pair and hands each half straight to `wrangler secret put` on
// stdin. Neither half touches a file or the terminal (Global Constraints: secrets never in files).
import { spawnSync } from 'node:child_process';
const { privateKey, publicKey } = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
const put = (pkg, name, value) => {
  const r = spawnSync('pnpm', ['--filter', pkg, 'exec', 'wrangler', 'secret', 'put', name], { input: value, stdio: ['pipe', 'inherit', 'inherit'] });
  if (r.status !== 0) throw new Error(`wrangler secret put ${name} failed`);
};
put('@superlibrary/api', 'URL_SIGNING_PRIVATE_KEY', JSON.stringify(await crypto.subtle.exportKey('jwk', privateKey)));
put('@superlibrary/content', 'URL_SIGNING_PUBLIC_KEY', JSON.stringify(await crypto.subtle.exportKey('jwk', publicKey)));
console.log('both halves set; nothing written to disk');
```

The content Worker reads `URL_SIGNING_PUBLIC_KEY` as a secret, so it must not also be a `var`: confirm `apps/content/wrangler.jsonc` has no `URL_SIGNING_PUBLIC_KEY` under `vars` (Task 11 left it out; a var and a secret with one name fail the deploy). Then:

```bash
CLOUDFLARE_ACCOUNT_ID=88acd85618f099112eadc9374996b9f7 node scripts/url-signing-key.mjs
```

Expected: two `✨ Success! Uploaded secret …` lines and `both halves set; nothing written to disk`. Rotation is the same command; URLs minted before it stop verifying at once, which is at most five minutes of views.

- [ ] **Step 5: DNS and the Pages domain**

```bash
api() { curl -fsS -H "Authorization: Bearer $CF_TOKEN" -H 'content-type: application/json' "https://api.cloudflare.com/client/v4$@"; }
LIB_ZONE=$(api "/zones?name=superlibrary.dev" | jq -r '.result[0].id')
CONTENT_ZONE=$(api "/zones?name=superlibrarycontent.dev" | jq -r '.result[0].id')
# Every artifact subdomain reaches the content Worker's wildcard route. Proxied, so no origin is used.
api "/zones/$CONTENT_ZONE/dns_records" -X POST -d '{"type":"AAAA","name":"*","content":"100::","proxied":true,"comment":"superlibrary-content wildcard route"}' | jq '.success'
# The app on Pages; /api/* is then claimed by the Worker route on the same hostname (plan D1).
api "/accounts/88acd85618f099112eadc9374996b9f7/pages/projects/superlibrary-web/domains" -X POST -d '{"name":"app.superlibrary.dev"}' | jq '.success'
api "/zones/$LIB_ZONE/dns_records" -X POST -d '{"type":"CNAME","name":"app","content":"superlibrary-web.pages.dev","proxied":true}' | jq '.success'
```

Expected: `true` three times (a CNAME the Pages call already created answers `false` with "record already exists" — that is fine; check with `api "/zones/$LIB_ZONE/dns_records?name=app.superlibrary.dev" | jq '.result[0].content'` → `"superlibrary-web.pages.dev"`).

- [ ] **Step 6: Live check (memory: verify the outcome, not the trigger)**

```bash
curl -s https://app.superlibrary.dev/api/health
curl -s https://app.superlibrary.dev/.well-known/oauth-protected-resource | jq -c .
curl -s -o /dev/null -w '%{http_code} %header{x-frame-options}\n' https://app.superlibrary.dev/
curl -s -o /dev/null -w '%{http_code}\n' https://itm-0000000000000000.superlibrarycontent.dev/_view?sig=x
bun packages/cli/src/index.ts login            # the operator approves the printed code in the browser
echo "# Superlibrary live check $(date -u +%FT%TZ)" > /tmp/live.md
bun packages/cli/src/index.ts upload /tmp/live.md --json | tee /tmp/live.json
ITEM=$(jq -r .itemId /tmp/live.json)
URL=$(bun packages/cli/src/index.ts get "$ITEM" --embed --json | jq -r .embed.url)
curl -sI "$URL" | grep -iE '^(content-security-policy|x-content-type-options|cross-origin-opener-policy|cross-origin-resource-policy|set-cookie):'
bun packages/cli/src/index.ts revoke "$ITEM" --reason "live check"
curl -s -o /dev/null -w '%{http_code}\n' "$URL"
```

Expected, in order: `{"ok":true,"service":"superlibrary-api"}` (proves the Worker route wins over Pages on `/api/*`); `{"resource":"https://app.superlibrary.dev","authorization_servers":["https://accounts.superjackfruit.com"],…}`; `200 DENY`; `403` (the content Worker answers, refusing a bad signature); `Signed in.`; a JSON `CommitResult`; the five headers, with the CSP's `frame-ancestors https://app.superlibrary.dev https://app.superpipeline.dev https://console.agentpod.dev`, CORP `same-site`, and **no** `set-cookie` line; `Revoked.`; `410` (revocation is immediate on a URL minted a minute earlier). Then, in a real browser session, open `https://app.superlibrary.dev/`, confirm it signs in silently through Accounts and the uploaded item's page (before revoking, or with a second upload) shows the rendered Markdown inside the frame.

- [ ] **Step 7: README and close-out**

Replace the README's `Status: design.` line with: `Status: phase 1 (Core) live — upload, view and embed artifacts. Plan: docs/superpowers/plans/2026-10-09-superlibrary-phase-1-core.md.` and add a "Run it locally" section: `pnpm install`, `node scripts/dev-keys.mjs`, then `pnpm --filter @superlibrary/api dev`, `pnpm --filter @superlibrary/content dev`, `pnpm --filter @superlibrary/web dev`, and open `http://localhost:5173` (dev auth, no sign-in). Commit, PR, operator merges.

---

## Self-review

Run against the spec on 2026-10-09, after writing.

**1. Spec coverage (phase 1 per §14, as briefed):**
- Repo, CI (test / e2e / deploy): Tasks 1, 18, 19, 21. Two Workers + Pages app: Tasks 2, 11, 15, 21.
- D1, R2, Queues: Task 2 (bindings, schema), Task 10 (`retention` queue + cron); `ingest`/`index` deferred (D15).
- Accounts registration: companion plan (audience, `superlibrary-web`, `suli`, entitlement, embed resources for Superpipeline and console). Scopes need no Accounts change (pinned). Hub service grant and station-token audience: phase 2 (D20).
- Direct upload by a person, web and `suli upload`: Tasks 7-8, 16, 20.
- Items/artifacts, versions, SHA-256 content addressing (§3): Tasks 2, 7, 8. Work records: phase 2.
- Viewer for every §9 kind on the content origin, per-artifact subdomain, CSP, 5-minute signed URLs, headers: Tasks 11-13 (+ D2/D3 flags). Embedding (§9 amendment): Tasks 9 (embed API + CORS), 11 (frame-ancestors from config), 12 (frame protocol), 14 (`@superlibrary/embed`), 17 (the app is one more host).
- Guardrails §8: path rules (Task 4, enforced in 7, pre-checked in 16/20, zips in 16, symlinks in 16/20), sizes (7, 16, 20), sniffing (5), secret scan + refusal + recorded override (6, 8, 16, 20).
- Visibility §4 for people (workspace membership + scope; D11): Task 9. Board roster for agents: phase 3.
- Audit of every read: Task 9 (`items.listed`, `item.read`, `item.viewed`), plus writes in 7, 8, 10.
- Lifecycle §12 for artifacts: revoke item/version, expiry, 30-day sweep via queue/cron, deletion semantics: Task 10 (+ D14).
- §15 phase-1 tests: malicious fixture (Task 18: storage, fetch/XHR/WebSocket, top navigation, framing outside the allowlist); signed URL expiry and single-item/version scope (Task 11); sniff beats extension (5); size caps (7); secret refusal + override audit (8); non-member refused — 404 by design, D11 (9); every view audited (9); versions immutable (2); revocation immediate (10, 11, 21 live); retention deletes only unreferenced (10).

**2. Placeholder scan:** no TBD/TODO. Two dead lines found in code blocks (an unused `now` in Task 9, an unused `deflateSync` in Task 18) were removed. Stubs that a later task replaces are named as such with the replacing task (Task 7 commit/override → Task 8; Task 19 `artifacts.ts` → Task 20; Task 11 viewer `main.ts` → Task 12).

**3. Type consistency:** `CommitResult`, `EmbedGrant`, `ItemSummary`, `VersionSummary`, `Manifest`, `ViewerData` are defined once in the contract and used by name everywhere; `resolvePerson`/`Person`, `Handler`, `audit()` returning a statement, `blobKey`/`manifestKey`, `signContent`/`contentOrigin`, `checkPath`/`PathCheck`, `isResizeMessage`/`isThemeMessage`, `mountArtifact`/`MountOptions`, `createApi`, `tokenSource`/`makeClient` match between producing and consuming tasks. Route shapes: `/api/v1/uploads[/:id/(files|override|commit)]`, `/api/v1/items[/:id[/embed|/revoke|/versions/:n/revoke]]`, `/_view?sig=`, `/s/<token>/<path>`.

**4. Review Focus:** five inputs listed at the top; each has its test in the owning task (names quoted there).
