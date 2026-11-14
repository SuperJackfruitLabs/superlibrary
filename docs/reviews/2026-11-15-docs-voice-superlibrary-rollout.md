# Claims ledger — SuperLibrary docs voice rollout

Status: verify-stage evidence for the 18-page voice rollout.

## Immutable revisions and scope

- PR base: `9d576c0fe9073d38d99aadf84fbb880570d8ba06` (`origin/main` after SuperLibrary PR #57).
- Voice guide: `SuperJackfruitLabs/sketchbook@29690e4397467bcf92ea7ef7e88b4e89cffba88f`, `ideas/2026-11-14-docs-voice-guide-v1/README.md`.
- Reference rollout: `SuperJackfruitLabs/superdispatch`, merged PR #32; its published narrator and claims-ledger shape were used as the standard, not as a source of wording.
- Scope: all 18 published pages under `docs-site/src/content/docs/` and this ledger.
- The existing BentoHome block and its layout are unchanged. Product code, package/configuration files, site setup, styles, components and working notes are unchanged.
- Product evidence below is pinned to the PR base. Each row covers every command, flag, route, setting, default, field, enum, limit, and behavioural claim on that page.

## Page-by-page voice review

All pages pass narrator, candour, exactness, vocabulary/privacy, originality, and claims. Step payoffs and a running gag are judged by page kind, as the guide requires.

| Page | Kind | Narrator and momentum | Step payoffs | Running gag | Exact and safety material |
|---|---|---|---|---|---|
| `index.mdx` | home / quick start | pass — a shared guide sorts the two item kinds and leads to the next action | pass — the existing quick-start note states the runnable command's test result and boundary | not applicable — the operator required the Bento layout to remain intact; this is a one-command home card, not a multi-step tutorial | pass — Bento props, command, limits, outcomes and links remain literal |
| `what-it-is.md` | concept | pass — direct `we`/`you` framing turns the product boundary into a guided tour | not applicable | not applicable — concept page | pass — kind/outcome tables, product names, service address and roadmap remain plain |
| `concepts.md` | reference | pass — a light shelf-label premise guides the vocabulary without competing with it | not applicable | not applicable — reference page | pass — ids, enums, fields, weights, dimensions and visibility rules remain literal |
| `install.md` | task | pass — we take the shortest path to the client, then the local stack | pass — install, version, login, local start and test actions each end in the result they buy | not applicable — task page; only one-off narrative humour | pass — commands, variables, platforms, warnings, ports and deployment limits remain literal |
| `use/uploading.md` | task | pass — the reader is guided from clean upload through override, version and expiry | pass — command, path, size, override, version and expiry actions close with a consequence | not applicable — task page; one-off jokes stay in prose | pass — commands, paths, caps, scanner list, warning semantics and dates remain literal |
| `use/search.md` | concept / task | pass — shared questions frame exact filters and ranking | pass — the two example searches state what list each returns | not applicable — no running gag | pass — flags, ranges, order, route and retrieval boundary remain literal |
| `use/the-app.md` | reference | pass — direct guidance explains what each screen buys the reader | not applicable — no procedural steps | not applicable — reference page | pass — URLs, route table, moderation limits and timing states remain literal |
| `use/collections.md` | task / reference | pass — a shelf metaphor frames the commands without entering them | pass — the command sequence, app path and retention action each state the resulting collection state | not applicable — task/reference page | pass — commands, routes, ids and permissions remain literal |
| `use/with-superpipeline-and-agentpod.md` | task / concept | pass — we follow both product connections from event or file to stored item | pass — backfill/subscription, link, station list and origin actions state their result | not applicable — no running gag | pass — routes, settings, response limits and origin table remain literal |
| `use/retention-and-operations.md` | operator task / reference | pass — a direct operator narrator frames housekeeping and re-indexing | pass — each re-index action now has its observable or safety payoff | not applicable — operator page | pass — destructive rules, routes, errors, settings, SQL and secrets remain literal and precede humour |
| `build/api.md` | reference | pass — a light narrator establishes the API boundary and receipts | not applicable — route catalogue | not applicable — reference page | pass — bearer shape, caller classes, method/path tables, schemas, limits and errors remain literal |
| `build/mcp.md` | task / reference | pass — the reader is guided from endpoint to the right read tool | pass — configuration and each tool section state the result the action returns | not applicable — task/reference page | pass — JSON, tool names, schemas, limits, status codes and safety preface remain literal |
| `build/cli.md` | reference | pass — a concise guide points to the exact command groups | not applicable — index page | not applicable — reference page | pass — synopsis, command tables, global flags, environment and exit statuses remain literal |
| `build/embed.md` | task / reference | pass — a shared narrator explains the host/frame boundary and why each duty exists | pass — mount, host duties and allowed-origin actions end with the resulting viewer or refusal | not applicable — task/reference page | pass — caution, TypeScript, options, message table, settings and recovery remain literal |
| `build/licences.md` | reference | pass — a direct opening answers the reader's shipping question | not applicable | not applicable — reference page | pass — package names, licence identifiers and shipped/build boundary remain literal |
| `build/cli/artifacts.md` | command reference | pass — the lifecycle framing and receipts address the reader directly | pass — upload, get and revoke each end with the exact result or state change | not applicable — reference page | pass — synopsis, flags, routes, output and failures remain literal |
| `build/cli/library.md` | command reference | pass — the guide carries search into curation and scope | pass — all seven commands end with the resulting list, collection state or one-way visibility change | not applicable — reference page | pass — synopsis, flags, routes, output and failures remain literal |
| `build/cli/session.md` | command reference | pass — we establish the binary and active identity together | pass — all six commands end with the local or server-visible result | not applicable — reference page | pass — synopsis, flags, routes, credential boundary, output and failures remain literal |

Candour passes across the set: absent self-hosting guidance, development-only auth, text-only retrieval, scanner limits, report-only retention, agent write limits, missing alternative embedders and live visibility boundaries remain explicit. No private host, person, agent, team, credential, customer or private-message name was added. Public product names and service URLs, loopback addresses, synthetic ids and placeholder tokens are the only identifiers used.

## Claims checked at the PR base

| Page | Material checked | Base evidence |
|---|---|---|
| `index.mdx` | artifact/work-record kinds; upload declaration, limits, secret scan and commit; seven outcomes and precedence; outcome-weighted search; visibility; three MCP tools; Workers/account boundary; quick-start command and stated 49 checks | `packages/contract/src/model.ts:4-15,23-39,104-152`; `packages/contract/src/limits.ts:1-18`; `apps/api/src/uploads/routes.ts:40-128,166-264,446-596`; `apps/api/src/guard/secrets.ts:1-50`; `apps/api/src/ingest/work-record.ts:11-20`; `packages/contract/src/retrieval.ts:7-24`; `apps/api/src/search/search.ts:86-195`; `apps/api/src/items/visibility.ts:14-35`; `apps/api/src/mcp/tools.ts:23-53`; `apps/api/wrangler.jsonc:18-77`; executable quick start recorded under Real checks |
| `what-it-is.md` | source kinds and work-record boundary; upload checks; viewer lifetime/separation; render kinds; ranking and visibility; access surfaces; Cloudflare/account configuration; MIT; roadmap exclusions | `packages/contract/src/model.ts:4-15,104-152`; `apps/api/src/ingest/work-record.ts:11-20,41-106`; `apps/api/src/items/routes.ts:141-168`; `apps/content/wrangler.jsonc:10-25`; `apps/content/src/index.ts:1-269`; `apps/api/src/search/search.ts:86-195`; `apps/api/src/items/visibility.ts:14-35`; `apps/api/wrangler.jsonc:18-77`; `LICENSE:1-21`; `apps/api/src/indexing/embedder.ts:26-35` |
| `concepts.md` | item fields/id shape, versions/default entry, render enum, work records, outcomes/precedence, sources/provenance, scope/visibility/404, one-way widening, collections, retrieval weights/RRF/floor, embedder and principal boundary | `packages/contract/src/model.ts:4-15,23-39,72-152`; `packages/contract/src/ids.ts:1-12`; `apps/api/src/uploads/routes.ts:40-47,480-596`; `apps/api/src/ingest/work-record.ts:11-20,41-106`; `apps/api/src/items/visibility.ts:14-48`; `apps/api/src/items/routes.ts:22-84,259-280`; `packages/contract/src/library.ts:8-12,57-86`; `apps/api/src/library/collections.ts:13-132`; `packages/contract/src/retrieval.ts:7-24`; `apps/api/src/search/search.ts:12-18,86-195`; `apps/api/src/indexing/embedder.ts:6-34` |
| `install.md` | installer URL, aliases, platforms, destination, variables, checksum/refusal, version output, device flow/token lifetime, skill path, hosted/default URL, local commands/ports/auth, tests, release/server boundary and deployment dependencies | `scripts/install.sh:1-114`; `packages/cli/package.json:1-15`; `packages/cli/src/commands.ts:24-97`; `packages/cli/src/credential.ts:1-105`; `packages/cli/src/plane-login.ts:1-96`; `apps/api/package.json:6-12`; `apps/content/package.json:6-11`; `apps/web/package.json:6-12`; `apps/api/wrangler.jsonc:18-77`; `.github/workflows/release.yml:1-486` |
| `use/uploading.md` | CLI commands; person/agent boundary; path denials; file/folder/workspace caps and content addressing; upload 24/72-hour lifecycle; scanner rules and limitations; override audit; versions; UTC expiry; scope default | `packages/cli/src/commands.ts:36-58`; `packages/contract/src/paths.ts:1-76`; `packages/contract/src/limits.ts:1-30`; `apps/api/src/guard/limits.ts:1-51`; `apps/api/src/uploads/routes.ts:60-128,166-264,390-499`; `apps/api/src/guard/secrets.ts:1-89`; `apps/api/src/sources/link.ts:7-40`; `apps/api/src/items/routes.ts:237-280`; `apps/api/src/lifecycle/retention.ts:148-188` |
| `use/search.md` | app/CLI/MCP convergence; all filters and ranges/default; browse ordering; FTS/vector fusion; outcome order/weights; relevance floor and stopwords; result fields; visibility; related route/input; text-only limits | `packages/contract/src/library.ts:13-49`; `packages/contract/src/retrieval.ts:7-69`; `apps/api/src/search/search.ts:12-18,21-68,71-195`; `apps/api/src/search/routes.ts:69-100`; `apps/api/src/items/visibility.ts:14-35`; `packages/cli/src/commands.ts:67-82`; `apps/api/src/mcp/tools.ts:23-53` |
| `use/the-app.md` | hosted/local auth boundary; people/MCP split; page routes; outcome counts; artifact/work-record view; provenance; all moderation acts/limits/permissions; four vibes; loading/slow/failure/empty timing and copy; reduced motion | `apps/web/src/routes/+page.svelte:1-12`; `apps/web/src/routes/outcomes/+page.svelte:1-20`; `apps/web/src/routes/collections/+page.svelte:1-11`; `apps/web/src/routes/collections/[id]/+page.svelte:1-20`; `apps/web/src/routes/upload/+page.svelte:1-20`; `apps/web/src/routes/a/[itemId]/+page.svelte:1-6`; `apps/web/src/routes/a/[itemId]/v/[version]/+page.svelte:1-7`; `packages/contract/src/library.ts:31-49,81-94`; `apps/api/src/library/routes.ts:11-69`; `apps/api/src/library/moderation.ts:13-123`; `apps/api/src/items/routes.ts:96-168`; `apps/web/src/lib/loading.ts:1-123`; `apps/web/src/lib/vibe/vibes.css:1-40`; `apps/web/src/lib/logo-motion.ts:41-44` |
| `use/collections.md` | every CLI command; id/name lookup and case-insensitive uniqueness; app route; create/add/remove/edit permissions; visibility-sensitive count; item survival; retention reference; report mode | `packages/cli/src/commands.ts:84-89`; `packages/contract/src/library.ts:10-12,57-79`; `apps/api/src/library/routes.ts:37-57`; `apps/api/src/library/collections.ts:13-132`; `apps/api/src/lifecycle/retention.ts:148-188`; `apps/api/wrangler.jsonc:33-34` |
| `use/with-superpipeline-and-agentpod.md` | three sources; card-to-record outcome; signed events and hourly subscription; backfill/status; related embed; agent/person station linking, provenance/version/scope; station list 200 cap; roster invalidation; credentials; browser-origin values | `packages/contract/src/model.ts:104-152`; `apps/api/src/ingest/work-record.ts:11-20,41-106`; `apps/api/src/sources/webhook.ts:1-48`; `apps/api/src/sources/subscribe.ts:18-124`; `apps/api/src/sources/routes.ts:10-54`; `apps/api/src/sources/link.ts:7-78`; `apps/api/src/search/routes.ts:50-56,89-100`; `apps/api/src/env.ts:26-51`; `apps/api/wrangler.jsonc:27-42`; `apps/content/wrangler.jsonc:10-20` |
| `use/retention-and-operations.md` | 03:00/03:30 schedules; expiry/open-upload/unreferenced rules; report/enforce; deletion/blob sharing; operator auth and every admin route/result/error; dual-slot re-index flow/dimensions/drain; current embedder; secret names/meaning; health body | `apps/api/src/lifecycle/retention.ts:1-13,52-195`; `apps/api/src/indexing/consumer.ts:9-57`; `apps/api/wrangler.jsonc:33-71`; `apps/api/src/search/routes.ts:13-68`; `apps/api/src/indexing/reindex.ts:20-88`; `apps/api/src/indexing/embedder.ts:4-35`; `apps/api/src/env.ts:26-55`; `apps/api/src/index.ts:23-57,81-87`; `apps/api/src/sources/subscribe.ts:18-27` |
| `build/api.md` | API base/auth/discovery/caller classes/404; every documented method/path pair; all request/response fields; upload/item/search/browse/collection/source/admin limits and errors; timing header; CORS settings | `apps/api/src/index.ts:21-57`; `apps/api/src/uploads/routes.ts:351-411,446-596`; `apps/api/src/items/routes.ts:87-305`; `apps/api/src/search/routes.ts:13-102`; `apps/api/src/library/routes.ts:11-69`; `apps/api/src/sources/routes.ts:10-54`; `packages/contract/src/model.ts:23-49,77-152`; `packages/contract/src/library.ts:17-86`; `packages/contract/src/retrieval.ts:28-67`; mechanically checked by `scripts/check-docs-claims.mjs` |
| `build/mcp.md` | endpoint/POST-only/stateless/auth/discovery; preface/wrapping/error text; exact three read-only/idempotent tools and every argument/default/limit; no-write boundary; 1 MiB/10,000 structure caps/statuses | `apps/api/src/index.ts:23-39`; `apps/api/src/mcp/server.ts:7-27`; `apps/api/src/mcp/tools.ts:9-53`; `packages/contract/src/retrieval.ts:23-47`; tool names mechanically checked by `scripts/check-docs-claims.mjs` |
| `build/cli.md` | alias/syntax; person/agent boundary; every command group; global flags; exit status; all environment variables/default; sign-in boundary; command-table/reference provenance | `packages/cli/package.json:1-15`; `packages/cli/src/commands.ts:1-140`; `packages/cli/src/index.ts:1-108`; `packages/cli/src/credential.ts:1-105`; `packages/cli/src/reference.ts:1-40`; `packages/cli/src/reference.test.ts:35-100` |
| `build/embed.md` | allowed origins; vendored build; corrected authorization code; host duties; toolbar; all options/defaults/callbacks; custom properties; signed grant shape/lifetime/content isolation; sandbox/messages/20,000px limit/source check; exact settings | `packages/embed/package.json:1-21`; `packages/embed/src/index.ts:1-120,290-389,570-675`; `packages/contract/src/model.ts:77-87`; `packages/contract/src/viewer.ts:1-28`; `apps/api/src/items/routes.ts:141-168,283-305`; `apps/content/src/index.ts:1-269`; `apps/api/wrangler.jsonc:24-32`; `apps/content/wrangler.jsonc:10-25`; `packages/contract/test/repo-invariants.test.ts:1-99` |
| `build/licences.md` | repository MIT licence; exact direct runtime dependencies by shipped part; direct/transitive and runtime/build boundary; CLI compilation/release contents | `LICENSE:1-21`; `apps/api/package.json:14-19`; `apps/content/package.json:13-23`; `apps/web/package.json:14-19`; `packages/contract/package.json:1-12`; `packages/cli/package.json:1-15`; `packages/embed/package.json:1-21`; `pnpm-lock.yaml:24-181` plus installed package manifests at that frozen-lock resolution; `scripts/install.sh:72-98`; `.github/workflows/release.yml:1-486` |
| `build/cli/artifacts.md` | exact upload/get/revoke synopses, flags/defaults, routes, access, output, errors and examples; corrected current agent read/link boundary | `packages/cli/src/commands.ts:36-66`; `packages/cli/src/index.ts:1-108`; `apps/api/src/uploads/routes.ts:351-499`; `apps/api/src/items/routes.ts:87-305`; current agent boundary: `apps/api/src/mcp/tools.ts:23-53`, `apps/api/src/sources/link.ts:7-40` |
| `build/cli/library.md` | exact search/collection/scope synopses, filters/defaults, routes, access, output, errors and examples; retention and one-way scope; corrected current agent boundary | `packages/cli/src/commands.ts:67-89`; `packages/cli/src/library.ts:1-163`; `apps/api/src/library/routes.ts:11-69`; `apps/api/src/library/collections.ts:13-132`; `apps/api/src/items/routes.ts:259-280`; `apps/api/src/mcp/tools.ts:23-53`; `apps/api/src/sources/link.ts:7-40` |
| `build/cli/session.md` | exact help/version/skill/login/logout/whoami syntax, defaults, local/network boundary, token lifetime, routes, output, errors and examples; corrected current agent boundary | `packages/cli/src/commands.ts:24-35,92-140`; `packages/cli/src/skill.ts:1-82`; `packages/cli/src/credential.ts:1-105`; `packages/cli/src/plane-login.ts:1-96`; `packages/cli/src/index.ts:1-108`; `apps/api/src/mcp/tools.ts:23-53`; `apps/api/src/sources/link.ts:7-40` |

## Corrections and evidence-bound changes

No factual change was made silently. Each source correction is listed separately.

| Page | Old material | New material | Why and evidence |
|---|---|---|---|
| `build/embed.md` | The TypeScript example had a malformed authorization expression: ``authorization: *** ${token}` ``. | The example now constructs the valid header as `authorization: 'Bearer ' + token`. | API calls resolve bearer identity; the host must call the embed route with the signed-in person's token: `apps/api/src/auth/caller.ts:1-146`; `packages/embed/src/index.ts:19-43`; `apps/api/src/items/routes.ts:141-168`. |
| `build/cli/artifacts.md` | Each command repeated “Agents reach SuperLibrary from a later release”. | The page now says agents read through MCP and link files through AgentPod; their tokens remain refused by the CLI command. | MCP is live and read-only: `apps/api/src/mcp/tools.ts:23-53`. Agent links are live through the trusted hub: `apps/api/src/sources/link.ts:7-40`. CLI commands remain person-only: `packages/cli/src/commands.ts:21-22,36-66`. |
| `build/cli/library.md` | Each person-only command repeated “Agents reach SuperLibrary from a later release”. | The page now states the current MCP-read/AgentPod-link boundary and the command's agent-token refusal. | `apps/api/src/mcp/tools.ts:23-53`; `apps/api/src/sources/link.ts:7-40`; command access in `packages/cli/src/commands.ts:67-89`. |
| `build/cli/session.md` | `suli whoami` repeated “Agents reach SuperLibrary from a later release”. | The page now states the current MCP-read/AgentPod-link boundary and `whoami`'s agent-token refusal. | `apps/api/src/mcp/tools.ts:23-53`; `apps/api/src/sources/link.ts:7-40`; command access in `packages/cli/src/commands.ts:29-35`. |
| `build/cli.md` | “The command pages are generated from the CLI's own command table.” | The page now says the exact synopses, flags, routes, outputs and failure cases follow that table; the generated reference is correctly identified as `docs/reference/cli`. | Generator target and exactness test: `packages/cli/src/reference.ts:1-40`; `packages/cli/src/reference.test.ts:84-100`. The published docs-site pages are not generator outputs. |

The stale “later release” note also remains in the non-published command-table prose at the base (`packages/cli/src/commands.ts:22`), but product code and generated `docs/reference/cli` are explicitly outside this page-text-only rollout. The published pages state the behaviour the base actually implements.

## Deployment claims that remain UNVERIFIED

The repository proves intended configuration and release flow, but not the current state of private infrastructure:

- **UNVERIFIED:** `index.mdx` and `what-it-is.md` describe the hosted SuperLibrary as running on Cloudflare Workers. The base config defines the Worker, D1, R2, Workers AI, Vectorize, Queues and cron bindings (`apps/api/wrangler.jsonc:1-77`), but this public repository cannot prove what is currently deployed.
- **UNVERIFIED:** `install.md`, `use/the-app.md`, `build/api.md`, and `build/mcp.md` name the hosted app/API/MCP addresses as live service entry points. The base declares those routes (`apps/api/wrangler.jsonc:73-77`) and the URLs were checked over HTTP in this run, but live deployment ownership is outside the repository.

A request for pinned private-estate evidence was posted on the rollout card. These statements are not
treated as false merely because their deployment evidence is outside this repository.

## Mechanical claims check

The existing `scripts/check-docs-claims.mjs` scans every docs page and landing page, requires title/description frontmatter, and rejects any named `/api/v1` route or `library_*` tool that the base implementation does not define. It covers the route and MCP-tool claims on all changed pages; its real output is recorded below.

No checker file was changed. The operator's current merge constraint says to change page text only so this rollout can rebase cleanly over the separately merged shared-theme work. The checker lives at root `scripts/`, and changing it would also take the patch out of the repository's docs-only CI classification (`scripts/ci-plan.mjs`; `.github/workflows/ci.yml:18-21`). Corrections that are not covered by the existing route/tool ratchet are therefore recorded explicitly above rather than hidden in an out-of-scope code change.

## Exact-material inventory

- `index.mdx`: frontmatter, BentoHome/FlowSteps props, command, limits, ids, outcomes, links and component structure.
- `what-it-is.md`: kind/outcome/access tables, product and service names, links and roadmap list.
- `concepts.md`: ids, fields, enum/default/weight tables, dimensions and visibility rules.
- `install.md`: commands, variables, platforms, paths, ports, output shapes, caution and dependency list.
- `use/uploading.md`: commands, denied paths, limits, scanner list, override syntax, flags, dates and visibility boundary.
- `use/search.md`: commands, filter table, ranges/defaults, ranking order, route and result fields.
- `use/the-app.md`: URLs, route table, moderation table/limits, timing values and failure copy.
- `use/collections.md`: commands, ids/routes, permission table and retention rule.
- `use/with-superpipeline-and-agentpod.md`: routes, statuses, credential/settings names, 200 cap and origin table.
- `use/retention-and-operations.md`: schedules, deletion rules, mode/route tables, ordered re-index procedure, errors, SQL, secrets and health body.
- `build/api.md`: bearer header, caller classes, every route table, bodies, fields, limits, statuses and errors.
- `build/mcp.md`: endpoint, JSON, preface, tool/argument tables, ids, defaults, limits and error text.
- `build/cli.md`: syntax, command tables, flags, environment and exit statuses.
- `build/embed.md`: caution, package/command names, TypeScript, ordered duties, toolbar/options/message/settings tables, origins and limits.
- `build/licences.md`: package names, SPDX identifiers and shipped/build boundary.
- `build/cli/artifacts.md`, `build/cli/library.md`, `build/cli/session.md`: every synopsis, argument, flag, default, route, caller, output, exit reason and example.

No humour was added to any exact region, warning, recovery instruction or destructive procedure.

## Real checks

Read from `.github/workflows/ci.yml:18-21,196-228` and run from the final working tree:

- Docs install, exactly `npm ci` in `docs-site`: **pass** — 437 packages added, 438 audited. npm reported 1 moderate-severity vulnerability and suggested `npm audit fix`; the frozen install itself succeeded.
- Docs build, exactly `npm run build` in `docs-site`: **pass** — Astro built 19 pages; Pagefind indexed 19 HTML files; the sitemap was generated. The build emitted the existing warning that the optional `i18n` collection is empty.
- Docs claims, exactly `node scripts/check-docs-claims.mjs` at the root: **pass** — 20 pages agree with 17 literal routes, 6 route patterns and 3 MCP tools.
- Root install, exactly `pnpm install --frozen-lockfile`: **pass** — the 556-entry lockfile passed the repository's supply-chain policy check; 419 packages installed with pnpm 11.5.2.
- CLI reference lane, exactly `pnpm --filter @superlibrary/cli exec vitest run src/reference.test.ts`: **pass** — 1 file, 8 tests passed.
- Home-page quick start test command, exactly `pnpm --filter @superlibrary/api exec vitest run test/uploads.test.ts test/search.test.ts`: **pass** — 2 files, **49 tests passed**, matching the page's claim. The run emitted upstream MCP SDK sourcemap warnings about missing source files; no test failed.
- Frozen dependency-licence audit: **pass** — the installed package manifests at the lockfile's exact resolution reported the SPDX values in `build/licences.md`; the vendored vibekit tarball reported `UNLICENSED`.
- Live reachability check: `https://app.superlibrary.dev` **200**, `/api/health` **200**, `/mcp` **401** without a token (the documented protected boundary), and `https://docs.superlibrary.dev` **200**. This proves reachability during the run, not private deployment provenance; the claims remain marked UNVERIFIED above.

## Independent verify-stage rerun

At `2026-11-14 20:53 UTC`, Verify reconstructed the seven draft commits from the linked artifact on
the recorded base and checked the complete tree independently:

- **Scope and patch integrity:** `git diff --check` passed; the diff contains exactly the 18
  published pages plus this ledger, with no site setup, product code, configuration, component,
  style, or working-note path.
- **Evidence integrity:** all 170 `file:line` citations parsed from this ledger resolve at the
  recorded base across 63 repository files; no cited line range exceeds its file.
- **Docs lane:** `npm ci` passed with the same one moderate vulnerability report; `npm run build`
  built 19 pages, Pagefind indexed 19 HTML files, and the sitemap was generated; and
  `node scripts/check-docs-claims.mjs` reported 20 pages, 17 literal routes, 6 route patterns, and
  3 MCP tools.
- **Docs-reference lane:** `pnpm install --frozen-lockfile` passed with 419 packages, and
  `pnpm --filter @superlibrary/cli exec vitest run src/reference.test.ts` passed 8/8 tests.
- **Page claim:** the home-page quick-start command passed 49/49 tests again. The same upstream MCP
  SDK sourcemap warnings appeared and no test failed.
- **Deployment boundary:** the app, health route, and docs returned 200; unauthenticated MCP
  returned 401. These are reachability observations only, so the private deployment claims above
  remain **UNVERIFIED** rather than being promoted to repository-proven facts.

Verify found no unsupported repository claim, privacy leak, silent factual change, or voice-guide
miss that requires a page correction. Verdict: **publishable** for the operator to apply as one PR.
