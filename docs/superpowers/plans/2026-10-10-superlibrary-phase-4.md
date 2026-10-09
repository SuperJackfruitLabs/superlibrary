# Superlibrary phase 4 (the library app): Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** People browse, search and curate the library: search with filters (kind, outcome, board, agent, station, date), item pages with provenance, versions and related items, work-record timelines, collections that keep their artifacts from the 30-day sweep, views by outcome, and person-only moderation. `suli` gains `search`, `collect` and `scope`. Superpipeline's card drawer shows attached Superlibrary artifacts in the embedded viewer and a "Related prior work" panel. The app is the first product built on the suite design system (operator direction A, a working direction): one token source, a component kit and the suite shell.

**Architecture:**
- **API (superlibrary `apps/api`).** One new route group, `src/library/` (browse, facets, the work-record view, collections, moderation), people only. Search gains four filters through one JSON bind shared with browse. A migration (`0040_library.sql`) adds collections, a caption, a person-set replacement and a tombstone for records removed from memory. The ingest consumer learns to respect what a person did (removed, widened, superseded). Read routes a host needs answer CORS for the embedding hosts.
- **Design system (superlibrary `design/`, `apps/web/src/lib/kit`).** One token source (`design/tokens.toml`) generates CSS custom properties in layers: suite (shared neutrals, IBM Plex type scale, spacing, radii, focus, motion), product (`--accent-*`: Superlibrary's coral, its mark, its outcome colours), parent (Super Jackfruit Labs "Ink", provisional, no accent) and each product's accent for the switcher, with contrast contracts asserted at build time (Supermessage's pipeline, names aligned). A small kit (button, field, tabs, toolbar with More, dialog/confirm, toast, empty state, outcome badge) and the suite shell (mark and name, nav, account menu with theme and sign-out, switcher, footer). Nothing outside the token source and the two Mark components holds a colour, face or size, so the working direction can change by a token edit.
- **App (superlibrary `apps/web`).** The Library page becomes search plus browse, with the filters in the address. New pages: Outcomes, Collections, a collection. The item page gets a compact header (title, one meta line, labelled actions), related items, the work-record timeline, moderation and "Add to collection".
- **Embed (`packages/embed`).** Every toolbar control keeps its words on phones (a labelled More panel), host hooks take the suite's colours and face, and a self-contained bundle serves hosts in other repositories.
- **CLI (`packages/cli`).** `suli search`, `suli collect list|create|show|add|remove`, `suli scope`, through the existing command table, generated reference and drift guard.
- **Superpipeline.** Its Worker mints a third token, for the Superlibrary audience, beside the app and hub tokens (the same sequential refresh-token grants). The web client vendors a hash-pinned, self-contained build of `@superlibrary/embed` and mounts it in the card drawer; a "Related prior work" panel calls `POST /api/v1/related { cardId }` with the person's own token.

**Tech Stack:**

| Repo | Stack |
|---|---|
| superlibrary | TypeScript 6, pnpm 11, Cloudflare Workers (D1 + FTS5, R2, Queues, Vectorize), `zod` 4, vitest 4 + `@cloudflare/vitest-pool-workers` 0.16, SvelteKit 2 + Svelte 5 (adapter-static, Pages), Playwright 1.61 (Chromium + WebKit), Vite 8 (rolldown) for the embed bundle, bun for `suli`, `smol-toml` for the token generator, `@fontsource/ibm-plex-sans` and `@fontsource/ibm-plex-mono` |
| superpipeline | Cloudflare Workers + Durable Objects (vitest pool-workers), SvelteKit 2 + Svelte 5 + Tailwind 4 web app, `@testing-library/svelte` |

**Spec:** `docs/superpowers/specs/2026-10-09-superlibrary-design.md` (§3 concepts, §4 visibility, §9 viewing and Embedding with the toolbar, Share, full screen, theme, files and view-source amendments, §11 people's interface, §12 lifecycle, §14 phase 4, §15 tests, §16 decisions). It builds on the phases 2–3 plan `docs/superpowers/plans/2026-10-10-superlibrary-phases-2-3.md` and its ledgers in `.superpowers/sdd/2026-10-10-superlibrary-phases-2-3/` (`progress.md`, `progress-lane-b.md`, `lane-a-progress.md`). Executors read all of them. **Precedence:** the code on `origin/main`, then the ledgers' `Ruling:` lines, then this plan, then the phases 2–3 plan text.

**Written against:** superlibrary `origin/main` at `e01ebce` (Stage 0 + B-SL1 merged), the unpushed lane branches `feat/p2-sources` at `645f659` and `feat/p3-search` at `cdb05ba`, superpipeline `origin/main` at `938e2c4`, accounts `origin/main`. Phases 2–3 were still being built. Every interface this plan takes from them is listed under **Assumed interfaces** and checked by Task 0 before anything else runs.

## Global Constraints

- **Visibility (spec §4).** Applied before ranking, in SQL and in the vector filter. People see `workspace` items, items on every board Superlibrary knows for the workspace (`source_boards`, decision P4), and their own uploads. Agents see their roster plus `workspace`. An invisible item answers **404**, never 403, and is never counted, listed, named as a replacement or shown as a snippet.
- **People only for everything phase 4 adds** (browse, facets, record view, collections, moderation). Agents read only through search, `get`, `related` and MCP (P13, ruling B-R5). An agent token on a phase-4 route gets `403 principal_not_supported` from `resolvePerson`.
- **The hub never acts for a person** (operator ruling R-H1). Phase-4 routes resolve callers only through `resolvePerson` / `resolveViewer`.
- **Moderation is a person's act, audited** (spec §4, §11): widen scope to workspace, mark superseded by another item, revoke an item or a version, edit a caption, remove from memory with a recorded reason. Agents can never moderate. Who may: the uploader of an artifact or an owner of the workspace (plan D12, decision O1).
- **Retention (spec §12).** An artifact referenced by a work record, a card **or a collection** is kept. Any other artifact is deleted after **30 days**. Collection membership writes an `item_references` row with `from_kind = 'collection'`.
- **Deletion removes everything (spec §12):** the D1 rows, R2 bytes no other version shares, vectors and FTS rows (`deleteItem`, which emits `item.changed` `deleted`).
- **Outcomes:** `approved | completed | rejected | failed | abandoned | superseded | in-progress`. Shown on every result, always as the word; colour never carries meaning alone.
- **Viewer (spec §9).** The app and every host render artifacts only through `@superlibrary/embed` (one renderer). Signed content URLs last 5 minutes, one item version, minted with the person's own token for audience `https://app.superlibrary.dev`. No public links. "Copy link" is always the app link.
- **Confirmations are in the page** (spec §11): a modal dialog that names the act on its button, focus starts on Cancel and stays inside, Escape cancels, the rest of the page is inert, focus returns to the opener. Never `confirm()`, `prompt()` or `alert()`.
- **Text is rendered as text.** Titles, snippets, comments, handoffs and specs are agent- or person-written. No `{@html}`, no `innerHTML` in either app's new code.
- **Responsive at 390, 768, 1024, 1280 and 1920 px.** Phones are the operator's primary device: at 390 px every control is at least 44 px tall and nothing scrolls sideways. iOS fields are at least 16 px.
- **Accessible:** visible keyboard focus, every control labelled, keyboard-operable, `role="status"`/`role="alert"` for changes.
- **Design: the suite design system, a working direction** (operator, 2026-10-09; may still evolve). Direction A: one shared system, each product keeps its accent and mark; Superlibrary is the first product on it, accent coral `#ff7a59` (the deeper `#b04a1e` on light grounds), mark the book spines (PR #16 `Mark.svelte`). **IBM Plex Sans** for headings and body, **IBM Plex Mono** for code and data, no other faces. Parent identity Super Jackfruit Labs **"Ink" (provisional)**: neutral, no accent, hexagon mark. **Every colour, face, size, radius and space comes from `design/tokens.toml`; both marks come only from `Mark.svelte` and `ParentMark.svelte`; nothing is hard-coded in a page or component** (guarded in Task 12). Rolling the system out to other products is not part of this plan.
- **The suite shell rule:** product mark and name left, primary nav, then the suite switcher and an account menu holding the theme and Sign out, right; the footer links "Super Jackfruit Labs" with the parent mark. Every page uses kit components, not page-local styles.
- **The operator's phone review of phase 1 is fixed here:** a styled header (Task 13), embed toolbar controls labelled or in a labelled More panel on phones (Task 9), and the item title block reduced to a title and one meta line before the content (Task 15).
- **Names.** Never put local host names or agent names in shipped code, docs, tests or fixtures; use synthetic ids (`brd_00000000000000b1`, `prn_000000000000000000a2`). The product word is **workspace**.
- **Migrations:** phase 4 owns `apps/api/migrations/0040`–`0049` (Stage 0 `0004`, lane A `0010`–`0019`, lane B `0020`–`0029`, Stage 3 `0030`–`0039`).
- **Every guard is revert-proof.** Each named test must fail when the guarded line is reverted; each task's last test step says which line to revert. Record the observed failure in the task report.
- **Secrets** only through `wrangler secret put`. Phase 4 needs no new secret.
- **Commits** end with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8
  ```
  PR bodies end with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- **Merge rules.** superlibrary: the controller merges on green CI, and CI deploys `main`. superpipeline: the controller opens the PR and gets CI green; **the operator merges** (it then auto-deploys). Never deploy by hand.
- **Worktrees.** Never check out a branch in the main checkouts (other agents use them). Each branch lives in its own worktree under `/Users/rakeshgangwar/SuperJackfruit/.worktrees/`.

## Assumed interfaces from phases 2–3

Each line is an interface this plan builds on that was not yet on `origin/main` when it was written (or was, but may be changed by Stage 3). Task 0 checks every one and records ✅ or the difference.

| Id | Where | Assumed shape |
|---|---|---|
| A1 | `apps/api/src/search/search.ts` | `search(env, v: Viewer, q: SearchQuery): Promise<SearchResult[]>`, `searchAudited`, `supersededByMap(env, ids)`, `visibleSupersededBy`, `sourcesOf`, `ftsQuery`. The FTS and re-check queries bind `?1`–`?3` visibility, `?4` now, `?5` kinds JSON, `?6` outcomes JSON, `?7` board scope, `?8` the MATCH text or the id list. `supersededByMap` reads only `work_records.superseded_by_card`. |
| A2 | `apps/api/src/items/visibility.ts` | `ItemRow`, `loadItem`, `viewerScopes(env, v)`, `canSee(v, item, scopes)`, `canManage(p, item, scopes = [])`, `visibleSql(alias)` (binds `?1` workspace, `?2` scopes JSON, `?3` the person's prn or `''`), `visibleBinds(v, scopes)`, `isExpired`, `audienceOf`. |
| A3 | `apps/api/src/items/routes.ts` | `export function summary(i: ItemRow, extra?)`; a module-private `extrasFor(env, items)` returning source, `boardKnown` and `supersededBy`; `readable`, `manageable`; a local `corsFor`/`hostsOf` for `EMBED_HOSTS`; the `ITEM` path regex ending in `(\/embed|\/revoke|\/scope|\/versions\/n\/revoke)?$`. |
| A4 | `apps/api/src/search/routes.ts` | `searchRoutes` serves `POST /api/v1/search`, `GET /api/v1/library/:id`, `POST /api/v1/related` through `resolveViewer`. |
| A5 | `apps/api/src/search/related.ts` | `related(env, v, RelatedQuery): Promise<RelatedItem[]>`; for `cardId` the basis is that card's work record, `[]` when the card has none or it is invisible. |
| A6 | `apps/api/src/ingest/consumer.ts` | `syncCard(env, { workspaceId, boardId, cardId }, snapshots?)`; its update of an existing record is `UPDATE items SET title = ?, outcome = ?, scope = ? WHERE id = ?`, after the digest check; `deleteCardRecord`. |
| A7 | `apps/api/src/lifecycle/retention.ts` | `deleteItem(env, itemId, actor, reason)` deletes `version_files`, `versions`, `item_references`, `item_sources`, `work_records`, `items` in one batch with an `item.deleted` audit row, then emits `item.changed` `deleted`; `sweep(env, now)`; `STALE` excludes items with any `item_references` row. |
| A8 | `apps/api/src/http.ts` | `corsFor(request, allowed)`, `preflight(request, allowed, methods)`, `withCors(request, allowed, res)` (lane A, `feat/p2-sources`). |
| A9 | `apps/api/src/indexing/extract.ts` | `extractText(env, item)`; an artifact's text starts with `item.title` and, with no text file, is `title + file paths`. |
| A10 | `apps/api/src/indexing/consumer.ts` | The index digest covers text, scope, outcome, kind and title, so `item.changed` `upserted` after a caption, scope or outcome change re-indexes. |
| A11 | D1 | `work_records.body` is `WorkRecord` JSON (`work-record/1`); `work_records.source_updated_at` is the card's ISO `updatedAt`; `syncCard` writes `item_references (from_kind 'work-record')` for referenced items. |
| A12 | D1 | `source_boards (workspace_id, board_id, name)` is filled by the subscription job (Task A11). |
| A13 | migrations | Stage 3 uses only `0030`–`0039`; phase 4 starts at `0040`. |
| A14 | `@superlibrary/contract` | `SearchQuery` is `.strict()` with `query, kinds?, outcomes?, board?, limit`; `RelatedQuery`; `SearchResult`; `ItemSummary.audience?`, `supersededBy?`; the `WorkRecord*` types. |
| A15 | `item_sources` | `station_name` is written by A10 for agent links; `sourceOf` may not yet map it into `ItemSource.stationName`. |
| A16 | test helpers | `test/helpers/records.ts` `seedRecord`; `test/helpers/fake-pipeline.ts` `fakePipeline`, `card`, `ORG`; `test/helpers/org-plane.ts` `devHeaders`, `planeToken`, `withOrgPlane`, `HUMAN`, `HUMAN_2`, `AGENT`, `ORG`; `test/helpers/upload.ts` `upload`, `API`; `test/helpers/fake-vectors.ts` `fakeEmbedder`, `fakeVectorize`; `setIndexingForTests`. |
| A17 | `apps/api/src/mcp/tools.ts` | MCP tool schemas are their own literals; adding optional fields to `SearchQuery` does not change MCP. |
| A18 | `apps/api/src/auth/caller.ts` | `resolvePerson` refuses agents with `403 principal_not_supported` and refuses delegated person tokens (R-H1). |
| A19 | `apps/api/src/index.ts` | `handlers: Handler[] = [uploadRoutes, itemRoutes, searchRoutes, sourceRoutes]`; `/api/v1/me` answered inline. |
| A20 | superpipeline `apps/api/src/auth/plane-signin.ts` | `/hub/token` answers `{ token, hubToken, hubConfigured, signIn }` and renews app then hub sequentially, each grant spending the newest refresh token (`tokenRequest`, `ttlOf`, `readCookie`); cookies on `Path=/hub`. (On `origin/main` `938e2c4`, verified.) |
| A21 | accounts | Client `superpipeline-web` may request resource `https://app.superlibrary.dev` (`src/products/registry.ts:51`, verified). |
| A22 | superlibrary vars | `EMBED_HOSTS` holds `https://app.superpipeline.dev`; the content Worker's `FRAME_ANCESTORS` holds it too (verified on `e01ebce`). |
| A23 | superlibrary PR #16 `feat/mark-and-html-sniff` | Merged before P4-APP: `apps/web/src/lib/Mark.svelte` (three spine rects, `fill: var(--mark, #ff7a59)`), `apps/web/src/lib/AppHeader.svelte` (`onsignout` prop), app.css `--accent #b04a1e`/`#ff7a59`, `--on-accent`, `--mark`. Not part of phases 2–3, but phase 4 builds on it. |

## Decisions and spec gaps

Items marked **OPERATOR** need the operator's yes. The plan implements the stated choice so work can proceed; each is one constant, condition or paragraph to change.

- **O1: OPERATOR. Who moderates.** The uploader of an artifact, or an owner of the workspace (plan D12 extended to every moderation act). A work record has no uploader (`created_by = source:superpipeline`), so only owners moderate records. Alternative: any member moderates records. One condition, `canManage`.
- **O2: OPERATOR. Collections are shared curation.** Any member may add or remove items in any collection of the workspace. Only its creator or an owner may rename or delete it. Collections are people-only; agents neither see nor use them.
- **O3: OPERATOR. Superpipeline vendors the embed SDK.** `@superlibrary/embed` is private and workspace-only, and Superpipeline has no cross-repo package path. Superlibrary builds one self-contained ES module plus hand-kept types (held equal to the source by a type test). Superpipeline commits them with a `VENDORED.json` naming the superlibrary commit and each file's SHA-256, checked by a test. Updating is one script. Alternative: publish to a private registry (needs a registry and a token in Superpipeline CI).
- **O4: OPERATOR. "Date" means last activity.** The date filter and the outcome views use an item's last activity: a card's last update for a work record, else its newest version, else its creation. Backfilled records would otherwise all read "created today".
- **O5: OPERATOR. Removing a work record is permanent for that card.** A tombstone (`removed_cards`) stops the card's later events from bringing the record back. Restoring it is a later feature (one row to delete).
- **O6: The drawer opens the first Superlibrary reference's preview automatically**; the others show on demand, so one drawer mints at most one grant until the person asks.
- **O7: OPERATOR. The suite switcher lists products with a settled address** (AgentPod console, Superpipeline, Superlibrary). Superwitness and Supermessage are listed in the token source with an empty `url` and are not shown until their addresses are set there. The list does not yet filter by the person's entitlements (the web app does not see `ent`).
- **O8: OPERATOR. The parent's address** in the footer link is `https://superjackfruit.com` (`SuiteFooter` `parentHref`), to confirm.
- **O9: The token source lives in this repository** (`design/tokens.toml`, generator `scripts/tokens.mjs`) shaped for extraction: `[suite.*]` and `[parent]` move to a suite package later and the app's `$kit` alias points there, with no change to app code. Supermessage's `design/tokens.toml` is read for naming only and not changed.
- **G1: A person's moderation survives the card's re-sync.** P5 rebuilds a record from the card on every event. Without care a sync would narrow a widened record, overwrite a person-set `superseded`, or re-create a removed record. Task 7 makes `syncCard` keep all three.
- **G2: A person-set replacement is any visible item.** Spec §11 "mark an item superseded by another". Stored on `items.superseded_by` (artifacts and records alike), with the prior outcome kept for undo. It joins the card-derived `supersedes` link wherever `supersededBy` is computed.
- **G3: Caption is for artifacts only** (spec §7: images are indexed by title, alt text and caption). It is indexed (extract) and shown.
- **G4: The Superpipeline host shows Share with widening** when the person may widen (it reads `GET /api/v1/me` and the item, both made CORS-readable for embedding hosts in Task 8).
- **G5: Search stays at most 25 results** (contract cap); browse pages by cursor at 50 (max 100). A query with words searches; an empty one browses, newest activity first.

## Review Focus

- **A loop of replacements** (a person marks A superseded by B, then B by A, or A by itself). A person expects a refusal in words, never two items each naming the other or a page that follows replacements forever. Test: Task 6, `refuses itself, a loop, and a replacement the person cannot see`.
- **A card event arriving after a person removed its record from memory.** A person expects the record to stay gone; P5's "every event is a re-sync" would otherwise re-create it a minute later. Test: Task 7, `a removed record stays removed when its card changes again`.
- **A card event after a person widened its record to the workspace.** A person expects it to stay visible to everyone; a re-sync would otherwise narrow it back to the board silently. Test: Task 7, `a record widened to the workspace stays widened after its card changes`.
- **Markup in agent-written text** (a title, snippet, comment or handoff containing `<img src=x onerror=…>` or `<script>`). A person expects to see the characters, never a rendered element, in the app and in the Superpipeline drawer. Tests: Task 12 `no {@html} and no innerHTML in the app`, Task 14 `a title with markup is shown as text`, Task 15 `comments and handoffs are text`, Task 23 `a snippet with markup is shown as text`.
- **"This month" for a person far from UTC.** A person in UTC+14 or UTC−7 expects "this month" to start at their own local midnight on the 1st. Test: Task 14, `periodRange starts a month at the person's local midnight`.

---

## Execution map

```
Task 0  reconcile against shipped phases 2–3 (after Stage 3 is complete)
  │
  ├─ PR P4-API   superlibrary feat/p4-api     1 → 2 → 3 → 4 → 5 → 6 → 7 → 8   (merge on green; CI deploys)
  ├─ PR P4-EMB   superlibrary feat/p4-embed   9 → 10                          (beside P4-API; merge on green)
  │       │ P4-API merged (and PR #16, the mark)
  ├─ PR P4-APP   superlibrary feat/p4-app     11 → 12 → 13 → 14 → 15 → 16 → 17 → 18 → 19   (merge on green)
  ├─ PR P4-CLI   superlibrary feat/p4-cli     20                                (beside P4-APP; merge on green)
  │       │ P4-API deployed and P4-EMB merged
  ├─ PR P4-SP    superpipeline feat/superlibrary-drawer   21 → 22 → 23          (stop at green CI; operator merges)
  │
Task 24 live checks (after every PR is deployed)
```

| PR | Repo | Branch | Tasks | Merge |
|---|---|---|---|---|
| P4-API | superlibrary | `feat/p4-api` | 1–8 | controller, on green |
| P4-EMB | superlibrary | `feat/p4-embed` | 9–10 | controller, on green |
| P4-APP | superlibrary | `feat/p4-app` | 11–19 | controller, on green |
| P4-CLI | superlibrary | `feat/p4-cli` | 20 | controller, on green |
| P4-SP | superpipeline | `feat/superlibrary-drawer` | 21–23 | **operator** (controller stops at green CI) |

Each branch starts with `git -C <repo> fetch origin && git -C <repo> worktree add -b <branch> /Users/rakeshgangwar/SuperJackfruit/.worktrees/<repo>-<branch-slug> origin/main`. Two controllers never share a worktree. The PR recipe, run in the worktree:

```bash
git push -u origin <branch>
gh pr create --title "<title>" --body "$(cat <<'EOF'
<what and why, which plan tasks>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

### Spec coverage owned by phase 4

| Spec | Task | Test name |
|---|---|---|
| §11 search with filters (kind, outcome, board, agent, station, date) | 1, 3, 14 | `filters by agent, station and last activity, in both the words and the meaning paths` |
| §11 item page: provenance, versions, related items | 15 | `the item page lists related items with their outcomes` (e2e) |
| §11 work-record timelines (stages, agents, handoffs, comments, artifacts) | 4, 15 | `a person reads the whole record with the artifacts it links`, `timelineOf orders attempts, comments and gates by time` |
| §3, §11 collections | 5, 17 | `create, list and add`, e2e `collections: create, add from the item page, remove` |
| §12 collection membership keeps an artifact | 5 | `collection membership counts as a reference for retention` |
| §11 views by outcome | 3, 18 | `an outcome view: everything rejected on one board this month` |
| §4, §11 widen scope (person only, audited) | 8, 16 (records), embed (artifacts) | `a record widened to the workspace stays widened…`, e2e `an owner shows a work record to everyone` |
| §11 mark superseded by another | 6, 16 | `supersede marks the outcome, names the replacement, and clears back` |
| §11 revoke item or version | existing (phase 1) | unchanged |
| §11 edit a caption | 6, 16 | `a caption is indexed, shown and audited` |
| §11 remove from memory with recorded reason | 7, 16 | `remove: a reason is required and recorded; an agent cannot` |
| §11 agents can never moderate | 5, 6, 7 | `an agent is refused` (each) |
| §11 confirmations in the page; 44 px and no sideways scroll on phones | 12, 16, 19 | `a required reason keeps the act disabled…`, `at 390px nothing scrolls sideways…` |
| §9 toolbar controls usable at phone width (operator review) | 9, 19 | `a labelled More panel holds every secondary control…`, e2e `no toolbar control is an icon alone` |
| Design direction A: tokens, kit, suite shell | 11, 12, 13 | `tokens.css … is exactly what design/tokens.toml generates`, `no colour or font literal anywhere in the app`, `the suite shell…` |
| §11 `suli search`, `collect`, `scope` | 20 | `the command table matches the switch` (extended) |
| §9, §11 Superpipeline drawer preview + Related prior work | 21–23 | `LibraryArtifact mounts the embed with the person's library token`, `RelatedWork lists the card's related items` |
| §15 every guard revert-proof | all | each task's revert step |

---

## File Structure

```
superlibrary/
  packages/contract/src/
    library.ts              ITEM_KINDS, COLLECTION_ID, LibraryFilters, BrowseQuery, BrowsePage,
                            Facets, Collection*, SupersedeBody, CaptionBody, RemoveBody,
                            WorkRecordView                                                 1
    retrieval.ts            SearchQuery gains agent, station, since, until                 1
    model.ts                ItemSummary.caption                                            1
    index.ts                re-export library                                              1
  packages/contract/test/library.test.ts                                                   1
  apps/api/
    migrations/0040_library.sql   items.caption/superseded_by/superseded_prior,
                            collections, collection_items, removed_cards, indexes          2
    src/library/filters.ts  activitySql, extraFilterSql, extraFilterBind                    3
    src/library/browse.ts   browse(): filtered, cursor-paged, outcome counts               3
    src/library/facets.ts   facets(): boards, agents, stations a person can filter by      3
    src/library/record.ts   recordView(): the WorkRecord with its visible artifacts        4
    src/library/collections.ts  collections CRUD + membership (+ item_references)          5
    src/library/moderation.ts   supersede, caption, remove from memory                     6, 7
    src/library/routes.ts   libraryRoutes (people only)                                    3–7
    src/search/search.ts    extra filters; supersededByMap joins items.superseded_by        3, 6
    src/items/routes.ts     export extrasFor; caption + supersededBy; CORS on reads        3, 6, 8
    src/items/visibility.ts ItemRow gains caption, superseded_by, superseded_prior          6
    src/indexing/extract.ts the caption is indexed                                         6
    src/lifecycle/retention.ts  deleteItem also clears collection_items                    5
    src/ingest/consumer.ts  syncCard keeps removed / widened / superseded                  7
    src/search/routes.ts    CORS on /related                                               8
    src/index.ts            libraryRoutes; CORS on /api/v1/me                              3, 8
    test/helpers/library.ts workspaceOf, knowBoard, recordBody, seedWorkRecord, call       3
    test/library-schema.test.ts, search-filters.test.ts, browse.test.ts, record.test.ts,
    collections.test.ts, moderation.test.ts, ingest-moderation.test.ts, cors.test.ts       2–8
  packages/embed/
    src/index.ts, src/style.ts, src/icons.ts  labelled phone toolbar (More), host hooks     9
    vite.bundle.config.ts   one self-contained ES module                                   10
    bundle/superlibrary-embed.d.ts  the public types, hand-kept                            10
    test/embed.test.ts, test/bundle.test.ts, test/bundle-types.ts                          9, 10
    README.md               phones, host hooks, "Hosts outside this repository"            9, 10
  design/tokens.toml        THE token source: suite, product, parent (provisional), products 11
  scripts/tokens.mjs, scripts/generate-tokens.mjs  generator with contrast contracts        11
  apps/web/src/lib/kit/     the suite design system's first instance ($kit)
    tokens.css, suite.generated.ts   generated                                             11
    kit.css                 kit styles and shared patterns, tokens only                    12
    Button, Field, Tabs, Toolbar, Icon, Toast, EmptyState, OutcomeBadge, ConfirmDialog
    (+ modal.ts, outcome.ts, index.ts)                                                     12
    SuiteHeader, SuiteSwitcher, SuiteFooter, ParentMark, theme.svelte.ts                   13
  apps/web/src/
    app.css                 phase-1 rules, now on tokens                                   11, 12
    lib/Mark.svelte, lib/AppHeader.svelte (PR #16)  the mark; the shell's first instance   11, 13
    lib/library.ts          filters in the address, period ranges, API calls, rows         14
    lib/FilterBar.svelte, lib/ResultList.svelte                                            14
    routes/+page.svelte     Library = search + browse                                      14
    lib/ItemHeader.svelte   title + one meta line + labelled actions                       15
    lib/record.ts, lib/WorkRecordView.svelte, lib/RelatedList.svelte                       15
    lib/ItemView.svelte     header, record branch, related, moderation, add to collection   12, 13, 15–17
    lib/moderation.ts, lib/ModerationPanel.svelte (+ kit ConfirmDialog required reason)    16
    lib/collections.ts, lib/AddToCollection.svelte, routes/collections/…                  17
    routes/outcomes/+page.svelte                                                           18
    routes/+layout.svelte   fonts, tokens, kit, shell, footer                              11–13
  apps/web/e2e/library.spec.ts, responsive.spec.ts, helpers.ts                             19
  packages/cli/src/library.ts, commands.ts, index.ts, artifacts.ts (exports)               20
  docs/reference/cli/library.md (generated)                                                20
superpipeline/
  apps/api/src/auth/plane-signin.ts  the Superlibrary-audience token (?library=1)          21
  apps/api/src/env.ts, apps/api/wrangler.jsonc  SUPERLIBRARY_AUDIENCE                      21
  apps/web/src/lib/hub-token.ts      libraryToken()                                        21
  apps/web/src/lib/vendor/superlibrary-embed/{superlibrary-embed.js,.d.ts,VENDORED.json}   22
  scripts/vendor-superlibrary-embed.sh                                                     22
  apps/web/src/lib/superlibrary.ts   libraryRef, libraryFetch, embedCallbacks, relatedForCard 22, 23
  apps/web/src/lib/components/card/LibraryArtifact.svelte                                  22
  apps/web/src/lib/components/card/RelatedWork.svelte                                      23
  apps/web/src/lib/components/CardDrawer.svelte                                            22, 23
```

---

## Design plan (apps/web)

A working direction (operator, 2026-10-09), not final, so the plan's first rule is that a change of mind is a token edit.

- **System:** suite direction A. Superlibrary is the first product on it; the shared layer is shaped for later extraction (decision O9), but this plan rolls nothing out to other products.
- **Palette (`design/tokens.toml`):** quiet neutrals (surface `#fbfbfd` / `#161618`, content `#1d1d1f` / `#f5f5f7`, three content rungs each held to its contrast); the product accent coral (`#b04a1e` on light grounds, `#ff7a59` on dark); seven outcome colours at 4.5:1 on every ground they sit on; the parent "Ink" neutrals (provisional) only where the parent appears. The generator refuses a colour that misses its contract.
- **Type:** IBM Plex Sans for headings and body, IBM Plex Mono for ids, paths, hashes and code; roles `label`, `meta`, `ui`, `ui-lg`, `body`, `title` (Supermessage's names plus a title).
- **Shell:** the suite rule — book-spine mark and "Superlibrary" left; Library, Outcomes, Collections, Upload; the Products switcher (parent hexagon mark) and the Account menu (theme, Sign out) right; on phones the nav is a full-width row of four under the brand row; the footer's "Super Jackfruit Labs" link carries the parent mark.
- **Layout:** one column at 390 px with filters folded into a `<details>` ("Filters · 2 on"); from 768 px they open as a wrapping row; the item page opens with the title and one meta line, then the viewer, then versions, details and provenance.
- **Signature: the outcome edge.** Every result row carries a 3 px rule in its outcome colour beside the outcome word, so a list reads at a glance as "mostly approved, two rejected"; the timeline repeats it vertically. Nothing else is decorated; the coral accent is for actions and the current place.
- **Structure encodes truth:** the timeline is an `<ol>` because order is the content; result lists are `<ul>`; no numbered markers elsewhere.
- **Motion:** only the kit's short state transitions (`--motion-quick`), none on load; reduced motion is respected by construction.
- **Copy:** sentence case, the act on the button ("Mark as superseded", "Remove from memory", "Add to collection"), refusals that say what to do ("Nothing here, or you cannot see it.").

---

## Task 0: Reconcile against shipped phases 2–3

Runs once, before any other task, after the phases 2–3 ledgers record Stage 3 complete. It changes no product code: it checks every assumed interface (A1–A22) against `origin/main` and edits this plan where they differ.

**Files:**
- Modify: `docs/superpowers/plans/2026-10-10-superlibrary-phase-4.md` (a new section "Reconciliation (Task 0)" before Task 1, and any task whose code an assumption changes)
- Create: `.superpowers/sdd/2026-10-10-superlibrary-phase-4/progress.md` (the phase-4 ledger)

**Interfaces:**
- Consumes: the phases 2–3 ledgers' `Ruling:` lines and their "Interfaces lanes depend on" section.
- Produces: a table `| Id | Assumed | Actual on origin/main (sha) | Plan change |` that every later task trusts over its own text.

- [ ] **Step 1: Confirm Stage 3 is complete and fetch**

```bash
cd /Users/rakeshgangwar/SuperJackfruit/superlibrary && git fetch origin
grep -n "STAGE 3 COMPLETE\|I4.*complete\|p23-integration" .superpowers/sdd/2026-10-10-superlibrary-phases-2-3/*.md
git log --oneline origin/main | head -20
gh pr list --repo SuperJackfruitLabs/superlibrary --state merged --limit 20
```
Expected: lane A (`feat/p2-sources`), lane B (`feat/p3-search`) and Stage 3 (`feat/p23-integration`) PRs merged. If Stage 3 is not complete, stop and report: phase 4 edits `search.ts`, `consumer.ts`, `items/routes.ts` and `retention.ts`, which Stage 3 may still change.

- [ ] **Step 2: Check each assumed interface**

Run each command; compare with the "Assumed shape" column above.

```bash
cd /Users/rakeshgangwar/SuperJackfruit/superlibrary
S() { git show "origin/main:$1"; }
# A1
S apps/api/src/search/search.ts | grep -n "export async function search\b\|export async function searchAudited\|export async function supersededByMap\|export async function visibleSupersededBy\|export async function sourcesOf\|export function ftsQuery\|chunks_fts MATCH ?8\|json_each(?8)\|const binds"
# A2
S apps/api/src/items/visibility.ts | grep -n "export"
# A3
S apps/api/src/items/routes.ts | grep -n "export function summary\|async function extrasFor\|export async function extrasFor\|function corsFor\|const ITEM ="
# A4, A5
S apps/api/src/search/routes.ts | grep -n "/api/v1/related\|/api/v1/search\|/api/v1/library"
S apps/api/src/search/related.ts | grep -n "export async function related\|work_records WHERE workspace_id"
# A6
S apps/api/src/ingest/consumer.ts | grep -n "export async function syncCard\|UPDATE items SET title\|existing?.digest === digest"
# A7
S apps/api/src/lifecycle/retention.ts | grep -n "export async function deleteItem\|DELETE FROM\|const STALE\|item_references"
# A8
S apps/api/src/http.ts | grep -n "export function"
# A9, A10
S apps/api/src/indexing/extract.ts | grep -n "const head\|return { text"
S apps/api/src/indexing/consumer.ts | grep -n "const digest"
# A11, A12, A13
git ls-tree --name-only origin/main apps/api/migrations/
S apps/api/src/ingest/consumer.ts | grep -n "item_references\|source_updated_at"
# A14
S packages/contract/src/retrieval.ts | grep -n "SearchQuery\|strict"
S packages/contract/src/model.ts | grep -n "audience\|supersededBy\|caption"
# A15
S apps/api/src/items/routes.ts | grep -n "station_name\|stationName"
# A16
for f in records fake-pipeline org-plane upload fake-vectors; do echo "== $f"; S apps/api/test/helpers/$f.ts | grep -n "^export"; done
# A17
S apps/api/src/mcp/tools.ts | grep -n "SearchQuery\|inputSchema"
# A18
S apps/api/src/auth/caller.ts | grep -n "principal_not_supported\|delegated_person"
# A19
S apps/api/src/index.ts | grep -n "const handlers\|/api/v1/me"
# A20 (superpipeline), A21 (accounts), A22
git -C ../superpipeline fetch origin && git -C ../superpipeline show origin/main:apps/api/src/auth/plane-signin.ts | grep -n "path === '/hub/token'\|const answer\|hubAudienceToken(cfg"
git -C ../accounts fetch origin && git -C ../accounts show origin/main:src/products/registry.ts | grep -n "superpipeline-web"
S apps/api/wrangler.jsonc | grep -n "EMBED_HOSTS"; S apps/content/wrangler.jsonc | grep -n "FRAME_ANCESTORS"
# A23
gh pr view 16 --repo SuperJackfruitLabs/superlibrary --json state -q .state; S apps/web/src/lib/Mark.svelte | grep -n "fill"; S apps/web/src/lib/AppHeader.svelte | head -5
```

- [ ] **Step 3: Record the table and fix the plan**

Add the section below before Task 1, one row per id, then edit every task whose code depends on a row marked different. Typical edits: bind numbers in Task 3 if A1's numbering moved; the `UPDATE items` statement in Task 7 if A6's changed; `export` of `extrasFor` in Task 3 if it is already exported; the CORS edits in Task 8 if A8's helpers already wrap the item routes.

```markdown
## Reconciliation (Task 0)

Checked on <date> against superlibrary origin/main <sha>, superpipeline <sha>, accounts <sha>.

| Id | Assumed | Actual | Plan change |
|---|---|---|---|
| A1 | … | ✅ same | — |
```

- [ ] **Step 4: Start the phase-4 ledger**

```bash
mkdir -p /Users/rakeshgangwar/SuperJackfruit/superlibrary/.superpowers/sdd/2026-10-10-superlibrary-phase-4
cat > /Users/rakeshgangwar/SuperJackfruit/superlibrary/.superpowers/sdd/2026-10-10-superlibrary-phase-4/progress.md <<'EOF'
# SDD ledger — plan: docs/superpowers/plans/2026-10-10-superlibrary-phase-4.md
Spec: docs/superpowers/specs/2026-10-09-superlibrary-design.md (binding).
Task 0: reconciliation recorded in the plan (section "Reconciliation (Task 0)").
EOF
```

- [ ] **Step 5: Commit the reconciled plan (on the P4-API branch, first commit)**

```bash
cd /Users/rakeshgangwar/SuperJackfruit/superlibrary && git fetch origin
git worktree add -b feat/p4-api /Users/rakeshgangwar/SuperJackfruit/.worktrees/superlibrary-p4-api origin/main
cd /Users/rakeshgangwar/SuperJackfruit/.worktrees/superlibrary-p4-api
# copy the edited plan into this worktree, then:
git add docs/superpowers/plans/2026-10-10-superlibrary-phase-4.md
git commit -m "docs(plan): phase 4 reconciled against shipped phases 2-3

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---

## Task 1: Contract: library filters, browse, collections, moderation, the record view

**Files:**
- Create: `packages/contract/src/library.ts`
- Modify: `packages/contract/src/retrieval.ts` (SearchQuery), `packages/contract/src/model.ts` (`ItemSummary.caption`), `packages/contract/src/index.ts`
- Test: `packages/contract/test/library.test.ts`

**Interfaces:**
- Consumes: `OUTCOMES`, `ItemSummary`, `Outcome` (model.ts), `ITEM_ID` (ids.ts), `BOARD_ID`, `PRN_ID` (provenance.ts), `WorkRecord` (work-record.ts). A14.
- Produces (every later task uses these names):
  - `ITEM_KINDS = ['artifact', 'work-record'] as const`, `type ItemKind`
  - `COLLECTION_ID = /^col_[0-9a-f]{16}$/`
  - `LibraryFilters` (zod shape: `kinds?`, `outcomes?`, `board?`, `agent?`, `station?`, `since?`, `until?`), `sinceBeforeUntil`, `SINCE_UNTIL`
  - `SearchQuery` = `{ query, ...LibraryFilters, limit }`, strict, refined
  - `BrowseQuery` = `{ ...LibraryFilters, collection?, limit (1–100, default 50), cursor? }`, strict, refined; `type BrowseQuery`
  - `OutcomeCounts = Record<Outcome, number>`, `BrowsePage { items: ItemSummary[]; next: string | null; counts: OutcomeCounts }`
  - `Facets { boards: {id,name}[]; agents: string[]; stations: {id, name: string|null}[] }`
  - `CollectionCreate`, `CollectionPatch`, `CollectionAdd`, `CollectionSummary`, `CollectionEntry`, `CollectionDetail`
  - `SupersedeBody { by: itm_ | null }`, `CaptionBody { caption: string | null }`, `RemoveBody { reason }`
  - `WorkRecordView { item: ItemSummary; record: WorkRecord; artifacts: ItemSummary[]; boardName: string | null }`
  - `ItemSummary.caption?: string | null`

- [ ] **Step 1: Write the failing test**

```ts
// packages/contract/test/library.test.ts
import { describe, expect, it } from 'vitest';
import { BrowseQuery, CaptionBody, CollectionAdd, CollectionCreate, CollectionPatch, RemoveBody, SearchQuery, SupersedeBody } from '../src';

const A = 'prn_000000000000000000a2';

describe('library filters (spec §11)', () => {
  it('search takes kind, outcome, board, agent, station and a date range', () => {
    const q = SearchQuery.parse({
      query: 'deploy', kinds: ['artifact'], outcomes: ['rejected'], board: 'brd_00000000000000b1', agent: A, station: 'stn-1',
      since: '2026-10-01T00:00:00.000Z', until: '2026-11-01T00:00:00.000Z',
    });
    expect(q).toMatchObject({ agent: A, station: 'stn-1', since: '2026-10-01T00:00:00.000Z', limit: 10 });
  });
  it('refuses a range that ends before or when it starts', () => {
    expect(SearchQuery.safeParse({ query: 'x', since: '2026-11-01T00:00:00.000Z', until: '2026-10-01T00:00:00.000Z' }).success).toBe(false);
    expect(BrowseQuery.safeParse({ since: '2026-11-01T00:00:00.000Z', until: '2026-11-01T00:00:00.000Z' }).success).toBe(false);
  });
  it('stays strict: an unknown filter is refused, never dropped (contract-boundary rule)', () => {
    expect(SearchQuery.safeParse({ query: 'x', owner: 'me' }).success).toBe(false);
    expect(BrowseQuery.safeParse({ query: 'x' }).success).toBe(false);
  });
  it('refuses an agent that is not a principal id and an empty station', () => {
    expect(SearchQuery.safeParse({ query: 'x', agent: 'some-agent' }).success).toBe(false);
    expect(BrowseQuery.safeParse({ station: '   ' }).success).toBe(false);
  });
  it('browse needs no words and pages at most 100', () => {
    expect(BrowseQuery.parse({})).toEqual({ limit: 50 });
    expect(BrowseQuery.safeParse({ limit: 101 }).success).toBe(false);
    expect(BrowseQuery.safeParse({ collection: 'col_0123456789abcdef', cursor: 'x' }).success).toBe(true);
    expect(BrowseQuery.safeParse({ collection: 'week-41' }).success).toBe(false);
  });
});

describe('collections and moderation bodies', () => {
  it('collections', () => {
    expect(CollectionCreate.parse({ name: ' Week 41 ' })).toEqual({ name: 'Week 41', description: '' });
    expect(CollectionCreate.safeParse({ name: '' }).success).toBe(false);
    expect(CollectionPatch.safeParse({}).success).toBe(false);
    expect(CollectionAdd.safeParse({ itemId: 'itm_0123456789abcdef', extra: 1 }).success).toBe(false);
  });
  it('moderation', () => {
    expect(SupersedeBody.safeParse({ by: null }).success).toBe(true);
    expect(SupersedeBody.safeParse({ by: 'itm_x' }).success).toBe(false);
    expect(CaptionBody.parse({ caption: '  A diagram of the queue  ' })).toEqual({ caption: 'A diagram of the queue' });
    expect(RemoveBody.safeParse({ reason: '  ' }).success).toBe(false);
    expect(RemoveBody.parse({ reason: 'posted by mistake' })).toEqual({ reason: 'posted by mistake' });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @superlibrary/contract test -- test/library.test.ts`
Expected: FAIL (`BrowseQuery` is not exported; `SearchQuery` refuses `agent`).

- [ ] **Step 3: Write the contract**

```ts
// packages/contract/src/library.ts
import { z } from 'zod';
import { ITEM_ID } from './ids';
import { OUTCOMES, type ItemSummary, type Outcome } from './model';
import { BOARD_ID, PRN_ID } from './provenance';
import type { WorkRecord } from './work-record';

export const ITEM_KINDS = ['artifact', 'work-record'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];
/** `col_` + 16 hex (`newId('col')`). */
export const COLLECTION_ID = /^col_[0-9a-f]{16}$/;

/**
 * Spec §11: what every library view filters by, beyond the words. `since`/`until` bound an item's
 * last activity (decision O4): a card's last update, else the newest version, else creation.
 */
export const LibraryFilters = {
  kinds: z.array(z.enum(ITEM_KINDS)).min(1).max(2).optional(),
  outcomes: z.array(z.enum(OUTCOMES)).min(1).max(7).optional(),
  board: z.string().regex(BOARD_ID).optional(),
  agent: z.string().regex(PRN_ID).optional(),
  /** The hub's station id, or its readable name. */
  station: z.string().trim().min(1).max(100).optional(),
  since: z.iso.datetime().optional(),
  until: z.iso.datetime().optional(),
};
export const sinceBeforeUntil = (q: { since?: string | undefined; until?: string | undefined }) =>
  !q.since || !q.until || Date.parse(q.since) < Date.parse(q.until);
export const SINCE_UNTIL = { message: 'since must be before until', path: ['until'] };

/** Browsing needs no words (spec §11 "views by outcome"). Newest activity first, cursor-paged. */
export const BrowseQuery = z
  .object({
    ...LibraryFilters,
    collection: z.string().regex(COLLECTION_ID).optional(),
    limit: z.number().int().min(1).max(100).default(50),
    cursor: z.string().min(1).max(200).optional(),
  })
  .strict()
  .refine(sinceBeforeUntil, SINCE_UNTIL);
export type BrowseQuery = z.infer<typeof BrowseQuery>;

export type OutcomeCounts = Record<Outcome, number>;
export interface BrowsePage {
  items: ItemSummary[];
  next: string | null;
  /** Per outcome, for the same filters without the outcome filter: what each outcome tab would show. */
  counts: OutcomeCounts;
}
/** What a person can filter by: only values from items they can see. */
export interface Facets {
  boards: Array<{ id: string; name: string }>;
  agents: string[];
  stations: Array<{ id: string; name: string | null }>;
}

export const CollectionCreate = z
  .object({ name: z.string().trim().min(1).max(120), description: z.string().trim().max(1000).default('') })
  .strict();
export const CollectionPatch = z
  .object({ name: z.string().trim().min(1).max(120).optional(), description: z.string().trim().max(1000).optional() })
  .strict()
  .refine((b) => b.name !== undefined || b.description !== undefined, { message: 'nothing to change' });
export const CollectionAdd = z.object({ itemId: z.string().regex(ITEM_ID), note: z.string().trim().max(500).optional() }).strict();

export interface CollectionSummary {
  id: string;
  name: string;
  description: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /** Items in it that this person can see (hidden ones are never counted, spec §4). */
  itemCount: number;
  /** Rename and delete: its creator or an owner (decision O2). */
  canEdit: boolean;
}
export interface CollectionEntry { item: ItemSummary; addedBy: string; addedAt: string; note: string | null }
export interface CollectionDetail extends CollectionSummary { entries: CollectionEntry[] }

/** Spec §11: mark superseded by another item; `null` undoes it. */
export const SupersedeBody = z.object({ by: z.string().regex(ITEM_ID).nullable() }).strict();
/** Spec §7, §11: an artifact's caption, indexed and shown; `null` or empty clears it. */
export const CaptionBody = z.object({ caption: z.string().trim().max(2000).nullable() }).strict();
/** Spec §11: remove from memory, with a recorded reason. */
export const RemoveBody = z.object({ reason: z.string().trim().min(3).max(500) }).strict();

/** Spec §11 "work-record timelines": the record, and the artifacts it links that the person can see. */
export interface WorkRecordView {
  item: ItemSummary;
  record: WorkRecord;
  artifacts: ItemSummary[];
  boardName: string | null;
}
```

In `packages/contract/src/retrieval.ts`, replace the `KINDS` constant and the `SearchQuery` definition:

```ts
import { ITEM_KINDS, LibraryFilters, SINCE_UNTIL, sinceBeforeUntil } from './library';

const KINDS = ITEM_KINDS;

export const SearchQuery = z
  .object({
    query: z.string().trim().min(1).max(1000),
    ...LibraryFilters,
    limit: z.number().int().min(1).max(25).default(10),
  })
  .strict()
  .refine(sinceBeforeUntil, SINCE_UNTIL);
export type SearchQuery = z.infer<typeof SearchQuery>;
```

In `packages/contract/src/model.ts`, add to `ItemSummary` after `supersededBy`:

```ts
  /** An artifact's caption, set by a person (spec §7, §11). Absent when there is none. */
  caption?: string | null;
```

In `packages/contract/src/index.ts`, add `export * from './library';`.

- [ ] **Step 4: Run the tests and typecheck**

Run: `pnpm --filter @superlibrary/contract test && pnpm -r typecheck`
Expected: PASS. If `apps/api/src/mcp/tools.ts` or `search.ts` read `SearchQuery.shape`, the refine keeps `.shape` in zod 4; a typecheck error there is fixed by reading `SearchQuery.shape` unchanged (record it in the report).

- [ ] **Step 5: Revert-proof**

Remove `.strict()` from `BrowseQuery`; run the test; expect `stays strict` to FAIL. Remove `.refine(sinceBeforeUntil, …)` from `SearchQuery`; expect `refuses a range` to FAIL. Restore both.

- [ ] **Step 6: Commit**

```bash
git add packages/contract/src/library.ts packages/contract/src/retrieval.ts packages/contract/src/model.ts packages/contract/src/index.ts packages/contract/test/library.test.ts
git commit -m "feat(contract): library filters, browse, collections, moderation and the record view

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---

## Task 2: D1 schema for the library app

**Files:**
- Create: `apps/api/migrations/0040_library.sql`
- Test: `apps/api/test/library-schema.test.ts`

**Interfaces:**
- Consumes: `items`, `workspaces`, `item_sources` (0001, 0004). A13.
- Produces: `items.caption`, `items.superseded_by`, `items.superseded_prior`; tables `collections`, `collection_items`, `removed_cards`; indexes for the filters.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/test/library-schema.test.ts
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

const WS = 'wsp_00000000000000e1';
const ensureWs = () => env.DB.prepare(`INSERT OR IGNORE INTO workspaces (id, external_source, external_id) VALUES (?, 'org-plane', 'org_000000000000000000e1')`).bind(WS).run();

describe('0040_library', () => {
  it('adds a caption and a person-set replacement to items', async () => {
    const cols = (await env.DB.prepare(`PRAGMA table_info(items)`).all<{ name: string }>()).results.map((c) => c.name);
    expect(cols).toEqual(expect.arrayContaining(['caption', 'superseded_by', 'superseded_prior']));
  });
  it('a collection name is unique in its workspace, ignoring case', async () => {
    await ensureWs();
    await env.DB.prepare(`INSERT INTO collections (id, workspace_id, name, created_by) VALUES ('col_00000000000000e1', ?, 'Week 41', 'prn_000000000000000000a1')`).bind(WS).run();
    await expect(
      env.DB.prepare(`INSERT INTO collections (id, workspace_id, name, created_by) VALUES ('col_00000000000000e2', ?, 'week 41', 'prn_000000000000000000a1')`).bind(WS).run(),
    ).rejects.toThrow(/UNIQUE/);
  });
  it('an item is in a collection once', async () => {
    await ensureWs();
    await env.DB.prepare(`INSERT INTO items (id, workspace_id, kind, title, scope, created_by) VALUES ('itm_00000000000000e1', ?, 'artifact', 't', 'workspace', 'prn_000000000000000000a1')`).bind(WS).run();
    await env.DB.prepare(`INSERT OR IGNORE INTO collections (id, workspace_id, name, created_by) VALUES ('col_00000000000000e3', ?, 'Other', 'prn_000000000000000000a1')`).bind(WS).run();
    const add = () => env.DB.prepare(`INSERT INTO collection_items (collection_id, item_id, added_by) VALUES ('col_00000000000000e3', 'itm_00000000000000e1', 'prn_000000000000000000a1')`).run();
    await add();
    await expect(add()).rejects.toThrow(/UNIQUE|PRIMARY/);
  });
  it('a removed card is remembered once per workspace', async () => {
    await ensureWs();
    const put = () => env.DB.prepare(`INSERT INTO removed_cards (workspace_id, card_id, item_id, reason, removed_by) VALUES (?, 'card_00000000000000e1', 'itm_00000000000000e9', 'duplicate', 'prn_000000000000000000a1')`).bind(WS).run();
    await put();
    await expect(put()).rejects.toThrow(/UNIQUE|PRIMARY/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @superlibrary/api test -- test/library-schema.test.ts`
Expected: FAIL (`no such table: collections`).

- [ ] **Step 3: Write the migration**

```sql
-- apps/api/migrations/0040_library.sql
-- Phase 4: the library app. Numbers 0040-0049 are phase 4's (Stage 3 owns 0030-0039).

-- Spec §7, §11: an artifact's caption, set by a person, indexed with its title.
ALTER TABLE items ADD COLUMN caption TEXT;
-- Spec §11: "mark an item superseded by another". The person's choice, kept beside the outcome it
-- replaced so it can be undone; the card's own `supersedes` link stays in work_records.
ALTER TABLE items ADD COLUMN superseded_by TEXT;
ALTER TABLE items ADD COLUMN superseded_prior TEXT;

-- Spec §3 Collection: a named set of items people curate. Membership also writes an
-- item_references row (from_kind 'collection'), which is what keeps an artifact past 30 days (§12).
CREATE TABLE collections (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX collections_name ON collections(workspace_id, name COLLATE NOCASE);

CREATE TABLE collection_items (
  collection_id TEXT NOT NULL REFERENCES collections(id),
  item_id TEXT NOT NULL REFERENCES items(id),
  note TEXT,
  added_by TEXT NOT NULL,
  added_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (collection_id, item_id)
);
CREATE INDEX collection_items_item ON collection_items(item_id);

-- Spec §11 "remove an item from memory": a work record removed by a person stays removed; the
-- card's later events must not bring it back (decision O5). The reason is also in the audit log.
CREATE TABLE removed_cards (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  card_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  removed_by TEXT NOT NULL,
  removed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (workspace_id, card_id)
);

-- The filters (spec §11): agent and station, and outcome views.
CREATE INDEX item_sources_agent ON item_sources(agent_principal);
CREATE INDEX items_workspace_outcome ON items(workspace_id, outcome);
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @superlibrary/api test -- test/library-schema.test.ts test/schema.test.ts test/foundation-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Revert-proof**

Delete `COLLATE NOCASE` from `collections_name`; expect `a collection name is unique…` to FAIL. Restore.

- [ ] **Step 6: Commit**

```bash
git add apps/api/migrations/0040_library.sql apps/api/test/library-schema.test.ts
git commit -m "feat(api): schema for collections, captions, person-set replacements and removed records

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---

## Task 3: Search filters, browse and facets

**Files:**
- Create: `apps/api/src/library/filters.ts`, `apps/api/src/library/browse.ts`, `apps/api/src/library/facets.ts`, `apps/api/src/library/routes.ts`, `apps/api/test/helpers/library.ts`
- Modify: `apps/api/src/search/search.ts` (A1), `apps/api/src/items/routes.ts` (export `extrasFor`, A3), `apps/api/src/index.ts` (A19)
- Test: `apps/api/test/search-filters.test.ts`, `apps/api/test/browse.test.ts`

**Interfaces:**
- Consumes: `search`, `SearchQuery` (A1, Task 1); `viewerScopes`, `visibleSql`, `visibleBinds`, `ItemRow` (A2); `summary`, `extrasFor` (A3); `resolvePerson` (A18); `audit`.
- Produces:
  - `activitySql(alias: string): string`, `extraFilterSql(alias: string, n: number): string`, `extraFilterBind(q: ExtraFilters): string`, `interface ExtraFilters { agent?; station?; since?; until? }`
  - `browse(env, p: Person, q: BrowseQuery): Promise<BrowsePage>`, `class BadCursor`
  - `facets(env, p: Person): Promise<Facets>`
  - `libraryRoutes: Handler` serving `POST /api/v1/browse`, `GET /api/v1/facets` (Tasks 4–7 add routes to it)
  - `export async function extrasFor(env, items: ItemRow[]): Promise<Map<string, Extras>>` from `items/routes.ts`
  - test helpers `workspaceOf(principal?)`, `knowBoard(ws, board?, name?)`, `recordBody(over?)`, `seedWorkRecord(o)`, `call(path, init?)`, `B1`, `B2`

- [ ] **Step 1: Write the shared test helpers**

```ts
// apps/api/test/helpers/library.ts
import { SELF, env } from 'cloudflare:test';
import type { WorkRecord } from '@superlibrary/contract';
import { API } from './upload';
import { HUMAN, devHeaders } from './org-plane';
import { seedRecord } from './records';

export const B1 = 'brd_00000000000000b1';
export const B2 = 'brd_00000000000000b2';

/** The dev person's workspace. The first person seen in a workspace is its owner. */
export async function workspaceOf(principal = HUMAN): Promise<string> {
  const res = await SELF.fetch(`${API}/api/v1/me`, { headers: devHeaders(principal) });
  return (await res.json<{ workspaceId: string }>()).workspaceId;
}

/** A board Superlibrary has subscribed to: people see its items (decision P4). */
export async function knowBoard(ws: string, board = B1, name = 'Marketing & Community'): Promise<void> {
  await env.DB.prepare(`INSERT OR REPLACE INTO source_boards (workspace_id, board_id, name, last_seen_at) VALUES (?, ?, ?, 't')`).bind(ws, board, name).run();
}

export function recordBody(over: Partial<WorkRecord> = {}): WorkRecord {
  return {
    schema: 'work-record/1', boardId: B1, cardId: 'card_00000000000000c1', title: 'Launch post', spec: { goal: 'Write the launch post' },
    state: 'completed', stage: 'publish', archivedAt: null, createdAt: '2026-10-01T09:00:00.000Z', updatedAt: '2026-10-03T17:00:00.000Z',
    handoffs: [
      { runId: 'run_00000000000000a1', stage: 'draft', agent: 'prn_000000000000000000a2', startedAt: '2026-10-01T10:00:00.000Z', endedAt: '2026-10-01T11:00:00.000Z', attempt: 1, status: 'failed', handoff: null, failureReason: 'timed out' },
      { runId: 'run_00000000000000a2', stage: 'draft', agent: 'prn_000000000000000000a2', startedAt: '2026-10-02T10:00:00.000Z', endedAt: '2026-10-02T11:00:00.000Z', attempt: 2, status: 'completed', handoff: { summary: 'Draft ready <b>for review</b>' }, failureReason: null },
    ],
    comments: [{ id: 'cmt_1', author: { kind: 'human', name: 'A person' }, body: 'Looks good <img src=x onerror=alert(1)>', createdAt: '2026-10-02T12:00:00.000Z' }],
    references: [],
    gates: [{ id: 'gate_1', stage: 'review', decision: 'approve', resolvedAt: '2026-10-03T09:00:00.000Z' }],
    supersededByCard: null, outcome: 'approved', redactions: [], truncated: false,
    ...over,
  };
}

/** A work record with a full body, in a person's workspace. */
export async function seedWorkRecord(o: { id: string; ws: string; board?: string; outcome?: string; title?: string; text?: string; body?: WorkRecord; updatedAt?: string }): Promise<void> {
  const board = o.board ?? B1;
  const body = o.body ?? recordBody({ boardId: board, title: o.title ?? 'Launch post', cardId: `card_${o.id.slice(4)}` });
  await seedRecord({ id: o.id, ws: o.ws, board, text: o.text ?? body.title, outcome: o.outcome ?? body.outcome, title: o.title ?? body.title });
  await env.DB.prepare(`UPDATE work_records SET body = ?, source_updated_at = ? WHERE item_id = ?`).bind(JSON.stringify(body), o.updatedAt ?? body.updatedAt, o.id).run();
}

/** A request as a person (DEV_AUTH) unless `headers` says otherwise. */
export function call(path: string, init: { method?: string; body?: unknown; principal?: string; headers?: Record<string, string> } = {}): Promise<Response> {
  const headers: Record<string, string> = { ...(init.headers ?? devHeaders(init.principal)) };
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  return SELF.fetch(`${API}${path}`, { method: init.method ?? 'GET', headers, ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}) });
}
```

- [ ] **Step 2: Write the failing filter test**

```ts
// apps/api/test/search-filters.test.ts
import { env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SearchQuery } from '@superlibrary/contract';
import { indexItem } from '../src/indexing/consumer';
import { setIndexingForTests } from '../src/indexing/vector-index';
import { search } from '../src/search/search';
import type { Person } from '../src/auth/caller';
import { fakeEmbedder, fakeVectorize } from './helpers/fake-vectors';
import { seedRecord } from './helpers/records';
import { knowBoard } from './helpers/library';

const WS = 'wsp_00000000000000f1';
const ORG = 'org_00000000000000000f01';
const A2 = 'prn_000000000000000000a2';
const person: Person = { kind: 'human', principalId: 'prn_000000000000000000a1', org: ORG, workspaceId: WS, role: 'member', act: null };

async function seed(id: string, o: { agent?: string; station?: string; stationName?: string; updatedAt: string }) {
  await seedRecord({ id, ws: WS, text: 'release notes for the payments service', title: `Notes ${id}` });
  await env.DB.prepare(`UPDATE item_sources SET agent_principal = ?, station = ?, station_name = ? WHERE item_id = ?`).bind(o.agent ?? null, o.station ?? null, o.stationName ?? null, id).run();
  await env.DB.prepare(`UPDATE work_records SET source_updated_at = ? WHERE item_id = ?`).bind(o.updatedAt, id).run();
  await indexItem(env, id);
}
const ids = async (q: Record<string, unknown>) => (await search(env, person, SearchQuery.parse({ query: 'release notes', ...q }))).map((r) => r.itemId).sort();

beforeEach(async () => {
  setIndexingForTests({ embedders: { 'workers-ai/bge-m3': fakeEmbedder() }, bindings: { a: fakeVectorize() } });
  await env.DB.prepare(`INSERT OR IGNORE INTO workspaces (id, external_source, external_id) VALUES (?, 'org-plane', ?)`).bind(WS, ORG).run();
  await knowBoard(WS);
});
afterEach(() => setIndexingForTests(null));

describe('search filters (spec §11)', () => {
  it('filters by agent, station and last activity, in both the words and the meaning paths', async () => {
    await seed('itm_00000000000000f1', { agent: A2, station: 'stn_01', stationName: 'docs-station', updatedAt: '2026-09-15T10:00:00.000Z' });
    await seed('itm_00000000000000f2', { updatedAt: '2026-10-15T10:00:00.000Z' });
    expect(await ids({})).toEqual(['itm_00000000000000f1', 'itm_00000000000000f2']);
    expect(await ids({ agent: A2 })).toEqual(['itm_00000000000000f1']);
    expect(await ids({ station: 'stn_01' })).toEqual(['itm_00000000000000f1']);
    expect(await ids({ station: 'docs-station' })).toEqual(['itm_00000000000000f1']);
    expect(await ids({ since: '2026-10-01T00:00:00.000Z' })).toEqual(['itm_00000000000000f2']);
    expect(await ids({ until: '2026-10-01T00:00:00.000Z' })).toEqual(['itm_00000000000000f1']);
    expect(await ids({ agent: 'prn_000000000000000000ff' })).toEqual([]);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm --filter @superlibrary/api test -- test/search-filters.test.ts`
Expected: FAIL (the agent filter returns both items).

- [ ] **Step 4: Write the filters and wire them into search**

```ts
// apps/api/src/library/filters.ts
/**
 * Spec §11 filters beyond kind, outcome and board, as SQL over an `items` alias. One JSON bind
 * (`?n`) carries all four, so each caller keeps its own numbering and never shifts the others'.
 */
export interface ExtraFilters { agent?: string | undefined; station?: string | undefined; since?: string | undefined; until?: string | undefined }

/** An item's last activity (decision O4): a card's last update, else its newest version, else its creation. */
export const activitySql = (a: string) =>
  `datetime(COALESCE((SELECT w.source_updated_at FROM work_records w WHERE w.item_id = ${a}.id), (SELECT MAX(v.created_at) FROM versions v WHERE v.item_id = ${a}.id), ${a}.created_at))`;

export function extraFilterSql(a: string, n: number): string {
  const p = (k: string) => `json_extract(?${n}, '$.${k}')`;
  return `AND (${p('agent')} IS NULL OR EXISTS (SELECT 1 FROM item_sources s WHERE s.item_id = ${a}.id AND s.agent_principal = ${p('agent')}))
    AND (${p('station')} IS NULL OR EXISTS (SELECT 1 FROM item_sources s WHERE s.item_id = ${a}.id AND (s.station = ${p('station')} OR s.station_name = ${p('station')})))
    AND (${p('since')} IS NULL OR ${activitySql(a)} >= datetime(${p('since')}))
    AND (${p('until')} IS NULL OR ${activitySql(a)} < datetime(${p('until')}))`;
}

export const extraFilterBind = (q: ExtraFilters) =>
  JSON.stringify({ agent: q.agent ?? null, station: q.station ?? null, since: q.since ?? null, until: q.until ?? null });
```

In `apps/api/src/search/search.ts` (A1), inside `search()`:

```ts
import { extraFilterBind, extraFilterSql } from '../library/filters';
// … after `const boardSql = …`:
  // ?9: agent, station and the activity range (spec §11), in both paths, before anything is ranked.
  const extraSql = extraFilterSql('i', 9);
  const filters = extraFilterBind(q);
```

Then in the FTS query append `${extraSql}` after `${boardSql}` and bind `.bind(...binds, match, filters)`; in the vector re-check query append `${extraSql}` after `${boardSql}` and bind `.bind(...binds, JSON.stringify(ids), filters)`.

- [ ] **Step 5: Run the filter test**

Run: `pnpm --filter @superlibrary/api test -- test/search-filters.test.ts test/search.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the failing browse test**

```ts
// apps/api/test/browse.test.ts
import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import type { BrowsePage, Facets } from '@superlibrary/contract';
import { AGENT, planeToken, withOrgPlane } from './helpers/org-plane';
import { B1, B2, call, knowBoard, seedWorkRecord, workspaceOf } from './helpers/library';

let ws: string;
beforeEach(async () => {
  ws = await workspaceOf();
  await knowBoard(ws, B1, 'Marketing & Community');
  await knowBoard(ws, B2, 'Build');
});
const browse = async (body: unknown) => {
  const res = await call('/api/v1/browse', { method: 'POST', body });
  expect(res.status).toBe(200);
  return res.json<BrowsePage>();
};

describe('browse (spec §11)', () => {
  it('lists newest activity first, pages with a cursor, and counts every outcome', async () => {
    // Each test uses its own board, so the suite holds whether or not storage is isolated per test.
    const BA = 'brd_000000000000a000';
    await knowBoard(ws, BA, 'Paging');
    await seedWorkRecord({ id: 'itm_00000000000001a1', ws, board: BA, outcome: 'approved', updatedAt: '2026-10-01T10:00:00.000Z' });
    await seedWorkRecord({ id: 'itm_00000000000001a2', ws, board: BA, outcome: 'rejected', updatedAt: '2026-10-02T10:00:00.000Z' });
    await seedWorkRecord({ id: 'itm_00000000000001a3', ws, board: BA, outcome: 'rejected', updatedAt: '2026-10-03T10:00:00.000Z' });
    const first = await browse({ limit: 2, kinds: ['work-record'], board: BA });
    expect(first.items.map((i) => i.id)).toEqual(['itm_00000000000001a3', 'itm_00000000000001a2']);
    expect(first.counts).toMatchObject({ approved: 1, rejected: 2, failed: 0 });
    const second = await browse({ limit: 2, kinds: ['work-record'], board: BA, cursor: first.next });
    expect(second.items.map((i) => i.id)).toEqual(['itm_00000000000001a1']);
    expect(second.next).toBeNull();
  });
  it('an outcome view: everything rejected on one board this month', async () => {
    const BB = 'brd_000000000000b000';
    await knowBoard(ws, BB, 'Outcome view');
    await seedWorkRecord({ id: 'itm_00000000000001b1', ws, board: BB, outcome: 'rejected', updatedAt: '2026-10-05T10:00:00.000Z' });
    await seedWorkRecord({ id: 'itm_00000000000001b2', ws, board: BB, outcome: 'rejected', updatedAt: '2026-09-30T23:00:00.000Z' });
    await seedWorkRecord({ id: 'itm_00000000000001b3', ws, board: B2, outcome: 'rejected', updatedAt: '2026-10-05T10:00:00.000Z' });
    await seedWorkRecord({ id: 'itm_00000000000001b4', ws, board: BB, outcome: 'approved', updatedAt: '2026-10-05T10:00:00.000Z' });
    const page = await browse({ outcomes: ['rejected'], board: BB, since: '2026-10-01T00:00:00.000Z', until: '2026-11-01T00:00:00.000Z' });
    expect(page.items.map((i) => i.id)).toEqual(['itm_00000000000001b1']);
    // Counts drop the outcome filter only: the approved one on the same board and month is counted.
    expect(page.counts).toMatchObject({ rejected: 1, approved: 1 });
  });
  it('never lists or counts what the person cannot see', async () => {
    const B3 = 'brd_00000000000000b3';   // a board Superlibrary does not know
    await seedWorkRecord({ id: 'itm_00000000000001c1', ws, board: B3, outcome: 'failed' });
    const page = await browse({ outcomes: ['failed'] });
    expect(page.items.map((i) => i.id)).not.toContain('itm_00000000000001c1');
    expect(page.counts.failed).toBe(0);
  });
  it('refuses a cursor it did not issue', async () => {
    const res = await call('/api/v1/browse', { method: 'POST', body: { cursor: "x' OR 1=1 --" } });
    expect(res.status).toBe(400);
  });
  it('an agent is refused (people only, P13)', async () => {
    await withOrgPlane(async () => {
      const t = await planeToken({ sub: AGENT, principalKind: 'agent' });
      const res = await call('/api/v1/browse', { method: 'POST', body: {}, headers: { Authorization: `Bearer ${t}` } });
      expect(res.status).toBe(403);
      expect((await call('/api/v1/facets', { headers: { Authorization: `Bearer ${t}` } })).status).toBe(403);
    });
  });
});

describe('facets', () => {
  it('offers the known boards by name, and only agents and stations of visible items', async () => {
    await seedWorkRecord({ id: 'itm_00000000000001d1', ws });
    await seedWorkRecord({ id: 'itm_00000000000001d2', ws, board: 'brd_00000000000000b3' });   // unknown board: hidden
    await env.DB.prepare(`UPDATE item_sources SET agent_principal = 'prn_000000000000000000a2', station = 'stn_01', station_name = 'docs-station' WHERE item_id = 'itm_00000000000001d1'`).run();
    await env.DB.prepare(`UPDATE item_sources SET agent_principal = 'prn_0000000000000000a9a9', station = 'stn_09' WHERE item_id = 'itm_00000000000001d2'`).run();
    const res = await call('/api/v1/facets');
    const f = await res.json<Facets>();
    const names = f.boards.map((b) => b.name);
    expect(names.indexOf('Build')).toBeLessThan(names.indexOf('Marketing & Community'));   // by name
    expect(f.boards).toEqual(expect.arrayContaining([{ id: B2, name: 'Build' }, { id: B1, name: 'Marketing & Community' }]));
    expect(f.agents).toContain('prn_000000000000000000a2');
    expect(f.agents).not.toContain('prn_0000000000000000a9a9');
    expect(f.stations).toContainEqual({ id: 'stn_01', name: 'docs-station' });
    expect(f.stations.map((s) => s.id)).not.toContain('stn_09');
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `pnpm --filter @superlibrary/api test -- test/browse.test.ts`
Expected: FAIL (404 on `/api/v1/browse`).

- [ ] **Step 8: Write browse, facets and the route group**

In `apps/api/src/items/routes.ts` change `async function extrasFor(` to `export async function extrasFor(`.

```ts
// apps/api/src/library/browse.ts
import { OUTCOMES, type BrowsePage, type BrowseQuery, type OutcomeCounts } from '@superlibrary/contract';
import type { Env } from '../env';
import type { Person } from '../auth/caller';
import { audit } from '../audit';
import { viewerScopes, visibleBinds, visibleSql, type ItemRow } from '../items/visibility';
import { extrasFor, summary } from '../items/routes';
import { activitySql, extraFilterBind, extraFilterSql } from './filters';

/** `<activity>|<item id>`, exactly as this server writes it; anything else is refused, never interpolated. */
const CURSOR = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\|(itm_[0-9a-f]{16})$/;
export class BadCursor extends Error {}

export async function browse(env: Env, p: Person, q: BrowseQuery): Promise<BrowsePage> {
  let after: [string | null, string | null] = [null, null];
  if (q.cursor) {
    const m = CURSOR.exec(q.cursor);
    if (!m) throw new BadCursor('cursor');
    after = [m[1]!, m[2]!];
  }
  const scopes = await viewerScopes(env, p);
  // ?1-?3 visibility (spec §4, first), ?4 now, ?5 kinds, ?6 board scope, ?7 collection, ?8 agent/station/activity.
  const where = `${visibleSql('i')} AND i.revoked_at IS NULL AND (i.expires_at IS NULL OR i.expires_at > ?4)
    AND (?5 IS NULL OR i.kind IN (SELECT value FROM json_each(?5)))
    AND (?6 IS NULL OR i.scope = ?6)
    AND (?7 IS NULL OR EXISTS (SELECT 1 FROM collection_items ci WHERE ci.item_id = i.id AND ci.collection_id = ?7))
    ${extraFilterSql('i', 8)}`;
  const binds = [
    ...visibleBinds(p, scopes), new Date().toISOString(), q.kinds ? JSON.stringify(q.kinds) : null,
    q.board ? `board:${q.board}` : null, q.collection ?? null, extraFilterBind(q),
  ] as const;
  const act = activitySql('i');
  const rows = (await env.DB.prepare(
    `SELECT i.*, ${act} AS activity_at FROM items i WHERE ${where}
       AND (?9 IS NULL OR i.outcome IN (SELECT value FROM json_each(?9)))
       AND (?10 IS NULL OR ${act} < ?10 OR (${act} = ?10 AND i.id < ?11))
     ORDER BY activity_at DESC, i.id DESC LIMIT ?12`,
  ).bind(...binds, q.outcomes ? JSON.stringify(q.outcomes) : null, after[0], after[1], q.limit + 1).all<ItemRow & { activity_at: string }>()).results;
  // Counts use the same filters without the outcome filter: what each outcome tab would show.
  const counted = (await env.DB.prepare(`SELECT i.outcome AS outcome, COUNT(*) AS n FROM items i WHERE ${where} GROUP BY i.outcome`)
    .bind(...binds).all<{ outcome: string; n: number }>()).results;
  const counts = Object.fromEntries(OUTCOMES.map((o) => [o, 0])) as OutcomeCounts;
  for (const c of counted) if (c.outcome in counts) counts[c.outcome as keyof OutcomeCounts] = c.n;
  const page = rows.slice(0, q.limit);
  const extras = await extrasFor(env, page);
  const last = page.at(-1);
  await audit(env.DB, { workspaceId: p.workspaceId, actor: p.principalId, act: p.act, action: 'items.browsed', detail: { count: page.length } }).run();
  return {
    items: page.map((i) => summary(i, extras.get(i.id))),
    next: rows.length > q.limit && last ? `${last.activity_at}|${last.id}` : null,
    counts,
  };
}
```

```ts
// apps/api/src/library/facets.ts
import type { Facets } from '@superlibrary/contract';
import type { Env } from '../env';
import type { Person } from '../auth/caller';
import { viewerScopes, visibleBinds, visibleSql } from '../items/visibility';

const LIVE = `i.revoked_at IS NULL AND (i.expires_at IS NULL OR i.expires_at > ?4)`;

/** What a person can filter by. Agents and stations come only from items they can see (spec §4). */
export async function facets(env: Env, p: Person): Promise<Facets> {
  const scopes = await viewerScopes(env, p);
  const vis = [...visibleBinds(p, scopes), new Date().toISOString()] as const;
  const boards = (await env.DB.prepare(`SELECT board_id AS id, name FROM source_boards WHERE workspace_id = ? ORDER BY name COLLATE NOCASE, board_id`)
    .bind(p.workspaceId).all<{ id: string; name: string }>()).results;
  const agents = (await env.DB.prepare(
    `SELECT DISTINCT s.agent_principal AS a FROM item_sources s JOIN items i ON i.id = s.item_id
      WHERE ${visibleSql('i')} AND ${LIVE} AND s.agent_principal IS NOT NULL ORDER BY 1 LIMIT 200`,
  ).bind(...vis).all<{ a: string }>()).results.map((r) => r.a);
  const stations = (await env.DB.prepare(
    `SELECT s.station AS id, MAX(s.station_name) AS name FROM item_sources s JOIN items i ON i.id = s.item_id
      WHERE ${visibleSql('i')} AND ${LIVE} AND s.station IS NOT NULL
      GROUP BY s.station ORDER BY COALESCE(MAX(s.station_name), s.station) COLLATE NOCASE LIMIT 200`,
  ).bind(...vis).all<{ id: string; name: string | null }>()).results;
  return { boards, agents, stations };
}
```

```ts
// apps/api/src/library/routes.ts
import { BrowseQuery } from '@superlibrary/contract';
import { error, json, type Handler } from '../http';
import { resolvePerson } from '../auth/caller';
import { BadCursor, browse } from './browse';
import { facets } from './facets';

export const issues = (e: { issues: Array<{ path: PropertyKey[]; message: string }> }) =>
  e.issues.map((i) => ({ path: i.path.map(String).join('.'), message: i.message }));

/**
 * The library app's routes (phase 4). People only: agents read through search, get, related and
 * MCP (P13, ruling B-R5), and `resolvePerson` refuses them here.
 */
export const libraryRoutes: Handler = async (request, env, _ctx, url) => {
  if (url.pathname === '/api/v1/browse' && request.method === 'POST') {
    const p = await resolvePerson(request, env);
    if (p instanceof Response) return p;
    const q = BrowseQuery.safeParse(await request.json().catch(() => null));
    if (!q.success) return error(400, 'invalid', { issues: issues(q.error) });
    try {
      return json(await browse(env, p, q.data));
    } catch (e) {
      if (e instanceof BadCursor) return error(400, 'invalid', { detail: 'cursor is not one this server issued' });
      throw e;
    }
  }
  if (url.pathname === '/api/v1/facets' && request.method === 'GET') {
    const p = await resolvePerson(request, env);
    return p instanceof Response ? p : json(await facets(env, p));
  }
  return null;
};
```

In `apps/api/src/index.ts` (A19): `import { libraryRoutes } from './library/routes';` and `const handlers: Handler[] = [uploadRoutes, itemRoutes, searchRoutes, sourceRoutes, libraryRoutes];`.

- [ ] **Step 9: Run the tests**

Run: `pnpm --filter @superlibrary/api test -- test/browse.test.ts test/search-filters.test.ts && pnpm --filter @superlibrary/api test && pnpm -r typecheck`
Expected: PASS.

- [ ] **Step 10: Revert-proof**

1. Remove `${extraSql}` from the FTS query only; run `search-filters`; expect FAIL. Restore. Remove it from the vector re-check only; expect FAIL. Restore.
2. Replace `${visibleSql('i')}` in `browse`'s `where` with `i.workspace_id = ?1`; expect `never lists or counts what the person cannot see` to FAIL. Restore.
3. Remove the `CURSOR.exec` check (use the raw split); expect `refuses a cursor it did not issue` to FAIL. Restore.

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/library apps/api/src/search/search.ts apps/api/src/items/routes.ts apps/api/src/index.ts apps/api/test/helpers/library.ts apps/api/test/search-filters.test.ts apps/api/test/browse.test.ts
git commit -m "feat(api): search filters by agent, station and activity; browse with outcome counts; facets

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---
## Task 4: The work-record view

**Files:**
- Create: `apps/api/src/library/record.ts`
- Modify: `apps/api/src/library/routes.ts`
- Test: `apps/api/test/record.test.ts`

**Interfaces:**
- Consumes: `loadItem`, `viewerScopes`, `canSee`, `visibleSql`, `visibleBinds` (A2); `summary`, `extrasFor` (A3, Task 3); `work_records.body` (A11); `item_references` (`from_kind 'work-record'`, A11); `source_boards.name` (A12).
- Produces: `GET /api/v1/items/:id/record` → `WorkRecordView` (Task 1). `recordView(env, p: Person, id: string): Promise<Response>`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/test/record.test.ts
import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import type { WorkRecordView } from '@superlibrary/contract';
import { AGENT, HUMAN_2, devHeaders, planeToken, withOrgPlane } from './helpers/org-plane';
import { upload } from './helpers/upload';
import { B1, call, knowBoard, seedWorkRecord, workspaceOf } from './helpers/library';

let ws: string;
beforeEach(async () => {
  ws = await workspaceOf();
  await knowBoard(ws, B1, 'Marketing & Community');
});
const linkTo = (recordId: string, itemId: string) =>
  env.DB.prepare(`INSERT OR IGNORE INTO item_references (item_id, from_kind, from_id) VALUES (?, 'work-record', ?)`).bind(itemId, recordId).run();

describe('the work-record view (spec §11 "work-record timelines")', () => {
  it('a person reads the whole record with the artifacts it links that they can see', async () => {
    await seedWorkRecord({ id: 'itm_00000000000002a1', ws });
    const mine = await upload([{ path: 'post.md', body: '# Launch' }], { title: 'Launch draft' });
    const hidden = await upload([{ path: 'x.md', body: '# x' }], { title: 'Not yours', scope: 'board:brd_00000000000000b9', headers: devHeaders(HUMAN_2) });
    await linkTo('itm_00000000000002a1', mine.body.itemId);
    await linkTo('itm_00000000000002a1', hidden.body.itemId);
    const res = await call('/api/v1/items/itm_00000000000002a1/record');
    expect(res.status).toBe(200);
    const v = await res.json<WorkRecordView>();
    expect(v.item).toMatchObject({ id: 'itm_00000000000002a1', kind: 'work-record' });
    expect(v.boardName).toBe('Marketing & Community');
    expect(v.record.handoffs.map((h) => [h.stage, h.attempt, h.status])).toEqual([['draft', 1, 'failed'], ['draft', 2, 'completed']]);
    expect(v.record.comments[0]!.body).toContain('<img src=x');   // stored as text; the app renders it as text
    expect(v.artifacts.map((a) => a.id)).toEqual([mine.body.itemId]);
    const audited = await env.DB.prepare(`SELECT detail FROM audit_events WHERE item_id = ? AND action = 'item.read' ORDER BY rowid DESC LIMIT 1`).bind('itm_00000000000002a1').first<{ detail: string }>();
    expect(JSON.parse(audited!.detail)).toEqual({ via: 'record' });
  });
  it('an artifact is not a work record', async () => {
    const a = await upload([{ path: 'a.md', body: '# a' }], { title: 'An artifact' });
    expect((await call(`/api/v1/items/${a.body.itemId}/record`)).status).toBe(404);
  });
  it('a record on a board the person cannot see is not found', async () => {
    await seedWorkRecord({ id: 'itm_00000000000002a2', ws, board: 'brd_00000000000000b9' });
    expect((await call('/api/v1/items/itm_00000000000002a2/record')).status).toBe(404);
  });
  it('an agent is refused', async () => {
    await seedWorkRecord({ id: 'itm_00000000000002a3', ws });
    await withOrgPlane(async () => {
      const t = await planeToken({ sub: AGENT, principalKind: 'agent' });
      expect((await call('/api/v1/items/itm_00000000000002a3/record', { headers: { Authorization: `Bearer ${t}` } })).status).toBe(403);
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @superlibrary/api test -- test/record.test.ts`
Expected: FAIL (404 for the first test: no route).

- [ ] **Step 3: Write the view**

```ts
// apps/api/src/library/record.ts
import type { WorkRecord, WorkRecordView } from '@superlibrary/contract';
import type { Env } from '../env';
import type { Person } from '../auth/caller';
import { audit } from '../audit';
import { error, json } from '../http';
import { canSee, loadItem, viewerScopes, visibleBinds, visibleSql, type ItemRow } from '../items/visibility';
import { extrasFor, summary } from '../items/routes';

/** The whole record, and the artifacts it links that the person can see. Invisible is 404 (D11). */
export async function recordView(env: Env, p: Person, id: string): Promise<Response> {
  const item = await loadItem(env, id);
  const scopes = item ? await viewerScopes(env, p) : [];
  if (!item || item.kind !== 'work-record' || !canSee(p, item, scopes)) return error(404, 'not_found');
  if (item.revoked_at) return error(410, 'revoked');
  const w = await env.DB.prepare(`SELECT body, board_id FROM work_records WHERE item_id = ?`).bind(id).first<{ body: string; board_id: string }>();
  if (!w) return error(404, 'not_found');
  const linked = (await env.DB.prepare(
    `SELECT i.* FROM item_references r JOIN items i ON i.id = r.item_id
      WHERE r.from_kind = 'work-record' AND r.from_id = ?5 AND ${visibleSql('i')}
        AND i.revoked_at IS NULL AND (i.expires_at IS NULL OR i.expires_at > ?4)
      ORDER BY i.created_at, i.id`,
  ).bind(...visibleBinds(p, scopes), new Date().toISOString(), id).all<ItemRow>()).results;
  const board = await env.DB.prepare(`SELECT name FROM source_boards WHERE workspace_id = ? AND board_id = ?`).bind(item.workspace_id, w.board_id).first<{ name: string }>();
  const extras = await extrasFor(env, [item, ...linked]);
  await audit(env.DB, { workspaceId: p.workspaceId, actor: p.principalId, act: p.act, action: 'item.read', itemId: id, detail: { via: 'record' } }).run();
  const view: WorkRecordView = {
    item: summary(item, extras.get(item.id)),
    record: JSON.parse(w.body) as WorkRecord,
    artifacts: linked.map((a) => summary(a, extras.get(a.id))),
    boardName: board?.name ?? null,
  };
  return json(view);
}
```

In `apps/api/src/library/routes.ts`, add before `return null;`:

```ts
  const rec = /^\/api\/v1\/items\/(itm_[0-9a-f]{16})\/record$/.exec(url.pathname);
  if (rec && request.method === 'GET') {
    const p = await resolvePerson(request, env);
    return p instanceof Response ? p : recordView(env, p, rec[1]!);
  }
```

and `import { recordView } from './record';`.

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @superlibrary/api test -- test/record.test.ts`
Expected: PASS.

- [ ] **Step 5: Revert-proof**

Remove `AND ${visibleSql('i')}` from the `linked` query (and its binds stay); expect `…the artifacts it links that they can see` to FAIL (the hidden artifact appears). Restore. Remove `item.kind !== 'work-record' ||`; expect `an artifact is not a work record` to FAIL. Restore.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/library/record.ts apps/api/src/library/routes.ts apps/api/test/record.test.ts
git commit -m "feat(api): the work-record view, with the artifacts it links that the person can see

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---

## Task 5: Collections, and membership as a reference for retention

**Files:**
- Create: `apps/api/src/library/collections.ts`
- Modify: `apps/api/src/library/routes.ts`, `apps/api/src/lifecycle/retention.ts` (A7: `deleteItem` clears `collection_items`)
- Test: `apps/api/test/collections.test.ts`

**Interfaces:**
- Consumes: `CollectionCreate`, `CollectionPatch`, `CollectionAdd`, `CollectionSummary`, `CollectionDetail` (Task 1); `newId` (ids.ts); `loadItem`, `viewerScopes`, `canSee`, `isExpired`, `visibleSql`, `visibleBinds` (A2); `summary`, `extrasFor` (A3); `sweep`, `deleteItem` (A7).
- Produces routes (people only):
  - `GET /api/v1/collections` → `{ collections: CollectionSummary[] }`
  - `POST /api/v1/collections` → `201 CollectionSummary`; `409 name_taken`
  - `GET /api/v1/collections/:id` → `CollectionDetail`
  - `PATCH /api/v1/collections/:id` → `CollectionSummary` (creator or owner, else `403 not_permitted`)
  - `DELETE /api/v1/collections/:id` → `204` (creator or owner)
  - `POST /api/v1/collections/:id/items { itemId, note? }` → `201 { added: true }` (any member; the item must be visible and live, else `404`)
  - `DELETE /api/v1/collections/:id/items/:itemId` → `204`
  - Every write audited: `collection.created|renamed|deleted|item_added|item_removed`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/test/collections.test.ts
import { env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CollectionDetail, CollectionSummary } from '@superlibrary/contract';
import { sweep } from '../src/lifecycle/retention';
import { AGENT, HUMAN_2, devHeaders, planeToken, withOrgPlane } from './helpers/org-plane';
import { upload } from './helpers/upload';
import { call, workspaceOf } from './helpers/library';

const bag = env as unknown as Record<string, unknown>;
let ws: string;
beforeEach(async () => { ws = await workspaceOf(); await workspaceOf(HUMAN_2); });
afterEach(() => { bag.RETENTION_MODE = 'report'; });

const create = async (name: string, principal?: string) => {
  const res = await call('/api/v1/collections', { method: 'POST', body: { name }, ...(principal ? { principal } : {}) });
  return { status: res.status, body: await res.json<CollectionSummary & { error?: string }>() };
};
const add = (col: string, itemId: string, principal?: string) => call(`/api/v1/collections/${col}/items`, { method: 'POST', body: { itemId }, ...(principal ? { principal } : {}) });
const detail = async (col: string) => (await call(`/api/v1/collections/${col}`)).json<CollectionDetail>();

describe('collections (spec §3, §11)', () => {
  it('create, list and add; the name is unique ignoring case', async () => {
    const c = await create('Building in public — week 41');
    expect(c.status).toBe(201);
    expect(c.body).toMatchObject({ name: 'Building in public — week 41', itemCount: 0, canEdit: true });
    expect((await create('building in public — WEEK 41')).status).toBe(409);
    const a = await upload([{ path: 'a.md', body: '# A' }], { title: 'A' });
    expect((await add(c.body.id, a.body.itemId)).status).toBe(201);
    expect((await add(c.body.id, a.body.itemId)).status).toBe(201);   // idempotent
    const list = await (await call('/api/v1/collections')).json<{ collections: CollectionSummary[] }>();
    expect(list.collections.find((x) => x.id === c.body.id)!.itemCount).toBe(1);
    const d = await detail(c.body.id);
    expect(d.entries.map((e) => e.item.id)).toEqual([a.body.itemId]);
    const audited = await env.DB.prepare(`SELECT COUNT(*) AS n FROM audit_events WHERE action = 'collection.item_added' AND item_id = ?`).bind(a.body.itemId).first<{ n: number }>();
    expect(audited!.n).toBeGreaterThanOrEqual(1);
  });
  it('an item the person cannot see is not found, and nothing is stored', async () => {
    const c = await create('Hidden test');
    const theirs = await upload([{ path: 'x.md', body: '# x' }], { title: 'X', scope: 'board:brd_00000000000000b9', headers: devHeaders(HUMAN_2) });
    expect((await add(c.body.id, theirs.body.itemId)).status).toBe(404);
    const row = await env.DB.prepare(`SELECT 1 FROM item_references WHERE item_id = ? AND from_kind = 'collection'`).bind(theirs.body.itemId).first();
    expect(row).toBeNull();
  });
  it('a collection hides an entry once its item is revoked, and never counts it', async () => {
    const c = await create('Revoked test');
    const a = await upload([{ path: 'r.md', body: '# r' }], { title: 'R' });
    await add(c.body.id, a.body.itemId);
    await call(`/api/v1/items/${a.body.itemId}/revoke`, { method: 'POST', body: {} });
    expect((await detail(c.body.id)).entries).toEqual([]);
    expect((await detail(c.body.id)).itemCount).toBe(0);
  });
  it('any member adds; only the creator or an owner renames or deletes (decision O2)', async () => {
    const c = await create('Owner made');                       // HUMAN is the owner
    const a = await upload([{ path: 'm.md', body: '# m' }], { title: 'M', headers: devHeaders(HUMAN_2) });
    expect((await add(c.body.id, a.body.itemId, HUMAN_2)).status).toBe(201);
    expect((await call(`/api/v1/collections/${c.body.id}`, { method: 'PATCH', body: { name: 'Renamed' }, principal: HUMAN_2 })).status).toBe(403);
    expect((await call(`/api/v1/collections/${c.body.id}`, { method: 'DELETE', principal: HUMAN_2 })).status).toBe(403);
    const theirs = await create('Member made', HUMAN_2);
    expect((await call(`/api/v1/collections/${theirs.body.id}`, { method: 'PATCH', body: { name: 'Renamed by owner' } })).status).toBe(200);
    expect((await call(`/api/v1/collections/${theirs.body.id}`, { method: 'DELETE' })).status).toBe(204);
    expect(await env.DB.prepare(`SELECT 1 FROM item_references WHERE from_kind = 'collection' AND from_id = ?`).bind(theirs.body.id).first()).toBeNull();
  });
  it('an agent is refused', async () => {
    await withOrgPlane(async () => {
      const t = await planeToken({ sub: AGENT, principalKind: 'agent' });
      expect((await call('/api/v1/collections', { headers: { Authorization: `Bearer ${t}` } })).status).toBe(403);
    });
  });
});

describe('retention (spec §12)', () => {
  it('collection membership counts as a reference for retention', async () => {
    const c = await create('Keep these');
    const a = await upload([{ path: 'keep.md', body: '# keep' }], { title: 'Keep' });
    await add(c.body.id, a.body.itemId);
    bag.RETENTION_MODE = 'enforce';
    const later = Date.now() + 31 * 86_400_000;
    await sweep(env, later);
    expect(await env.DB.prepare(`SELECT 1 FROM items WHERE id = ?`).bind(a.body.itemId).first()).not.toBeNull();
    expect((await call(`/api/v1/collections/${c.body.id}/items/${a.body.itemId}`, { method: 'DELETE' })).status).toBe(204);
    await sweep(env, later);
    expect(await env.DB.prepare(`SELECT 1 FROM items WHERE id = ?`).bind(a.body.itemId).first()).toBeNull();
  });
  it('deleting an item takes it out of every collection', async () => {
    const c = await create('Delete test');
    const a = await upload([{ path: 'd.md', body: '# d' }], { title: 'D', expiresAt: new Date(Date.now() + 86_400_000).toISOString() });
    await add(c.body.id, a.body.itemId);
    await sweep(env, Date.now() + 2 * 86_400_000);   // expired: deleted in every mode
    expect(await env.DB.prepare(`SELECT 1 FROM collection_items WHERE item_id = ?`).bind(a.body.itemId).first()).toBeNull();
    expect((await detail(c.body.id)).entries).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @superlibrary/api test -- test/collections.test.ts`
Expected: FAIL (404 on `/api/v1/collections`).

- [ ] **Step 3: Write collections**

```ts
// apps/api/src/library/collections.ts
import { CollectionAdd, CollectionCreate, CollectionPatch, type CollectionDetail, type CollectionSummary } from '@superlibrary/contract';
import type { Env } from '../env';
import type { Person } from '../auth/caller';
import { newId } from '../ids';
import { audit } from '../audit';
import { error, json } from '../http';
import { canSee, isExpired, loadItem, viewerScopes, visibleBinds, visibleSql, type ItemRow } from '../items/visibility';
import { extrasFor, summary } from '../items/routes';
import { issues } from './routes';

interface ColRow { id: string; workspace_id: string; name: string; description: string; created_by: string; created_at: string; updated_at: string }

/** Rename and delete (decision O2). Adding and removing items is any member's. */
const canEdit = (p: Person, c: ColRow) => c.created_by === p.principalId || p.role === 'owner';
const LIVE = `i.revoked_at IS NULL AND (i.expires_at IS NULL OR i.expires_at > ?4)`;

const summaryOf = (p: Person, c: ColRow, itemCount: number): CollectionSummary => ({
  id: c.id, name: c.name, description: c.description, createdBy: c.created_by, createdAt: c.created_at, updatedAt: c.updated_at, itemCount, canEdit: canEdit(p, c),
});

/** Visible, live items per collection: a hidden item is never counted (spec §4). */
async function visibleCounts(env: Env, p: Person, scopes: string[], ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const rows = (await env.DB.prepare(
    `SELECT ci.collection_id AS id, COUNT(*) AS n FROM collection_items ci JOIN items i ON i.id = ci.item_id
      WHERE ${visibleSql('i')} AND ${LIVE} AND ci.collection_id IN (SELECT value FROM json_each(?5)) GROUP BY ci.collection_id`,
  ).bind(...visibleBinds(p, scopes), new Date().toISOString(), JSON.stringify(ids)).all<{ id: string; n: number }>()).results;
  return new Map(rows.map((r) => [r.id, r.n]));
}

export const loadCollection = (env: Env, p: Person, id: string) =>
  env.DB.prepare(`SELECT * FROM collections WHERE id = ? AND workspace_id = ?`).bind(id, p.workspaceId).first<ColRow>();

export async function listCollections(env: Env, p: Person): Promise<Response> {
  const rows = (await env.DB.prepare(`SELECT * FROM collections WHERE workspace_id = ? ORDER BY updated_at DESC, id DESC LIMIT 500`).bind(p.workspaceId).all<ColRow>()).results;
  const counts = await visibleCounts(env, p, await viewerScopes(env, p), rows.map((r) => r.id));
  return json({ collections: rows.map((r) => summaryOf(p, r, counts.get(r.id) ?? 0)) });
}

export async function createCollection(request: Request, env: Env, p: Person): Promise<Response> {
  const b = CollectionCreate.safeParse(await request.json().catch(() => null));
  if (!b.success) return error(400, 'invalid', { issues: issues(b.error) });
  const id = newId('col');
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO collections (id, workspace_id, name, description, created_by) VALUES (?, ?, ?, ?, ?)`).bind(id, p.workspaceId, b.data.name, b.data.description, p.principalId),
      audit(env.DB, { workspaceId: p.workspaceId, actor: p.principalId, act: p.act, action: 'collection.created', detail: { collection: id, name: b.data.name } }),
    ]);
  } catch (e) {
    if (e instanceof Error && /UNIQUE/.test(e.message)) return error(409, 'name_taken', { detail: 'a collection with that name already exists' });
    throw e;
  }
  return json(summaryOf(p, (await loadCollection(env, p, id))!, 0), 201);
}

export async function collectionDetail(env: Env, p: Person, c: ColRow): Promise<Response> {
  const scopes = await viewerScopes(env, p);
  const rows = (await env.DB.prepare(
    `SELECT i.*, ci.added_by AS ci_added_by, ci.added_at AS ci_added_at, ci.note AS ci_note FROM collection_items ci JOIN items i ON i.id = ci.item_id
      WHERE ci.collection_id = ?5 AND ${visibleSql('i')} AND ${LIVE} ORDER BY ci.added_at DESC, i.id DESC LIMIT 1000`,
  ).bind(...visibleBinds(p, scopes), new Date().toISOString(), c.id).all<ItemRow & { ci_added_by: string; ci_added_at: string; ci_note: string | null }>()).results;
  const extras = await extrasFor(env, rows);
  const out: CollectionDetail = {
    ...summaryOf(p, c, rows.length),
    entries: rows.map((r) => ({ item: summary(r, extras.get(r.id)), addedBy: r.ci_added_by, addedAt: r.ci_added_at, note: r.ci_note })),
  };
  return json(out);
}

export async function patchCollection(request: Request, env: Env, p: Person, c: ColRow): Promise<Response> {
  if (!canEdit(p, c)) return error(403, 'not_permitted');
  const b = CollectionPatch.safeParse(await request.json().catch(() => null));
  if (!b.success) return error(400, 'invalid', { issues: issues(b.error) });
  try {
    await env.DB.batch([
      env.DB.prepare(`UPDATE collections SET name = COALESCE(?, name), description = COALESCE(?, description), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`)
        .bind(b.data.name ?? null, b.data.description ?? null, c.id),
      audit(env.DB, { workspaceId: p.workspaceId, actor: p.principalId, act: p.act, action: 'collection.renamed', detail: { collection: c.id, from: c.name, to: b.data.name ?? c.name } }),
    ]);
  } catch (e) {
    if (e instanceof Error && /UNIQUE/.test(e.message)) return error(409, 'name_taken', { detail: 'a collection with that name already exists' });
    throw e;
  }
  const now = (await loadCollection(env, p, c.id))!;
  const counts = await visibleCounts(env, p, await viewerScopes(env, p), [c.id]);
  return json(summaryOf(p, now, counts.get(c.id) ?? 0));
}

/** Its references go with it: an artifact kept only by this collection is then swept after 30 days (spec §12). */
export async function deleteCollection(env: Env, p: Person, c: ColRow): Promise<Response> {
  if (!canEdit(p, c)) return error(403, 'not_permitted');
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM item_references WHERE from_kind = 'collection' AND from_id = ?`).bind(c.id),
    env.DB.prepare(`DELETE FROM collection_items WHERE collection_id = ?`).bind(c.id),
    env.DB.prepare(`DELETE FROM collections WHERE id = ?`).bind(c.id),
    audit(env.DB, { workspaceId: p.workspaceId, actor: p.principalId, act: p.act, action: 'collection.deleted', detail: { collection: c.id, name: c.name } }),
  ]);
  return new Response(null, { status: 204 });
}

async function visibleLive(env: Env, p: Person, itemId: string): Promise<ItemRow | null> {
  const i = await loadItem(env, itemId);
  if (!i || i.revoked_at || isExpired(i)) return null;
  return canSee(p, i, await viewerScopes(env, p)) ? i : null;
}

/** Spec §12: membership is a reference, so the artifact is kept while it is in the collection. */
export async function addToCollection(request: Request, env: Env, p: Person, c: ColRow): Promise<Response> {
  const b = CollectionAdd.safeParse(await request.json().catch(() => null));
  if (!b.success) return error(400, 'invalid', { issues: issues(b.error) });
  const item = await visibleLive(env, p, b.data.itemId);
  if (!item) return error(404, 'not_found');
  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO collection_items (collection_id, item_id, note, added_by) VALUES (?, ?, ?, ?)`).bind(c.id, item.id, b.data.note ?? null, p.principalId),
    env.DB.prepare(`INSERT OR IGNORE INTO item_references (item_id, from_kind, from_id) VALUES (?, 'collection', ?)`).bind(item.id, c.id),
    env.DB.prepare(`UPDATE collections SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).bind(c.id),
    audit(env.DB, { workspaceId: p.workspaceId, actor: p.principalId, act: p.act, action: 'collection.item_added', itemId: item.id, detail: { collection: c.id } }),
  ]);
  return json({ added: true }, 201);
}

export async function removeFromCollection(env: Env, p: Person, c: ColRow, itemId: string): Promise<Response> {
  const item = await loadItem(env, itemId);
  if (!item || !canSee(p, item, await viewerScopes(env, p))) return error(404, 'not_found');
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM collection_items WHERE collection_id = ? AND item_id = ?`).bind(c.id, itemId),
    env.DB.prepare(`DELETE FROM item_references WHERE item_id = ? AND from_kind = 'collection' AND from_id = ?`).bind(itemId, c.id),
    env.DB.prepare(`UPDATE collections SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).bind(c.id),
    audit(env.DB, { workspaceId: p.workspaceId, actor: p.principalId, act: p.act, action: 'collection.item_removed', itemId, detail: { collection: c.id } }),
  ]);
  return new Response(null, { status: 204 });
}
```

In `apps/api/src/library/routes.ts`, add before `return null;`:

```ts
  const col = /^\/api\/v1\/collections(?:\/(col_[0-9a-f]{16})(\/items(?:\/(itm_[0-9a-f]{16}))?)?)?$/.exec(url.pathname);
  if (col) {
    const p = await resolvePerson(request, env);
    if (p instanceof Response) return p;
    const [, colId, items, itemId] = col;
    if (!colId) {
      if (request.method === 'GET') return listCollections(env, p);
      if (request.method === 'POST') return createCollection(request, env, p);
      return null;
    }
    const c = await loadCollection(env, p, colId);
    if (!c) return error(404, 'not_found');
    if (!items) {
      if (request.method === 'GET') return collectionDetail(env, p, c);
      if (request.method === 'PATCH') return patchCollection(request, env, p, c);
      if (request.method === 'DELETE') return deleteCollection(env, p, c);
      return null;
    }
    if (!itemId && request.method === 'POST') return addToCollection(request, env, p, c);
    if (itemId && request.method === 'DELETE') return removeFromCollection(env, p, c, itemId);
    return null;
  }
```

with `import { addToCollection, collectionDetail, createCollection, deleteCollection, listCollections, loadCollection, patchCollection, removeFromCollection } from './collections';`. (`collections.ts` imports `issues` from `routes.ts`; `routes.ts` imports from `collections.ts`: both are function-level uses, so the cycle is safe. If the bundler complains, move `issues` to `library/issues.ts`.)

In `apps/api/src/lifecycle/retention.ts` (A7), in `deleteItem`'s batch, add before the `DELETE FROM items` statement:

```ts
    // A collection that held it no longer does (spec §12; collection_items has a foreign key to items).
    env.DB.prepare(`DELETE FROM collection_items WHERE item_id = ?`).bind(itemId),
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @superlibrary/api test -- test/collections.test.ts test/retention.test.ts test/lifecycle.test.ts`
Expected: PASS.

- [ ] **Step 5: Revert-proof**

1. Delete the `INSERT OR IGNORE INTO item_references` line in `addToCollection`; expect `collection membership counts as a reference for retention` to FAIL (the item is swept). Restore.
2. Delete the `collection_items` line in `deleteItem`; expect `deleting an item takes it out of every collection` to FAIL (FOREIGN KEY). Restore.
3. Change `canEdit` to `() => true`; expect `any member adds; only the creator or an owner…` to FAIL. Restore.
4. Remove `${visibleSql('i')} AND` from `visibleCounts`; expect nothing in this file to fail? It must: add to `an item the person cannot see…` the assertion below, run, then revert the line and see it FAIL:
   ```ts
   await env.DB.prepare(`INSERT INTO collection_items (collection_id, item_id, added_by) VALUES (?, ?, 'prn_000000000000000000a5')`).bind(c.body.id, theirs.body.itemId).run();
   const listed = await (await call('/api/v1/collections')).json<{ collections: CollectionSummary[] }>();
   expect(listed.collections.find((x) => x.id === c.body.id)!.itemCount).toBe(0);
   expect((await detail(c.body.id)).entries).toEqual([]);
   ```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/library/collections.ts apps/api/src/library/routes.ts apps/api/src/lifecycle/retention.ts apps/api/test/collections.test.ts
git commit -m "feat(api): collections people curate; membership keeps an artifact from the 30-day sweep

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---

## Task 6: Moderation: mark superseded by another item, and the caption

**Files:**
- Create: `apps/api/src/library/moderation.ts`
- Modify: `apps/api/src/library/routes.ts`, `apps/api/src/items/visibility.ts` (`ItemRow`, A2), `apps/api/src/items/routes.ts` (`summary` caption, `extrasFor` replacement, A3), `apps/api/src/search/search.ts` (`supersededByMap`, A1), `apps/api/src/indexing/extract.ts` (caption, A9)
- Test: `apps/api/test/moderation.test.ts`

**Interfaces:**
- Consumes: `SupersedeBody`, `CaptionBody` (Task 1); `loadItem`, `viewerScopes`, `canSee`, `canManage`, `isExpired` (A2); `summary`, `extrasFor` (A3); `itemChanged` (events.ts); `extractText` (A9); `supersededByMap` (A1).
- Produces:
  - `POST /api/v1/items/:id/supersede { by: itm_ | null }` → `{ item: ItemSummary }`; `400 invalid` for itself or a loop; `404` for a replacement the person cannot see
  - `PATCH /api/v1/items/:id/caption { caption }` → `{ item: ItemSummary }`; `400` for a work record
  - `moderatable(env, p, id, opts?): Promise<{ item: ItemRow; scopes: string[] } | Response>` and `respond(env, id)` (Task 7 uses both)
  - `ItemRow` gains `caption?: string | null; superseded_by?: string | null; superseded_prior?: string | null`
  - `supersededByMap` and `extrasFor` name a person-set replacement first, else the card's.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/test/moderation.test.ts
import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ItemSummary } from '@superlibrary/contract';
import { extractText } from '../src/indexing/extract';
import { loadItem } from '../src/items/visibility';
import { supersededByMap } from '../src/search/search';
import { AGENT, HUMAN_2, devHeaders, planeToken, withOrgPlane } from './helpers/org-plane';
import { upload } from './helpers/upload';
import { B1, call, knowBoard, seedWorkRecord, workspaceOf } from './helpers/library';

const HUMAN_3 = 'prn_000000000000000000a6';
let ws: string;
beforeEach(async () => { ws = await workspaceOf(); await workspaceOf(HUMAN_2); await workspaceOf(HUMAN_3); await knowBoard(ws, B1); });
const art = async (title: string, principal?: string) => (await upload([{ path: `${title}.md`, body: `# ${title}` }], { title, ...(principal ? { headers: devHeaders(principal) } : {}) })).body.itemId as string;
const supersede = (id: string, by: string | null, principal?: string) => call(`/api/v1/items/${id}/supersede`, { method: 'POST', body: { by }, ...(principal ? { principal } : {}) });

describe('mark superseded by another item (spec §11)', () => {
  it('supersede marks the outcome, names the replacement, and clears back to the prior outcome', async () => {
    const old = await art('Old plan');
    const next = await art('New plan');
    const send = vi.spyOn(env.INDEX, 'send');
    const res = await supersede(old, next);
    expect(res.status).toBe(200);
    expect((await res.json<{ item: ItemSummary }>()).item).toMatchObject({ outcome: 'superseded', supersededBy: next });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ itemId: old, change: 'upserted' }));
    expect((await supersededByMap(env, [old])).get(old)).toBe(next);   // search results name it too
    const audited = await env.DB.prepare(`SELECT detail FROM audit_events WHERE item_id = ? AND action = 'item.superseded'`).bind(old).first<{ detail: string }>();
    expect(JSON.parse(audited!.detail)).toEqual({ by: next, prior: 'completed' });
    const undone = await (await supersede(old, null)).json<{ item: ItemSummary }>();
    expect(undone.item.outcome).toBe('completed');
    expect(undone.item.supersededBy ?? null).toBeNull();
    send.mockRestore();
  });
  it('refuses itself, a loop, and a replacement the person cannot see', async () => {
    const a = await art('A');
    const b = await art('B');
    expect((await supersede(a, a)).status).toBe(400);
    expect((await supersede(a, b)).status).toBe(200);
    const loop = await supersede(b, a);
    expect(loop.status).toBe(400);
    expect(await loop.json()).toMatchObject({ error: 'invalid', detail: 'that would make a loop of replacements' });
    const hidden = (await upload([{ path: 'h.md', body: '# h' }], { title: 'H', scope: 'board:brd_00000000000000b9', headers: devHeaders(HUMAN_2) })).body.itemId as string;
    expect((await supersede(b, hidden)).status).toBe(404);
    expect((await loadItem(env, b))!.outcome).toBe('completed');
  });
  it('a work record keeps its card-derived replacement unless a person sets one', async () => {
    await seedWorkRecord({ id: 'itm_00000000000003a1', ws });
    const next = await art('Replacement');
    expect((await supersede('itm_00000000000003a1', next)).status).toBe(200);   // HUMAN is the owner
    expect((await loadItem(env, 'itm_00000000000003a1'))).toMatchObject({ outcome: 'superseded', superseded_by: next, superseded_prior: 'approved' });
  });
  it('only the uploader or an owner; an agent never', async () => {
    const theirs = await art('Theirs', HUMAN_2);
    const other = await art('Other', HUMAN_2);
    expect((await supersede(theirs, other, HUMAN_3)).status).toBe(403);
    expect((await supersede(theirs, other, HUMAN_2)).status).toBe(200);
    await seedWorkRecord({ id: 'itm_00000000000003a2', ws });
    expect((await supersede('itm_00000000000003a2', other, HUMAN_2)).status).toBe(403);   // records: owners only (O1)
    await withOrgPlane(async () => {
      const t = await planeToken({ sub: AGENT, principalKind: 'agent' });
      const res = await call(`/api/v1/items/${theirs}/supersede`, { method: 'POST', body: { by: null }, headers: { Authorization: `Bearer ${t}` } });
      expect(res.status).toBe(403);
    });
  });
});

describe('caption (spec §7, §11)', () => {
  it('a caption is indexed, shown and audited', async () => {
    const id = await art('Queue diagram');
    const send = vi.spyOn(env.INDEX, 'send');
    const res = await call(`/api/v1/items/${id}/caption`, { method: 'PATCH', body: { caption: 'Three workers drain one queue' } });
    expect(res.status).toBe(200);
    expect((await res.json<{ item: ItemSummary }>()).item.caption).toBe('Three workers drain one queue');
    expect((await extractText(env, (await loadItem(env, id))!))!.text).toContain('Three workers drain one queue');
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ itemId: id, change: 'upserted' }));
    expect(await env.DB.prepare(`SELECT 1 FROM audit_events WHERE item_id = ? AND action = 'item.caption_set'`).bind(id).first()).not.toBeNull();
    const cleared = await (await call(`/api/v1/items/${id}/caption`, { method: 'PATCH', body: { caption: null } })).json<{ item: ItemSummary }>();
    expect(cleared.item.caption ?? null).toBeNull();
    send.mockRestore();
  });
  it('a work record takes no caption', async () => {
    await seedWorkRecord({ id: 'itm_00000000000003b1', ws });
    expect((await call('/api/v1/items/itm_00000000000003b1/caption', { method: 'PATCH', body: { caption: 'x' } })).status).toBe(400);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @superlibrary/api test -- test/moderation.test.ts`
Expected: FAIL (404 on `/supersede`).

- [ ] **Step 3: Write moderation (supersede and caption)**

In `apps/api/src/items/visibility.ts` (A2), add to `ItemRow`:

```ts
  /** Phase 4 (0040): a person's caption and replacement, and the outcome the replacement replaced. */
  caption?: string | null; superseded_by?: string | null; superseded_prior?: string | null;
```

In `apps/api/src/items/routes.ts` (A3), in `summary()` before `return out;`:

```ts
  if (i.caption) out.caption = i.caption;
```

and in `extrasFor` replace the `work_records` replacement query and its loop with:

```ts
  // A person's replacement first (spec §11), else the card's `supersedes` link (spec §15).
  const sup = await env.DB.prepare(
    `SELECT i.id AS item_id, i.kind AS kind, COALESCE(i.superseded_by, n.item_id) AS next FROM items i
       LEFT JOIN work_records w ON w.item_id = i.id
       LEFT JOIN work_records n ON n.workspace_id = w.workspace_id AND n.card_id = w.superseded_by_card
      WHERE i.id IN (SELECT value FROM json_each(?1))`,
  ).bind(ids).all<{ item_id: string; kind: string; next: string | null }>();
  for (const r of sup.results) if (r.next !== null || r.kind === 'work-record') out.get(r.item_id)!.supersededBy = r.next;
```

In `apps/api/src/search/search.ts` (A1), replace the body of `supersededByMap`'s query with:

```ts
  const rows = (await env.DB.prepare(
    `SELECT i.id AS old, COALESCE(i.superseded_by, n.item_id) AS new FROM items i
       LEFT JOIN work_records w ON w.item_id = i.id
       LEFT JOIN work_records n ON n.workspace_id = w.workspace_id AND n.card_id = w.superseded_by_card
      WHERE i.id IN (SELECT value FROM json_each(?)) AND COALESCE(i.superseded_by, n.item_id) IS NOT NULL`,
  ).bind(JSON.stringify(ids)).all<{ old: string; new: string }>()).results;
```

In `apps/api/src/indexing/extract.ts` (A9), replace the last two lines of `extractText` with:

```ts
  // Spec §7: an artifact is also found by its caption, if a person added one.
  const titled = item.caption ? `${item.title}\n${item.caption}` : item.title;
  const head = `${titled}\n${files.map((f) => f.path).join('\n')}`;
  const body = parts.join('\n\n').trim();
  return { text: body ? `${titled}\n\n${body}` : head, view: files.length === 1 ? v.view : 'text', version: v.version };
```

```ts
// apps/api/src/library/moderation.ts
import { CaptionBody, SupersedeBody } from '@superlibrary/contract';
import type { z } from 'zod';
import type { Env } from '../env';
import type { Person } from '../auth/caller';
import { audit } from '../audit';
import { itemChanged } from '../events';
import { error, json } from '../http';
import { canManage, canSee, isExpired, loadItem, viewerScopes, type ItemRow } from '../items/visibility';
import { extrasFor, summary } from '../items/routes';
import { issues } from './routes';

/**
 * The item a person may moderate (spec §11): visible to them, and theirs or they own the workspace
 * (plan D12, decision O1; a work record has no uploader, so owners only). Agents never get here:
 * `resolvePerson` refuses them. Invisible is 404 (D11).
 */
export async function moderatable(env: Env, p: Person, id: string, opts: { allowRevoked?: boolean } = {}): Promise<{ item: ItemRow; scopes: string[] } | Response> {
  const item = await loadItem(env, id);
  const scopes = item ? await viewerScopes(env, p) : [];
  if (!item || !canSee(p, item, scopes)) return error(404, 'not_found');
  if (!canManage(p, item, scopes)) return error(403, 'not_permitted');
  if (item.revoked_at && !opts.allowRevoked) return error(410, 'revoked');
  return { item, scopes };
}

export async function respond(env: Env, id: string): Promise<Response> {
  const now = (await loadItem(env, id))!;
  return json({ item: summary(now, (await extrasFor(env, [now])).get(id)) });
}

async function body<S extends z.ZodType>(request: Request, schema: S): Promise<z.infer<S> | Response> {
  const b = schema.safeParse(await request.json().catch(() => null));
  return b.success ? b.data : error(400, 'invalid', { issues: issues(b.error) });
}

/** Following replacements from `by` reaches `id`: setting it would make a loop. */
async function wouldLoop(env: Env, id: string, by: string): Promise<boolean> {
  let at: string | null = by;
  for (let i = 0; i < 32 && at; i++) {
    if (at === id) return true;
    at = (await env.DB.prepare(`SELECT superseded_by FROM items WHERE id = ?`).bind(at).first<{ superseded_by: string | null }>())?.superseded_by ?? null;
  }
  return at !== null;   // a chain longer than 32 is refused as a loop rather than followed further
}

export async function supersede(request: Request, env: Env, p: Person, id: string): Promise<Response> {
  const m = await moderatable(env, p, id);
  if (m instanceof Response) return m;
  const b = await body(request, SupersedeBody);
  if (b instanceof Response) return b;
  if (b.by === null) {
    if (m.item.superseded_by) {
      await env.DB.batch([
        env.DB.prepare(`UPDATE items SET outcome = COALESCE(superseded_prior, outcome), superseded_by = NULL, superseded_prior = NULL WHERE id = ?`).bind(id),
        audit(env.DB, { workspaceId: p.workspaceId, actor: p.principalId, act: p.act, action: 'item.supersede_cleared', itemId: id, detail: { was: m.item.superseded_by } }),
      ]);
      await itemChanged(env, id, m.item.workspace_id, 'upserted');
    }
    return respond(env, id);
  }
  if (b.by === id) return error(400, 'invalid', { detail: 'an item cannot supersede itself' });
  const target = await loadItem(env, b.by);
  if (!target || !canSee(p, target, m.scopes) || target.revoked_at || isExpired(target)) return error(404, 'not_found', { detail: 'the replacement was not found' });
  if (await wouldLoop(env, id, b.by)) return error(400, 'invalid', { detail: 'that would make a loop of replacements' });
  const prior = m.item.superseded_by ? (m.item.superseded_prior ?? m.item.outcome) : m.item.outcome;
  await env.DB.batch([
    env.DB.prepare(`UPDATE items SET superseded_prior = ?, superseded_by = ?, outcome = 'superseded' WHERE id = ?`).bind(prior, b.by, id),
    audit(env.DB, { workspaceId: p.workspaceId, actor: p.principalId, act: p.act, action: 'item.superseded', itemId: id, detail: { by: b.by, prior } }),
  ]);
  // Outcome changes the ranking weight (spec §7): the index consumer re-reads the item.
  await itemChanged(env, id, m.item.workspace_id, 'upserted');
  return respond(env, id);
}

export async function setCaption(request: Request, env: Env, p: Person, id: string): Promise<Response> {
  const m = await moderatable(env, p, id);
  if (m instanceof Response) return m;
  if (m.item.kind !== 'artifact') return error(400, 'invalid', { detail: 'only an artifact has a caption' });
  const b = await body(request, CaptionBody);
  if (b instanceof Response) return b;
  const caption = b.caption === null || b.caption === '' ? null : b.caption;
  await env.DB.batch([
    env.DB.prepare(`UPDATE items SET caption = ? WHERE id = ?`).bind(caption, id),
    audit(env.DB, { workspaceId: p.workspaceId, actor: p.principalId, act: p.act, action: 'item.caption_set', itemId: id, detail: { length: caption?.length ?? 0 } }),
  ]);
  await itemChanged(env, id, m.item.workspace_id, 'upserted');
  return respond(env, id);
}
```

In `apps/api/src/library/routes.ts`, add before `return null;`:

```ts
  const mod = /^\/api\/v1\/items\/(itm_[0-9a-f]{16})\/(supersede|caption)$/.exec(url.pathname);
  if (mod) {
    const p = await resolvePerson(request, env);
    if (p instanceof Response) return p;
    if (mod[2] === 'supersede' && request.method === 'POST') return supersede(request, env, p, mod[1]!);
    if (mod[2] === 'caption' && request.method === 'PATCH') return setCaption(request, env, p, mod[1]!);
    return null;
  }
```

with `import { setCaption, supersede } from './moderation';`.

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @superlibrary/api test -- test/moderation.test.ts test/items.test.ts test/search.test.ts test/related.test.ts test/indexing.test.ts`
Expected: PASS.

- [ ] **Step 5: Revert-proof**

1. Make `wouldLoop` return `false`; expect `refuses itself, a loop…` to FAIL. Restore.
2. Remove `!canSee(p, target, m.scopes) ||`; expect the same test to FAIL at the hidden replacement. Restore.
3. Remove `COALESCE(i.superseded_by, n.item_id)` from `supersededByMap` (back to `n.item_id`); expect `supersede marks the outcome…` to FAIL at `supersededByMap`. Restore.
4. Remove the `titled` line's caption (use `item.title`); expect `a caption is indexed…` to FAIL. Restore.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/library/moderation.ts apps/api/src/library/routes.ts apps/api/src/items/visibility.ts apps/api/src/items/routes.ts apps/api/src/search/search.ts apps/api/src/indexing/extract.ts apps/api/test/moderation.test.ts
git commit -m "feat(api): mark superseded by another item (no loops, undoable) and captions, indexed and audited

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---

## Task 7: Remove from memory, and a person's acts survive the card's re-sync

**Files:**
- Modify: `apps/api/src/library/moderation.ts`, `apps/api/src/library/routes.ts`, `apps/api/src/ingest/consumer.ts` (A6)
- Test: `apps/api/test/ingest-moderation.test.ts`

**Interfaces:**
- Consumes: `moderatable`, `respond` (Task 6); `RemoveBody` (Task 1); `deleteItem` (A7); `syncCard` (A6); `fakePipeline`, `card`, `ORG` (A16); `ensureWorkspace`.
- Produces:
  - `POST /api/v1/items/:id/remove { reason }` → `{ removed: true }`; deletes everything (spec §12) through `deleteItem(env, id, <person prn>, reason)`, whose `item.deleted` audit row records the person and the reason; a work record's card is tombstoned in `removed_cards`.
  - `syncCard` returns `'unchanged'` for a tombstoned card, keeps `scope = 'workspace'` once widened, and keeps `outcome = 'superseded'` while `items.superseded_by` is set (updating `superseded_prior` to the card's own outcome).

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/test/ingest-moderation.test.ts
import { env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ORG, card, fakePipeline, type FakeState } from './helpers/fake-pipeline';
import { syncCard } from '../src/ingest/consumer';
import { ensureWorkspace } from '../src/auth/caller';
import { __resetServiceTokensForTests } from '../src/clients/plane';
import { loadItem } from '../src/items/visibility';
import { AGENT, HUMAN_2, devHeaders, planeToken, withOrgPlane } from './helpers/org-plane';
import { upload } from './helpers/upload';
import { call, knowBoard, workspaceOf } from './helpers/library';

const B = 'brd_00000000000000b1';
const C = 'card_00000000000000c7';
let state: FakeState;
let restore: () => void;
let ws: string;
const recordId = async () => (await env.DB.prepare(`SELECT item_id FROM work_records WHERE workspace_id = ? AND card_id = ?`).bind(ws, C).first<{ item_id: string }>())?.item_id ?? null;
const touch = (over: Parameters<typeof card>[1]) => { state.boards.get(B)!.cards.get(C)!.card = card(C, { updatedAt: new Date().toISOString(), ...over }); };

beforeEach(async () => {
  state = { boards: new Map(), pushConfigs: [], calls: [] };
  state.boards.set(B, { id: B, name: 'Build', cards: new Map([[C, { card: card(C), attempts: [], comments: [], links: [], gates: [], references: [] }]]) });
  restore = fakePipeline(state);
  ws = await ensureWorkspace(env.DB, ORG);
  expect(await workspaceOf()).toBe(ws);   // the dev person is in the same workspace, and its owner
  await knowBoard(ws, B, 'Build');
  await syncCard(env, { workspaceId: ws, boardId: B, cardId: C });
});
afterEach(() => { restore(); __resetServiceTokensForTests(); });

describe("a person's acts survive the card's re-sync (gap G1)", () => {
  it('a removed record stays removed when its card changes again', async () => {
    const id = (await recordId())!;
    const res = await call(`/api/v1/items/${id}/remove`, { method: 'POST', body: { reason: 'duplicate of another card' } });
    expect(res.status).toBe(200);
    expect(await recordId()).toBeNull();
    touch({ title: 'Edited after removal' });
    expect(await syncCard(env, { workspaceId: ws, boardId: B, cardId: C })).toBe('unchanged');
    expect(await recordId()).toBeNull();
  });
  it('a record widened to the workspace stays widened after its card changes', async () => {
    const id = (await recordId())!;
    expect((await call(`/api/v1/items/${id}/scope`, { method: 'POST', body: { scope: 'workspace' } })).status).toBe(200);
    touch({ title: 'Edited after widening' });
    expect(await syncCard(env, { workspaceId: ws, boardId: B, cardId: C })).toBe('updated');
    expect(await loadItem(env, id)).toMatchObject({ scope: 'workspace', title: 'Edited after widening' });
  });
  it("a person-set replacement survives a sync, and clearing restores the card's own outcome", async () => {
    const id = (await recordId())!;
    const next = (await upload([{ path: 'n.md', body: '# n' }], { title: 'Next' })).body.itemId as string;
    expect((await call(`/api/v1/items/${id}/supersede`, { method: 'POST', body: { by: next } })).status).toBe(200);
    touch({ state: 'completed' });
    await syncCard(env, { workspaceId: ws, boardId: B, cardId: C });
    expect(await loadItem(env, id)).toMatchObject({ outcome: 'superseded', superseded_by: next, superseded_prior: 'completed' });
    const cleared = await call(`/api/v1/items/${id}/supersede`, { method: 'POST', body: { by: null } });
    expect((await cleared.json<{ item: { outcome: string } }>()).item.outcome).toBe('completed');
  });
});

describe('remove from memory (spec §11, §12)', () => {
  it('remove: a reason is required and recorded; an agent cannot', async () => {
    const a = (await upload([{ path: 'gone.md', body: '# gone' }], { title: 'Gone' })).body.itemId as string;
    expect((await call(`/api/v1/items/${a}/remove`, { method: 'POST', body: {} })).status).toBe(400);
    await withOrgPlane(async () => {
      const t = await planeToken({ sub: AGENT, principalKind: 'agent' });
      expect((await call(`/api/v1/items/${a}/remove`, { method: 'POST', body: { reason: 'agent try' }, headers: { Authorization: `Bearer ${t}` } })).status).toBe(403);
    });
    const send = vi.spyOn(env.INDEX, 'send');
    expect((await call(`/api/v1/items/${a}/remove`, { method: 'POST', body: { reason: 'posted by mistake' } })).status).toBe(200);
    expect(await loadItem(env, a)).toBeNull();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ itemId: a, change: 'deleted' }));   // vectors and FTS rows go too
    const row = await env.DB.prepare(`SELECT actor, detail FROM audit_events WHERE item_id = ? AND action = 'item.deleted'`).bind(a).first<{ actor: string; detail: string }>();
    expect(row!.actor).toBe('prn_000000000000000000a1');
    expect(JSON.parse(row!.detail)).toEqual({ reason: 'posted by mistake' });
    send.mockRestore();
  });
  it('a member cannot remove a work record or another person\'s artifact (decision O1)', async () => {
    const id = (await recordId())!;
    expect((await call(`/api/v1/items/${id}/remove`, { method: 'POST', body: { reason: 'not mine' }, principal: HUMAN_2 })).status).toBe(403);
    const mine = (await upload([{ path: 'o.md', body: '# o' }], { title: 'Owner file' })).body.itemId as string;
    expect((await call(`/api/v1/items/${mine}/remove`, { method: 'POST', body: { reason: 'not mine' }, headers: devHeaders(HUMAN_2) })).status).toBe(403);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @superlibrary/api test -- test/ingest-moderation.test.ts`
Expected: FAIL (404 on `/remove`; the widened record reads `board:…` after the sync).

- [ ] **Step 3: Write removal and the re-sync guards**

Append to `apps/api/src/library/moderation.ts`:

```ts
import { RemoveBody } from '@superlibrary/contract';
import { deleteItem } from '../lifecycle/retention';

/**
 * Spec §11 "remove an item from memory, with a recorded reason"; spec §12 "deletion removes
 * everything". A revoked item may still be removed. A work record's card is remembered, so its
 * next event does not bring it back (decision O5).
 */
export async function removeFromMemory(request: Request, env: Env, p: Person, id: string): Promise<Response> {
  const m = await moderatable(env, p, id, { allowRevoked: true });
  if (m instanceof Response) return m;
  const b = RemoveBody.safeParse(await request.json().catch(() => null));
  if (!b.success) return error(400, 'invalid', { detail: 'a reason of 3 to 500 characters is required' });
  if (m.item.kind === 'work-record') {
    const w = await env.DB.prepare(`SELECT card_id FROM work_records WHERE item_id = ?`).bind(id).first<{ card_id: string }>();
    if (w) {
      await env.DB.prepare(`INSERT OR REPLACE INTO removed_cards (workspace_id, card_id, item_id, reason, removed_by) VALUES (?, ?, ?, ?, ?)`)
        .bind(m.item.workspace_id, w.card_id, id, b.data.reason, p.principalId).run();
    }
  }
  // Rows, bytes no other version shares, and (through item.changed 'deleted') chunks, FTS rows and
  // vectors. Its `item.deleted` audit row records this person and the reason.
  await deleteItem(env, id, p.principalId, b.data.reason);
  return json({ removed: true });
}
```

(Move the two new imports to the top of the file with the others.)

In `apps/api/src/library/routes.ts`, widen the moderation regex to `(supersede|caption|remove)` and add:

```ts
    if (mod[2] === 'remove' && request.method === 'POST') return removeFromMemory(request, env, p, mod[1]!);
```

with `removeFromMemory` added to the import.

In `apps/api/src/ingest/consumer.ts` (A6), at the top of `syncCard`, before the read of `existing`:

```ts
  // A person removed this card's record from memory (spec §11, decision O5): no event brings it back.
  const removed = await env.DB.prepare(`SELECT 1 FROM removed_cards WHERE workspace_id = ? AND card_id = ?`).bind(m.workspaceId, m.cardId).first();
  if (removed) return 'unchanged';
```

and replace the existing-record `UPDATE items …` statement with:

```ts
      // What a person did stays done (gap G1): a widened record stays workspace-wide, and a
      // person-set replacement keeps it superseded; the card's own outcome is kept for an undo.
      env.DB.prepare(
        `UPDATE items SET title = ?1,
           outcome = CASE WHEN superseded_by IS NOT NULL THEN 'superseded' ELSE ?2 END,
           superseded_prior = CASE WHEN superseded_by IS NOT NULL THEN ?2 ELSE superseded_prior END,
           scope = CASE WHEN scope = 'workspace' THEN scope ELSE ?3 END
         WHERE id = ?4`,
      ).bind(record.title, record.outcome, scope, itemId),
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @superlibrary/api test -- test/ingest-moderation.test.ts test/ingest.test.ts test/backfill.test.ts test/moderation.test.ts && pnpm --filter @superlibrary/api test`
Expected: PASS.

- [ ] **Step 5: Revert-proof**

1. Delete the `removed_cards` check in `syncCard`; expect `a removed record stays removed…` to FAIL. Restore.
2. Restore `scope = ?3` (no CASE); expect `a record widened to the workspace stays widened…` to FAIL. Restore.
3. Restore `outcome = ?2` (no CASE); expect `a person-set replacement survives a sync…` to FAIL. Restore.
4. Remove the `RemoveBody` check (use `'no reason'`); expect `remove: a reason is required…` to FAIL. Restore.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/library/moderation.ts apps/api/src/library/routes.ts apps/api/src/ingest/consumer.ts apps/api/test/ingest-moderation.test.ts
git commit -m "feat(api): remove from memory with a recorded reason; a card's re-sync keeps what a person did

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---

## Task 8: CORS for embedding hosts on the reads a host needs

Superpipeline's drawer (Tasks 22–23) calls, from `https://app.superpipeline.dev`, with the person's own Superlibrary-audience token: `GET /api/v1/me`, `GET /api/v1/items/:id`, `POST /api/v1/items/:id/embed` (already CORS), `POST /api/v1/items/:id/scope` and `POST /api/v1/related`. Nothing else is opened to other origins.

**Files:**
- Modify: `apps/api/src/items/routes.ts` (A3), `apps/api/src/search/routes.ts` (A4), `apps/api/src/index.ts` (A19)
- Test: `apps/api/test/cors.test.ts`

**Interfaces:**
- Consumes: `preflight`, `withCors` (A8); `EMBED_HOSTS` (A22; `https://host.test` in tests).
- Produces: `Access-Control-Allow-Origin: <origin>` (+ `Vary: Origin`) on every answer, refusals included, of the five routes above, for an origin in `EMBED_HOSTS` only; `OPTIONS` preflights for them.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/test/cors.test.ts
import { describe, expect, it } from 'vitest';
import { upload } from './helpers/upload';
import { HUMAN, devHeaders } from './helpers/org-plane';
import { call, workspaceOf } from './helpers/library';

const HOST = { ...devHeaders(HUMAN), Origin: 'https://host.test' };
const EVIL = { ...devHeaders(HUMAN), Origin: 'https://evil.test' };
const acao = (r: Response) => r.headers.get('Access-Control-Allow-Origin');

describe('CORS for embedding hosts (spec §9 Embedding, Tasks 22-23)', () => {
  it('the item, me, scope and related answer an embedding host, refusals included', async () => {
    await workspaceOf();
    const a = (await upload([{ path: 'c.md', body: '# c' }], { title: 'C' })).body.itemId as string;
    expect(acao(await call(`/api/v1/items/${a}`, { headers: HOST }))).toBe('https://host.test');
    expect(acao(await call('/api/v1/me', { headers: HOST }))).toBe('https://host.test');
    expect(acao(await call('/api/v1/related', { method: 'POST', body: { itemId: a }, headers: HOST }))).toBe('https://host.test');
    const refused = await call('/api/v1/items/itm_00000000000000ff', { headers: HOST });
    expect(refused.status).toBe(404);
    expect(acao(refused)).toBe('https://host.test');
    expect(acao(await call(`/api/v1/items/${a}/scope`, { method: 'POST', body: { scope: 'workspace' }, headers: HOST }))).toBe('https://host.test');
  });
  it('another origin gets no CORS, and the library routes stay same-origin', async () => {
    const a = (await upload([{ path: 'd.md', body: '# d' }], { title: 'D' })).body.itemId as string;
    expect(acao(await call(`/api/v1/items/${a}`, { headers: EVIL }))).toBeNull();
    expect(acao(await call('/api/v1/browse', { method: 'POST', body: {}, headers: HOST }))).toBeNull();
  });
  it('preflights name the methods', async () => {
    const pre = (path: string) => call(path, { method: 'OPTIONS', headers: { Origin: 'https://host.test', 'Access-Control-Request-Method': 'POST' } });
    const item = await pre('/api/v1/items/itm_0123456789abcdef');
    expect(item.status).toBe(204);
    expect(item.headers.get('Access-Control-Allow-Methods')).toBe('GET');
    expect((await pre('/api/v1/items/itm_0123456789abcdef/scope')).headers.get('Access-Control-Allow-Methods')).toBe('POST');
    expect((await pre('/api/v1/related')).headers.get('Access-Control-Allow-Methods')).toBe('POST');
    expect((await pre('/api/v1/me')).headers.get('Access-Control-Allow-Methods')).toBe('GET');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @superlibrary/api test -- test/cors.test.ts`
Expected: FAIL (no `Access-Control-Allow-Origin` on the item read).

- [ ] **Step 3: Add CORS to the five routes**

In `apps/api/src/items/routes.ts` (A3), import `preflight, withCors` from `../http`, delete the local `corsFor` (keep `hostsOf`, used by `embed`), and replace the start of `itemRoutes` after `const [, id, sub] = …` with:

```ts
  // Embedding hosts (spec §9) read the item, mint the grant and widen it with the person's own token.
  const hostRead = !sub || sub === '/embed' || sub === '/scope';
  if (request.method === 'OPTIONS') return hostRead ? preflight(request, env.EMBED_HOSTS, sub ? 'POST' : 'GET') : null;
  const p = await resolvePerson(request, env);
  if (p instanceof Response) return hostRead ? withCors(request, env.EMBED_HOSTS, p) : p;
  if (!sub && request.method === 'GET') return withCors(request, env.EMBED_HOSTS, await detail(env, p, id));
  if (sub === '/embed' && request.method === 'POST') return withCors(request, env.EMBED_HOSTS, await embed(request, env, p, id));
  if (!sub && request.method === 'PATCH') return setExpiry(request, env, p, id);
  if (sub === '/revoke' && request.method === 'POST') return revokeItem(request, env, p, id);
  if (sub === '/scope' && request.method === 'POST') return withCors(request, env.EMBED_HOSTS, await widenScope(request, env, p, id));
  if (sub?.startsWith('/versions/') && request.method === 'POST') return revokeVersion(env, p, id, Number(m[3]));
  return null;
```

In `apps/api/src/search/routes.ts` (A4), import `preflight, withCors` and replace the `/api/v1/related` block with:

```ts
  if (url.pathname === '/api/v1/related') {
    if (request.method === 'OPTIONS') return preflight(request, env.EMBED_HOSTS, 'POST');
    if (request.method !== 'POST') return null;
    const v = await resolveViewer(request, env);
    if (v instanceof Response) return withCors(request, env.EMBED_HOSTS, v);
    const q = RelatedQuery.safeParse(await request.json().catch(() => null));
    if (!q.success) return withCors(request, env.EMBED_HOSTS, error(400, 'invalid'));
    return withCors(request, env.EMBED_HOSTS, json({ items: await related(env, v, q.data) }));
  }
```

In `apps/api/src/index.ts` (A19), import `preflight, withCors` and replace the `/api/v1/me` block with:

```ts
  if (url.pathname === '/api/v1/me') {
    // An embedding host asks who the person is to offer widening (gap G4).
    if (request.method === 'OPTIONS') return preflight(request, env.EMBED_HOSTS, 'GET');
    if (request.method !== 'GET') return error(404, 'not_found');
    const p = await resolvePerson(request, env);
    if (p instanceof Response) return withCors(request, env.EMBED_HOSTS, p);
    return withCors(request, env.EMBED_HOSTS, json({ kind: p.kind, principalId: p.principalId, org: p.org, workspaceId: p.workspaceId, role: p.role }));
  }
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @superlibrary/api test && pnpm -r typecheck`
Expected: PASS (the existing embed CORS tests still pass).

- [ ] **Step 5: Revert-proof**

Drop `withCors` from the `GET` detail line; expect `the item, me, scope and related…` to FAIL. Restore. Change `hostRead` to `true`; expect nothing to fail? Add to the second test `expect(acao(await call(`/api/v1/items/${a}/revoke`, { method: 'POST', body: {}, headers: HOST }))).toBeNull();`, run, and see it FAIL with `hostRead = true`. Restore.

- [ ] **Step 6: Commit, push and open P4-API**

```bash
git add apps/api/src/items/routes.ts apps/api/src/search/routes.ts apps/api/src/index.ts apps/api/test/cors.test.ts
git commit -m "feat(api): embedding hosts may read the item, who is signed in, and related work

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
pnpm -r typecheck && pnpm -r test
git push -u origin feat/p4-api
gh pr create --title "Phase 4 API: filters, browse, record view, collections, moderation, host CORS" --body "$(cat <<'EOF'
Plan tasks 1-8 of docs/superpowers/plans/2026-10-10-superlibrary-phase-4.md: search filters (agent, station, last activity), browse with outcome counts and facets, the work-record view, collections (membership keeps artifacts from retention), moderation (supersede without loops, caption, remove from memory with a reason), re-sync keeps a person's acts, and CORS for embedding hosts on the reads they need.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Merge on green (`gh pr merge --merge`), then watch the `main` run: `deploy-api` applies `0040_library.sql`. Live check: `curl -s https://app.superlibrary.dev/api/health` answers `{"ok":true,…}`.

---
## Task 9: The embed toolbar on phones, and host theme hooks

The operator's phone review of phase 1: below 640 px the toolbar showed icons only. Phase 4 keeps every control labelled: at phone width the primary controls (version, Full screen, Share) keep their words, and the rest (Files, View source, Theme, Download, Open in new window) move into a labelled **More** panel. The embed also takes its colours and face from the host when the host offers them, so the viewer looks of a piece with the suite (operator direction A). P4-EMB starts here, in its own worktree, beside P4-API: `git -C /Users/rakeshgangwar/SuperJackfruit/superlibrary worktree add -b feat/p4-embed /Users/rakeshgangwar/SuperJackfruit/.worktrees/superlibrary-p4-embed origin/main`.

**Files:**
- Modify: `packages/embed/src/index.ts` (the More toggle and panel; secondary controls marked), `packages/embed/src/style.ts` (labels stay; container query; host hooks), `packages/embed/README.md`
- Test: `packages/embed/test/embed.test.ts`

**Interfaces:**
- Consumes: the toolbar's existing controls and its panel pairs (`filesToggle`/`filesPanel`, `shareToggle`/`sharePanel`, `openPanel`, `closePanel`), `renderBar`, `THEME_NAMES`, `make`, `toolButton`.
- Produces:
  - `button.sl-more-toggle` ("More", `aria-expanded`, `aria-controls`) as the toolbar's last control, and `div.sl-more-panel` holding one labelled control per secondary control present: `Files (n)`, `View source` or `Show rendered`, a `Theme` select, `Download`, `Open in new window`. Secondary toolbar controls carry `sl-secondary`.
  - Host hooks, all optional: `--sl-host-{bg,fg,muted,line,hover,accent,accent-content,danger}` for the light theme, the same names with `-dark` for the dark theme, and `--sl-host-font`. Task 12's `kit.css` sets them from the generated tokens.

- [ ] **Step 1: Write the failing tests**

In `packages/embed/test/embed.test.ts`, change the expected list in `every control has a name a screen reader can say…` to end with `'Share', 'More'`, and add:

```ts
describe('the toolbar on phones (operator review of phase 1): every control keeps its words', () => {
  const more = () => q<HTMLButtonElement>('button.sl-more-toggle')!;
  const panel = () => q<HTMLElement>('.sl-more-panel')!;
  it('a labelled More panel holds every secondary control, each with its words', async () => {
    await mount({ getEmbedUrl: async () => FOLDER });
    expect(more().textContent).toContain('More');
    expect(more().getAttribute('aria-controls')).toBe(panel().id);
    expect(panel().hidden).toBe(true);
    more().click();
    expect(more().getAttribute('aria-expanded')).toBe('true');
    const words = [...panel().querySelectorAll<HTMLElement>('button, a, label')].map((c) => c.textContent!.trim());
    expect(words).toEqual(['Files (4)', 'View source', expect.stringContaining('Theme'), 'Open in new window']);
    for (const s of ['.sl-files-toggle', '.sl-source', '.sl-theme-menu', '.sl-open']) expect(q(s)!.classList.contains('sl-secondary'), s).toBe(true);
    for (const s of ['.sl-version-menu', '.sl-fullscreen', '.sl-share-toggle']) expect(q(s)!.classList.contains('sl-secondary'), s).toBe(false);
  });
  it('a More item does what its toolbar control does', async () => {
    const m = await mount();
    more().click();
    [...panel().querySelectorAll('button')].find((b) => b.textContent === 'View source')!.click();
    await flush();
    expect(src(m).searchParams.get('source')).toBe('1');
    expect(panel().hidden).toBe(true);
    more().click();
    expect([...panel().querySelectorAll('a')].map((a) => a.textContent)).toEqual(['Download', 'Open in new window']);
  });
  it('the theme chosen in More is the theme chosen in the toolbar', async () => {
    await mount();
    more().click();
    const sel = panel().querySelector<HTMLSelectElement>('select')!;
    sel.value = 'dark';
    sel.dispatchEvent(new Event('change'));
    expect(q('.sl-embed')!.getAttribute('data-theme')).toBe('dark');
    expect(q<HTMLSelectElement>('select.sl-theme')!.value).toBe('dark');
  });
  it('labels are never hidden at narrow widths, and the host may set the colours and face', async () => {
    await mount();
    const css = document.getElementById('sl-embed-style')!.textContent!;
    expect(css).not.toMatch(/\.sl-toolbar \.sl-label\{position:absolute/);
    expect(css).toMatch(/@container \(max-width:640px\)\{[^}]*\.sl-toolbar \.sl-secondary\{display:none\}/);
    for (const n of ['bg', 'fg', 'muted', 'line', 'hover', 'accent', 'accent-content', 'danger']) {
      expect(css, n).toContain(`var(--sl-host-${n},`);
      expect(css, `${n} dark`).toContain(`var(--sl-host-${n}-dark,`);
    }
    expect(css).toContain('var(--sl-host-font,');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @superlibrary/embed test`
Expected: FAIL (no `button.sl-more-toggle`; the names list lacks `More`).

- [ ] **Step 3: Write the More panel, the classes and the hooks**

In `packages/embed/src/index.ts`, after `shareToggle`/`sharePanel` are made:

```ts
  // Phones (operator review): secondary controls fold into a labelled More panel; nothing is ever icon-only.
  const moreToggle = toolButton('sl-more-toggle', 'more', 'More');
  const morePanel = make('div', { className: 'sl-panel sl-more-panel', id: `${id}-more`, hidden: true });
  for (const c of [filesToggle, sourceBtn, themeEl, download, open]) c.classList.add('sl-secondary');
```

add `[moreToggle, morePanel]` to the `for (const [toggle, panel] of [[filesToggle, filesPanel], [shareToggle, sharePanel]] as const)` list and to every place that list's pairs are wired for clicks and Escape (the same toggle handler the Files and Share toggles use), append `morePanel` after `sharePanel` in `root.append(bar, errorEl, filesPanel, sharePanel, morePanel, iframe)`, add `icon('more')` to `src/icons.ts` (`more: 'M5 12h.01M12 12h.01M19 12h.01'`, three dots), and:

```ts
  /** The More panel mirrors the secondary controls the bar shows now; each item uses the bar control itself. */
  const renderMore = () => {
    const delegate = (label: string, target: HTMLElement) => {
      const b = make('button', { type: 'button', className: 'sl-more-item', textContent: label });
      b.addEventListener('click', () => { closePanel(false); target.click(); });
      return b;
    };
    const items: HTMLElement[] = [];
    if (isFolder()) items.push(delegate(`Files (${files().length})`, filesToggle));
    if (current() !== undefined && SOURCE_VIEWS.has(current()!.view)) items.push(delegate(view.source ? 'Show rendered' : 'View source', sourceBtn));
    const theme = make('select', { className: 'sl-more-theme' });
    theme.append(...(['system', 'light', 'dark'] as const).map((t) => make('option', { value: t, textContent: THEME_NAMES[t] })));
    theme.value = themeSelect.value;
    theme.addEventListener('change', () => { themeSelect.value = theme.value; themeSelect.dispatchEvent(new Event('change')); });
    items.push(make('label', { className: 'sl-more-field' }, make('span', { textContent: 'Theme' }), theme));
    if (grant.downloadUrl) items.push(make('a', { className: 'sl-more-item', href: grant.downloadUrl, rel: 'noopener noreferrer', textContent: 'Download' }));
    items.push(make('a', { className: 'sl-more-item', href: link(), target: '_blank', rel: 'noopener noreferrer', textContent: 'Open in new window' }));
    morePanel.replaceChildren(make('div', { className: 'sl-more-list' }, ...items));
  };
```

In `renderBar`, change `children.push(fsBtn, open, shareToggle);` to `children.push(fsBtn, open, shareToggle, moreToggle);` and call `renderMore();` before `bar.replaceChildren(...children);`. (The panel item clicks call `closePanel(false)` then the bar control's own `click()`, so Files, View source and focus handling stay one code path.)

In `packages/embed/src/style.ts`, replace the first three rules and the `@container` block with:

```ts
.sl-embed{--sl-bg:var(--sl-host-bg,#fff);--sl-fg:var(--sl-host-fg,#1f2328);--sl-muted:var(--sl-host-muted,#59636e);--sl-line:var(--sl-host-line,#d1d9e0);--sl-hover:var(--sl-host-hover,#f0f2f4);--sl-accent:var(--sl-host-accent,#0969da);--sl-accent-content:var(--sl-host-accent-content,#fff);--sl-danger:var(--sl-host-danger,#cf222e);
  container-type:inline-size;display:flex;flex-direction:column;background:var(--sl-bg);color:var(--sl-fg);border:1px solid var(--sl-line);border-radius:8px;overflow:hidden;
  font:14px/1.4 var(--sl-host-font,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif);color-scheme:light}
.sl-embed[data-theme=dark]{--sl-bg:var(--sl-host-bg-dark,#0d1117);--sl-fg:var(--sl-host-fg-dark,#e6edf3);--sl-muted:var(--sl-host-muted-dark,#9198a1);--sl-line:var(--sl-host-line-dark,#3d444d);--sl-hover:var(--sl-host-hover-dark,#1f242c);--sl-accent:var(--sl-host-accent-dark,#4493f8);--sl-accent-content:var(--sl-host-accent-content-dark,#0d1117);--sl-danger:var(--sl-host-danger-dark,#f85149);color-scheme:dark}
@media (prefers-color-scheme:dark){.sl-embed:not([data-theme=light]){--sl-bg:var(--sl-host-bg-dark,#0d1117);--sl-fg:var(--sl-host-fg-dark,#e6edf3);--sl-muted:var(--sl-host-muted-dark,#9198a1);--sl-line:var(--sl-host-line-dark,#3d444d);--sl-hover:var(--sl-host-hover-dark,#1f242c);--sl-accent:var(--sl-host-accent-dark,#4493f8);--sl-accent-content:var(--sl-host-accent-content-dark,#0d1117);--sl-danger:var(--sl-host-danger-dark,#f85149);color-scheme:dark}}
```

change `.sl-panel button.sl-primary{…color:#fff}` to `color:var(--sl-accent-content)`, and replace the `@container (max-width:640px){…}` block with:

```ts
.sl-more-toggle{display:none!important}
.sl-more-list{display:flex;flex-direction:column;gap:6px}
.sl-panel .sl-more-item{display:flex;align-items:center;min-height:44px;padding:0 12px;border:1px solid var(--sl-line);border-radius:6px;background:var(--sl-bg);color:inherit;text-decoration:none;font:inherit;cursor:pointer}
.sl-more-field{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:44px}
.sl-more-field select{min-height:44px;font:inherit}
@container (max-width:640px){.sl-toolbar .sl-secondary{display:none}.sl-more-toggle{display:inline-flex!important}.sl-btn,.sl-select{padding:0 8px}}
```

Append to `packages/embed/README.md`, under the controls table:

```markdown
**On phones** (the embed narrower than 640 px) the version, **Full screen** and **Share** stay in the
toolbar with their words; Files, View source, Theme, Download and Open in new window move into a
**More** panel, each labelled. No control is ever an icon alone.

**Host styling.** Every colour is a custom property with a host hook: set `--sl-host-bg`, `-fg`,
`-muted`, `-line`, `-hover`, `-accent`, `-accent-content` and `-danger` (light) and the same names
ending in `-dark` (dark) on any ancestor, and `--sl-host-font` for the face. Unset, the embed's own
neutral values apply.
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @superlibrary/embed test && pnpm --filter @superlibrary/embed typecheck`
Expected: PASS.

- [ ] **Step 5: Revert-proof**

Put back `.sl-toolbar .sl-label{position:absolute;…}` in the container query; expect `labels are never hidden…` to FAIL. Restore. Make the More item call `sourceBtn.dispatchEvent(new Event('focus'))` instead of `click()`; expect `a More item does what its toolbar control does` to FAIL. Restore.

- [ ] **Step 6: Commit**

```bash
git add packages/embed/src/index.ts packages/embed/src/style.ts packages/embed/src/icons.ts packages/embed/README.md packages/embed/test/embed.test.ts
git commit -m "feat(embed): labelled controls on phones with a More panel, and host hooks for colours and face

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---

## Task 10: A self-contained build of `@superlibrary/embed` for hosts outside this repository

Same branch and worktree as Task 9 (`feat/p4-embed`); the bundle carries Task 9's phone toolbar to Superpipeline.

**Files:**
- Create: `packages/embed/vite.bundle.config.ts`, `packages/embed/bundle/superlibrary-embed.d.ts`, `packages/embed/test/bundle.test.ts`, `packages/embed/test/bundle-types.ts`
- Modify: `packages/embed/package.json` (script `bundle`, devDependency `vite`), `packages/embed/README.md`, `.gitignore` (`packages/embed/dist/`)

**Interfaces:**
- Consumes: `packages/embed/src/index.ts` exports `mountArtifact`, `MountOptions`, `Mounted`, `ShareInfo`, `Theme`, `formatBytes`, `visibilityWords`, `SANDBOX`.
- Produces: `pnpm --filter @superlibrary/embed bundle` writes `packages/embed/dist/superlibrary-embed.js` (one ES module, no imports) and `packages/embed/dist/superlibrary-embed.d.ts`. Task 22 vendors both.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/embed/test/bundle.test.ts
// @vitest-environment node
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');

describe('the bundle for hosts outside this repository (decision O3)', () => {
  it('is one self-contained ES module that exports the SDK', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'embed-bundle-'));
    await build({ root, configFile: join(root, 'vite.bundle.config.ts'), logLevel: 'silent', build: { outDir, emptyOutDir: true } });
    const js = readFileSync(join(outDir, 'superlibrary-embed.js'), 'utf8');
    expect(js).not.toMatch(/^\s*import[\s{*]/m);           // the contract is inlined: a host resolves nothing
    expect(js).not.toMatch(/^\s*export\s[^\n]*\bfrom\s*['"]/m);
    expect(js).toMatch(/export\s*\{[^}]*\bmountArtifact\b/);
    expect(js).toContain('allow-scripts allow-popups-to-escape-sandbox');   // the contract's sandbox, unchanged
    expect(Buffer.byteLength(js)).toBeLessThan(80_000);     // zod is not dragged in
  }, 60_000);
});
```

```ts
// packages/embed/test/bundle-types.ts
// Checked by `tsc --noEmit` (the package typecheck includes test/): the hand-kept public types of the
// bundle are exactly the source's, so a host that vendors them cannot drift from what the SDK does.
import type * as Bundle from '../bundle/superlibrary-embed';
import type * as Src from '../src/index';
import type { EmbedGrant } from '@superlibrary/contract';

type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
const checks: [
  Same<Bundle.MountOptions, Src.MountOptions>,
  Same<Bundle.Mounted, Src.Mounted>,
  Same<Bundle.ShareInfo, Src.ShareInfo>,
  Same<Bundle.Theme, Src.Theme>,
  Same<Bundle.EmbedGrant, EmbedGrant>,
  Same<typeof Bundle.mountArtifact, typeof Src.mountArtifact>,
  Same<typeof Bundle.formatBytes, typeof Src.formatBytes>,
  Same<typeof Bundle.visibilityWords, typeof Src.visibilityWords>,
] = [true, true, true, true, true, true, true, true];
export { checks };
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @superlibrary/embed test -- test/bundle.test.ts; pnpm --filter @superlibrary/embed typecheck`
Expected: FAIL (no `vite.bundle.config.ts`; `../bundle/superlibrary-embed` not found).

- [ ] **Step 3: Write the bundle config, the types and the script**

```ts
// packages/embed/vite.bundle.config.ts
import { defineConfig } from 'vite';

/**
 * One self-contained ES module, for products outside this repository that vendor it (plan decision
 * O3). The contract is inlined (it is `sideEffects: false`), nothing is minified, so a reviewer of a
 * vendoring PR can read what changed.
 */
export default defineConfig({
  build: {
    lib: { entry: 'src/index.ts', formats: ['es'], fileName: () => 'superlibrary-embed.js' },
    outDir: 'dist',
    emptyOutDir: true,
    minify: false,
    sourcemap: false,
    target: 'es2022',
  },
});
```

```ts
// packages/embed/bundle/superlibrary-embed.d.ts
/**
 * The public types of `@superlibrary/embed` for hosts that vendor `superlibrary-embed.js`.
 * Hand-kept; `test/bundle-types.ts` fails the typecheck when they differ from the source.
 */
export type Theme = 'light' | 'dark' | 'system';
export type Scope = 'workspace' | `board:${string}`;
export type View =
  | 'html' | 'markdown' | 'image' | 'svg' | 'pdf' | 'code' | 'text' | 'json' | 'yaml' | 'toml'
  | 'csv' | 'tsv' | 'ipynb' | 'mermaid' | 'graphviz' | 'audio' | 'video' | 'download';
export interface FileEntry { path: string; mediaType: string; view: View; bytes: number }
export interface EmbedGrant {
  url: string;
  downloadUrl: string | null;
  expiresAt: string;
  version: number;
  itemUrl: string;
  entry: string;
  files: FileEntry[];
}
export interface ShareInfo { scope: Scope; boardVisible?: boolean; canWiden: boolean; title?: string }
export interface MountOptions {
  itemId: string;
  version?: number;
  getEmbedUrl: (q: { itemId: string; version?: number }) => Promise<EmbedGrant>;
  appUrl?: string;
  height?: number;
  clipboard?: Pick<Clipboard, 'writeText'>;
  getVersions?: (q: { itemId: string }) => Promise<number[]>;
  getShareInfo?: (q: { itemId: string }) => Promise<ShareInfo>;
  setScope?: (q: { itemId: string; scope: 'workspace' }) => Promise<unknown>;
  title?: string;
  theme?: Theme;
  onVersionChange?: (version: number) => void;
  onScopeChange?: (info: ShareInfo) => void;
  nonce?: string;
}
export interface Mounted {
  iframe: HTMLIFrameElement;
  setTheme(theme: Theme): void;
  setVersion(version: number): Promise<boolean>;
  destroy(): void;
}
export declare const SANDBOX: string;
export declare function mountArtifact(el: HTMLElement, opts: MountOptions): Promise<Mounted>;
export declare function formatBytes(n: number): string;
export declare function visibilityWords(info: ShareInfo): string;
```

In `packages/embed/package.json`: add `"bundle": "vite build --config vite.bundle.config.ts && cp bundle/superlibrary-embed.d.ts dist/"` to `scripts`, and `"vite": "^8.0.16"` to `devDependencies` (then `pnpm install`). Add `packages/embed/dist/` to `.gitignore`.

Append to `packages/embed/README.md`:

```markdown
## Hosts outside this repository

The package is private to this workspace. A product in another repository vendors a build:

1. `pnpm --filter @superlibrary/embed bundle` writes `dist/superlibrary-embed.js` (one ES module,
   nothing to resolve) and `dist/superlibrary-embed.d.ts` (its types; `test/bundle-types.ts` holds
   them equal to the source).
2. The host copies both and records the superlibrary commit and each file's SHA-256 beside them;
   Superpipeline does this with `scripts/vendor-superlibrary-embed.sh <superlibrary checkout>`, and
   a test there fails if a file differs from its recorded hash.
3. The host's duties above still apply: mint with the person's own token, from an origin listed in
   `EMBED_HOSTS` and `FRAME_ANCESTORS`.
```

- [ ] **Step 4: Run the tests and the build**

Run: `pnpm install && pnpm --filter @superlibrary/embed test && pnpm --filter @superlibrary/embed typecheck && pnpm --filter @superlibrary/embed bundle && ls -l packages/embed/dist`
Expected: PASS; `dist/` holds `superlibrary-embed.js` and `superlibrary-embed.d.ts`.

- [ ] **Step 5: Revert-proof**

Delete `nonce?: string;` from the bundle's `MountOptions`; expect `pnpm --filter @superlibrary/embed typecheck` to FAIL in `bundle-types.ts`. Restore. Add `rollupOptions: { external: ['@superlibrary/contract'] }` to the config's `build`; expect `bundle.test.ts` to FAIL (an import remains). Restore.

- [ ] **Step 6: Commit, push and open P4-EMB**

```bash
git add packages/embed/vite.bundle.config.ts packages/embed/bundle packages/embed/test/bundle.test.ts packages/embed/test/bundle-types.ts packages/embed/package.json packages/embed/README.md .gitignore pnpm-lock.yaml
git commit -m "feat(embed): a self-contained bundle and pinned public types for hosts in other repositories

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
git push -u origin feat/p4-embed
gh pr create --title "embed: labelled phone toolbar, host hooks, and a self-contained bundle for other repositories" --body "$(cat <<'EOF'
Plan tasks 9-10 of docs/superpowers/plans/2026-10-10-superlibrary-phase-4.md: on phones every toolbar control keeps its words (secondary ones in a labelled More panel), host hooks for colours and face, and (decision O3) pnpm --filter @superlibrary/embed bundle writes one ES module with the contract inlined, plus hand-kept public types held equal to the source by a type test. Superpipeline vendors both for its card drawer.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Merge on green.

---

## Task 11: The token layer: one source, generated, in the suite's shape

Operator direction A (2026-10-09): one shared design system across the products, each keeping its own accent and mark; Superlibrary is the first product built on it. This task makes Superlibrary's tokens the shape that system will take, so the shared part can later move into a suite package with no change to the app: one source file, a generator with contrast contracts, and generated CSS custom properties in three layers. Names follow Supermessage's `design/tokens.toml` where they mean the same thing (studied, not changed: `--color-surface`, `--color-surface-sunken`, `--color-surface-raised`, `--color-border`, `--color-border-strong`, `--color-content`, `--color-content-muted`, `--color-content-faint`, `--color-accent`, `--color-accent-content`, `--color-accent-soft`, `--color-danger`, `--color-ok`, `--color-scrim`; type roles `label`, `meta`, `ui`, `ui-lg`, `body`; radii `control`, `card`, `pill`, `sharp`; motion `quick`, `settle`, `easing`; `elevation-overlay`), and every colour carries the contrast it must meet, asserted before a byte is written, as Supermessage's generator does.

P4-APP starts here, after P4-API is merged: `git -C /Users/rakeshgangwar/SuperJackfruit/superlibrary worktree add -b feat/p4-app /Users/rakeshgangwar/SuperJackfruit/.worktrees/superlibrary-p4-app origin/main`. It builds on PR #16 (`feat/mark-and-html-sniff`: `Mark.svelte`, `AppHeader.svelte`, the coral `--accent`/`--mark`); Task 0 checks that it merged (assumption A23).

**A working direction, not final** (operator, 2026-10-09). Direction A, IBM Plex, the coral accent, the product accents and the parent identity may still change. So every colour, face, size, radius and space, and both marks (Superlibrary's book spines, `Mark.svelte`; the parent's hexagons, `ParentMark.svelte`), come from `design/tokens.toml` and those two components only; nothing is hard-coded in a page or a component (Task 12's guard scans `apps/web/src` for colour and font literals). A later change is a token edit, not a refactor. This plan builds the system for Superlibrary only; rolling it out to other products is not planned here.

**The layers** (the generated `tokens.css` keeps them apart):
1. **Suite** (`[suite.*]`), shared by every product: neutrals, danger and ok, scrim, the type faces and scale, spacing, the tap target, radii, the focus ring, motion and elevation. Components read only `--color-*`, `--font-*`, `--type-*`, `--space-*`, `--radius-*`, `--focus-*`, `--motion-*`, `--elevation-*`.
2. **Product** (`[product.*]`), Superlibrary's own: `--accent`, `--accent-content`, `--accent-soft`, `--accent-mark` (coral `#ff7a59` on dark, the deeper `#b04a1e` on light, where `#ff7a59` is 2.5:1), and the outcome colours `--outcome-*`. The suite layer reads the product layer: `--color-accent: var(--accent)`, so another product swaps only its `[product]` table.
3. **Parent** (`[parent]`), **provisional**: the Super Jackfruit Labs identity, operator working decision 2026-10-09 option C, **"Ink"**: a neutral parent with **no hue of its own** (colour belongs only to products). Neutrals Ink `#121722`, Slate `#3a4252`, Mist `#8a93a3`, Paper `#f5f6f8`; the mark is three hexagons (cells of the jackfruit's skin) in `#f5f6f8` on the shared ink product tile `#121722` (dark: `#e6e9ee` on `#1c2430`). The generator refuses any parent accent. The suite switcher and the footer's "Super Jackfruit Labs" link show the parent (Task 13).
4. **Products** (`[suite.products]`): each product's accent and address, for the suite switcher: AgentPod cyan `#5fb3d4`, Superpipeline marigold `#f4a526`, Superwitness jade `#3fd0a2`, Supermessage violet `#9d8ff0`, Superlibrary coral `#ff7a59`, each checked at 3:1 on the ink tile.

Faces: **IBM Plex Sans** for headings and body, **IBM Plex Mono** for code and data, no others (operator decision), self-hosted from `@fontsource` so the content-security rules stay `'self'`.

**Files:**
- Create: `design/tokens.toml`, `scripts/tokens.mjs` (parse, check, render), `scripts/generate-tokens.mjs` (the CLI), `apps/web/src/lib/kit/tokens.css` and `apps/web/src/lib/kit/suite.generated.ts` (generated), `apps/web/src/lib/kit/tokens.test.ts`
- Modify: root `package.json` (script `tokens`, devDependency `smol-toml`), `apps/web/package.json` (dependencies `@fontsource/ibm-plex-sans`, `@fontsource/ibm-plex-mono`), `apps/web/src/app.css` (its token lines go; legacy names map to the new ones), `apps/web/src/routes/+layout.svelte` (fonts and `tokens.css`), `apps/web/src/lib/Mark.svelte` (`--accent-mark`), `apps/web/svelte.config.js` (alias `$kit`)

**Interfaces:**
- Consumes: Supermessage's naming (read only); PR #16's `Mark.svelte`.
- Produces:
  - `design/tokens.toml` with tables `[suite.color.light]`, `[suite.color.dark]`, `[suite.font]`, `[suite.type.<role>]`, `[suite.space]`, `[suite.radius]`, `[suite.focus]`, `[suite.motion]`, `[suite.elevation]`, `[suite.products]`, `[product]`, `[product.color.light|dark]`, `[product.outcome.light|dark]`, `[parent]`, `[parent.color]`
  - `scripts/tokens.mjs`: `export function renderTokens(tomlText: string): string` (throws `ContrastError` naming the colour, its ground and the ratio), `export function renderSuite(tomlText: string): string` (the TypeScript module), `export function contrast(a: string, b: string): number`
  - `pnpm tokens` regenerates `apps/web/src/lib/kit/tokens.css` and `apps/web/src/lib/kit/suite.generated.ts` (`export const PARENT = { name }`, `export const PRODUCTS: Array<{ key; name; accent; url }>`); `tokens.test.ts` fails on drift
  - CSS: `--parent-ink|slate|mist|paper|tile|tile-dark|mark|mark-dark` (and `--parent-tile`/`--parent-mark` switched to the dark pair in dark), `--product-<key>-accent`, `--color-*` (theme-switched), `--color-<name>-light` and `--color-<name>-dark` (fixed, for hosts such as the embed that theme separately), `--accent`, `--accent-content`, `--accent-soft`, `--accent-mark`, `--outcome-<o>` (+ `-light`/`-dark`), `--font-sans`, `--font-mono`, `--type-<role>-size|line|weight`, `--space-1|2|3|4|6|8`, `--tap`, `--radius-control|card|pill|sharp`, `--focus-ring`, `--focus-offset`, `--motion-quick|settle|easing`, `--elevation-overlay`. Theme: `prefers-color-scheme`, overridden by `<html data-theme="light|dark">`.
  - alias `$kit` → `apps/web/src/lib/kit` (when the kit moves to a suite package, only this alias changes)

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/kit/tokens.test.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OUTCOMES } from '@superlibrary/contract';
// @ts-expect-error -- a plain ES module script, typed by its use here
import { contrast, renderSuite, renderTokens } from '../../../../../scripts/tokens.mjs';

const REPO = join(import.meta.dirname, '..', '..', '..', '..', '..');
const source = readFileSync(join(REPO, 'design', 'tokens.toml'), 'utf8');
const css = readFileSync(join(import.meta.dirname, 'tokens.css'), 'utf8');

describe('the token layer (operator direction A)', () => {
  it('tokens.css and suite.generated.ts are exactly what design/tokens.toml generates (run pnpm tokens)', () => {
    expect(css).toBe(renderTokens(source));
    expect(readFileSync(join(import.meta.dirname, 'suite.generated.ts'), 'utf8')).toBe(renderSuite(source));
  });
  it('keeps the layers: the suite reads the product; the parent is Ink, neutral, with no accent', () => {
    expect(css).toContain('--color-accent: var(--accent);');
    for (const n of ['--accent:', '--accent-content:', '--accent-soft:', '--accent-mark:']) expect(css, n).toContain(n);
    for (const [k, v] of [['ink', '#121722'], ['slate', '#3a4252'], ['mist', '#8a93a3'], ['paper', '#f5f6f8'], ['tile', '#121722'], ['tile-dark', '#1c2430'], ['mark', '#f5f6f8'], ['mark-dark', '#e6e9ee']]) {
      expect(css, k).toContain(`--parent-${k}: ${v};`);
    }
    expect(css).not.toMatch(/--parent-accent/);
    expect(() => renderTokens(source.replace('[parent.color]', '[parent.color]\naccent = { value = "#ff0000" }'))).toThrow(/no accent/);
  });
  it('colour belongs to products: each accent, for the switcher, at 3:1 on the ink tile', () => {
    for (const [k, v] of [['agentpod', '#5fb3d4'], ['superpipeline', '#f4a526'], ['superwitness', '#3fd0a2'], ['supermessage', '#9d8ff0'], ['superlibrary', '#ff7a59']]) {
      expect(css, k).toContain(`--product-${k}-accent: ${v};`);
    }
    expect(() => renderTokens(source.replace('accent = "#5fb3d4"', 'accent = "#1c2430"'))).toThrow(/agentpod .*tile/);
  });
  it('Plex only: IBM Plex Sans for words, IBM Plex Mono for code and data', () => {
    expect(css).toMatch(/--font-sans: 'IBM Plex Sans', /);
    expect(css).toMatch(/--font-mono: 'IBM Plex Mono', /);
    expect(css.match(/--font-[a-z]+:/g)).toEqual(['--font-sans:', '--font-mono:']);
  });
  it('every outcome has a colour in both themes, and the accent is coral', () => {
    for (const o of OUTCOMES) expect(css.match(new RegExp(`--outcome-${o}:`, 'g'))?.length, o).toBe(3);   // :root, dark media, [data-theme=dark]
    expect(css).toContain('--accent: #ff7a59;');
  });
  it('a colour that misses its contrast fails the build, naming it', () => {
    const bad = source.replace('content-faint = { value = "#6b6b70"', 'content-faint = { value = "#c0c0c4"');
    expect(() => renderTokens(bad)).toThrow(/content-faint .*surface.* needs 4\.5/);
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @superlibrary/web test -- src/lib/kit/tokens.test.ts`
Expected: FAIL (`design/tokens.toml` missing).

- [ ] **Step 3: Write the source, the generator and the wiring**

```toml
# design/tokens.toml
# Superlibrary's design tokens, as one source. scripts/generate-tokens.mjs writes
# apps/web/src/lib/kit/tokens.css from it; do not edit that file. CI fails on drift
# (apps/web/src/lib/kit/tokens.test.ts), and on any colour that misses its contrast.
#
# Shaped as the suite design system will be (operator direction A, 2026-10-09):
#   [suite.*]   shared by every product: neutrals, type, spacing, radii, focus, motion
#   [product]   this product's own layer: its accent, its mark, its own meanings (outcomes)
#   [parent]    the Super Jackfruit Labs identity: designed separately, reserved here
# When the suite package exists, [suite.*] moves into it and this file keeps [product].
# Names follow Supermessage's design/tokens.toml where they mean the same thing.

[suite.color.light]
surface = { value = "#fbfbfd" }
surface-sunken = { value = "#f2f2f6", contrast = [{ against = "surface", min = 1.04, max = 1.13 }] }
surface-raised = { value = "#ffffff" }
border = { value = "#e5e5ea" }
border-strong = { value = "#c7c7cc" }
content = { value = "#1d1d1f", contrast = [{ against = "surface", min = 12.0 }] }
content-muted = { value = "#55555a", contrast = [{ against = "surface", min = 6.0 }, { against = "surface-sunken", min = 6.0 }] }
content-faint = { value = "#6b6b70", contrast = [{ against = "surface", min = 4.5 }, { against = "surface-sunken", min = 4.5 }, { against = "surface-raised", min = 4.5 }] }
danger = { value = "#c0392b", contrast = [{ against = "surface", min = 4.5 }, { against = "surface-sunken", min = 4.5 }] }
ok = { value = "#1a7f4b", contrast = [{ against = "surface", min = 4.5 }] }
scrim = { value = "rgb(0 0 0 / 0.45)" }

[suite.color.dark]
surface = { value = "#161618" }
surface-sunken = { value = "#0f0f11", contrast = [{ against = "surface", min = 1.04, max = 1.13 }] }
surface-raised = { value = "#1f1f22" }
border = { value = "#343437" }
border-strong = { value = "#4a4a4f" }
content = { value = "#f5f5f7", contrast = [{ against = "surface", min = 12.0 }] }
content-muted = { value = "#c7c7cc", contrast = [{ against = "surface", min = 6.0 }, { against = "surface-raised", min = 6.0 }] }
content-faint = { value = "#98989d", contrast = [{ against = "surface", min = 4.5 }, { against = "surface-sunken", min = 4.5 }, { against = "surface-raised", min = 4.5 }] }
danger = { value = "#ff6b5b", contrast = [{ against = "surface", min = 4.5 }, { against = "surface-raised", min = 4.5 }] }
ok = { value = "#4cc38a", contrast = [{ against = "surface", min = 4.5 }] }
scrim = { value = "rgb(0 0 0 / 0.65)" }

[suite.font]
sans = "'IBM Plex Sans', system-ui, -apple-system, sans-serif"
mono = "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace"

# Web sizes; iOS fields stay at 16px or more (app.css), whatever the role.
[suite.type.label]
web = { size = "0.75rem", line_height = 1.3, weight = 600 }
[suite.type.meta]
web = { size = "0.8125rem", line_height = 1.35, weight = 400 }
[suite.type.ui]
web = { size = "0.875rem", line_height = 1.4, weight = 400 }
[suite.type.ui-lg]
web = { size = "0.9375rem", line_height = 1.4, weight = 600 }
[suite.type.body]
web = { size = "0.9375rem", line_height = 1.55, weight = 400 }
[suite.type.title]
web = { size = "1.375rem", line_height = 1.25, weight = 600 }

[suite.space]
1 = "4px"
2 = "8px"
3 = "12px"
4 = "16px"
6 = "24px"
8 = "32px"
# Apple's minimum tap target; iOS is the operator's primary platform.
tap = "44px"

[suite.radius]
control = "6px"
card = "8px"
pill = "9999px"
sharp = "0"

[suite.focus]
ring = "2px solid var(--color-accent)"
offset = "2px"

[suite.motion]
quick = "120ms"
settle = "200ms"
easing = "cubic-bezier(0.2, 0, 0, 1)"

[suite.elevation]
overlay = "0 8px 24px rgb(0 0 0 / 0.18)"

[product]
name = "Superlibrary"

# Coral. #ff7a59 is 2.5:1 on a light page, under the 3:1 a graphic needs, so light uses the deeper shade.
[product.color.light]
accent = { value = "#b04a1e", contrast = [{ against = "surface", min = 4.5 }, { against = "surface-sunken", min = 4.5 }] }
accent-content = { value = "#ffffff", contrast = [{ against = "accent", min = 4.5 }] }
accent-soft = { value = "#fbe9e2", contrast = [{ against = "content", min = 4.5 }] }
mark = { value = "#b04a1e", contrast = [{ against = "surface", min = 3.0 }] }

[product.color.dark]
accent = { value = "#ff7a59", contrast = [{ against = "surface", min = 4.5 }, { against = "surface-raised", min = 4.5 }] }
accent-content = { value = "#161618", contrast = [{ against = "accent", min = 4.5 }] }
accent-soft = { value = "#3a2219", contrast = [{ against = "content", min = 4.5 }] }
mark = { value = "#ff7a59", contrast = [{ against = "surface", min = 3.0 }] }

# Spec §3 outcomes. Always shown with the outcome's word: colour never carries meaning alone.
[product.outcome.light]
approved = { value = "#1a7f4b", contrast = [{ against = "surface", min = 4.5 }, { against = "surface-sunken", min = 4.5 }] }
completed = { value = "#0f766e", contrast = [{ against = "surface", min = 4.5 }, { against = "surface-sunken", min = 4.5 }] }
in-progress = { value = "#2356c2", contrast = [{ against = "surface", min = 4.5 }, { against = "surface-sunken", min = 4.5 }] }
superseded = { value = "#6d4fb3", contrast = [{ against = "surface", min = 4.5 }, { against = "surface-sunken", min = 4.5 }] }
rejected = { value = "#b42318", contrast = [{ against = "surface", min = 4.5 }, { against = "surface-sunken", min = 4.5 }] }
failed = { value = "#a14306", contrast = [{ against = "surface", min = 4.5 }, { against = "surface-sunken", min = 4.5 }] }
abandoned = { value = "#6b6b70", contrast = [{ against = "surface", min = 4.5 }, { against = "surface-sunken", min = 4.5 }] }

[product.outcome.dark]
approved = { value = "#4cc38a", contrast = [{ against = "surface", min = 4.5 }, { against = "surface-raised", min = 4.5 }] }
completed = { value = "#2dd4bf", contrast = [{ against = "surface", min = 4.5 }, { against = "surface-raised", min = 4.5 }] }
in-progress = { value = "#8ab4ff", contrast = [{ against = "surface", min = 4.5 }, { against = "surface-raised", min = 4.5 }] }
superseded = { value = "#b39cf0", contrast = [{ against = "surface", min = 4.5 }, { against = "surface-raised", min = 4.5 }] }
rejected = { value = "#ff6b5b", contrast = [{ against = "surface", min = 4.5 }, { against = "surface-raised", min = 4.5 }] }
failed = { value = "#f79009", contrast = [{ against = "surface", min = 4.5 }, { against = "surface-raised", min = 4.5 }] }
abandoned = { value = "#98989d", contrast = [{ against = "surface", min = 4.5 }, { against = "surface-raised", min = 4.5 }] }

# Each product's accent and address, for the suite switcher. Colour belongs only to products (the
# parent has none). An empty url is a product whose address is not settled yet: not linked.
[suite.products]
agentpod = { name = "AgentPod", accent = "#5fb3d4", url = "https://console.agentpod.dev" }
superpipeline = { name = "Superpipeline", accent = "#f4a526", url = "https://app.superpipeline.dev" }
superwitness = { name = "Superwitness", accent = "#3fd0a2", url = "" }
supermessage = { name = "Supermessage", accent = "#9d8ff0", url = "" }
superlibrary = { name = "Superlibrary", accent = "#ff7a59", url = "https://app.superlibrary.dev" }

# The Super Jackfruit Labs identity, PROVISIONAL: operator working decision 2026-10-09, option C
# "Ink". A neutral parent with no hue of its own; the generator refuses a parent accent. Changing it
# is an edit here (and to ParentMark.svelte's geometry), nothing else.
[parent]
name = "Super Jackfruit Labs"

[parent.color]
ink = { value = "#121722" }
slate = { value = "#3a4252" }
mist = { value = "#8a93a3", contrast = [{ against = "ink", min = 4.5 }] }
paper = { value = "#f5f6f8", contrast = [{ against = "ink", min = 12.0 }] }
# The parent mark: three hexagons (cells of the jackfruit's skin), white on the shared ink product tile.
tile = { value = "#121722" }
tile-dark = { value = "#1c2430" }
mark = { value = "#f5f6f8", contrast = [{ against = "tile", min = 4.5 }] }
mark-dark = { value = "#e6e9ee", contrast = [{ against = "tile-dark", min = 4.5 }] }
```

```js
// scripts/tokens.mjs
/**
 * design/tokens.toml → CSS custom properties, with every colour's contrast contract asserted first
 * (Supermessage's rule: an accessibility floor is a build failure, not a comment).
 */
import { parse } from 'smol-toml';

export class ContrastError extends Error {}

const HEX = /^#[0-9a-f]{6}$/i;
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** WCAG 2 contrast ratio of two #rrggbb colours. */
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** One theme's colours: suite neutrals, then the product layer, then outcomes, all checked together. */
function theme(t, name) {
  const all = { ...t.suite.color[name], ...t.product.color[name] };
  const outcomes = t.product.outcome[name];
  const value = (k) => (all[k] ?? outcomes[k])?.value;
  for (const [k, spec] of [...Object.entries(all), ...Object.entries(outcomes)]) {
    for (const c of spec.contrast ?? []) {
      const fg = spec.value;
      const bg = value(c.against);
      if (!HEX.test(fg) || !HEX.test(bg ?? '')) throw new ContrastError(`${name} ${k}: contrast needs #rrggbb on both sides`);
      const r = contrast(fg, bg);
      if (r < c.min || (c.max !== undefined && r > c.max)) {
        throw new ContrastError(`${name} ${k} on ${c.against} is ${r.toFixed(2)}:1 and needs ${c.min}${c.max !== undefined ? ` to ${c.max}` : ''}`);
      }
    }
  }
  return { all, outcomes };
}

const PRODUCT = { accent: 'accent', 'accent-content': 'accent-content', 'accent-soft': 'accent-soft', mark: 'accent-mark' };
function colours({ all, outcomes }) {
  const lines = [];
  for (const [k, spec] of Object.entries(all)) lines.push(k in PRODUCT ? `  --${PRODUCT[k]}: ${spec.value};` : `  --color-${k}: ${spec.value};`);
  for (const [k, spec] of Object.entries(outcomes)) lines.push(`  --outcome-${k}: ${spec.value};`);
  return lines;
}

/** The parent (option C "Ink"): neutral, checked against itself, never an accent. */
function parent(t) {
  const c = t.parent?.color ?? {};
  if (Object.keys(c).some((k) => k.startsWith('accent'))) throw new Error('[parent.color] has no accent: the parent is neutral; colour belongs only to products');
  for (const [k, spec] of Object.entries(c)) {
    for (const x of spec.contrast ?? []) {
      const r = contrast(spec.value, c[x.against].value);
      if (r < x.min) throw new ContrastError(`parent ${k} on ${x.against} is ${r.toFixed(2)}:1 and needs ${x.min}`);
    }
  }
  for (const [k, p] of Object.entries(t.suite.products)) {
    for (const tile of ['tile', 'tile-dark']) {
      const r = contrast(p.accent, c[tile].value);
      if (r < 3) throw new ContrastError(`${k} accent on the parent ${tile} is ${r.toFixed(2)}:1 and needs 3`);
    }
  }
  return c;
}

/** The suite's names and addresses as a module, for the switcher (suite.generated.ts). */
export function renderSuite(text) {
  const t = parse(text);
  const products = Object.entries(t.suite.products).map(([key, p]) => ({ key, name: p.name, accent: p.accent, url: p.url }));
  return [
    '// Generated by scripts/generate-tokens.mjs from design/tokens.toml. Do not edit: run `pnpm tokens`.',
    `export const PARENT = ${JSON.stringify({ name: t.parent.name })} as const;`,
    `export const PRODUCTS: ReadonlyArray<{ key: string; name: string; accent: string; url: string }> = ${JSON.stringify(products, null, 2)};`,
    '',
  ].join('\n');
}

export function renderTokens(text) {
  const t = parse(text);
  const pc = parent(t);
  const light = theme(t, 'light');
  const dark = theme(t, 'dark');
  const fixed = [];
  for (const [label, th] of [['light', light], ['dark', dark]]) {
    for (const [k, spec] of Object.entries(th.all)) fixed.push(`  --${k in PRODUCT ? PRODUCT[k] : `color-${k}`}-${label}: ${spec.value};`);
    for (const [k, spec] of Object.entries(th.outcomes)) fixed.push(`  --outcome-${k}-${label}: ${spec.value};`);
  }
  const type = Object.entries(t.suite.type).flatMap(([role, r]) => [
    `  --type-${role}-size: ${r.web.size};`, `  --type-${role}-line: ${r.web.line_height};`, `  --type-${role}-weight: ${r.web.weight ?? 400};`,
  ]);
  const shared = [
    `  --font-sans: ${t.suite.font.sans};`, `  --font-mono: ${t.suite.font.mono};`, ...type,
    ...Object.entries(t.suite.space).map(([k, v]) => (k === 'tap' ? `  --tap: ${v};` : `  --space-${k}: ${v};`)),
    ...Object.entries(t.suite.radius).map(([k, v]) => `  --radius-${k}: ${v};`),
    `  --focus-ring: ${t.suite.focus.ring};`, `  --focus-offset: ${t.suite.focus.offset};`,
    ...Object.entries(t.suite.motion).map(([k, v]) => `  --motion-${k}: ${v};`),
    `  --elevation-overlay: ${t.suite.elevation.overlay};`,
    ...Object.entries(pc).map(([k, spec]) => `  --parent-${k}: ${spec.value};`),
    ...Object.entries(t.suite.products).map(([k, p]) => `  --product-${k}-accent: ${p.accent};`),
    '  /* The suite layer reads the product layer: another product changes only [product]. */',
    '  --color-accent: var(--accent);', '  --color-accent-content: var(--accent-content);', '  --color-accent-soft: var(--accent-soft);',
  ];
  const parentDark = ['  --parent-tile: var(--parent-tile-dark);', '  --parent-mark: var(--parent-mark-dark);'];
  return [
    '/*',
    ' * Generated by scripts/generate-tokens.mjs from design/tokens.toml.',
    ' * Do not edit: edit the source and run `pnpm tokens`. CI fails on drift.',
    ` * Product: ${t.product.name}. Layers: suite (shared), product (accent, mark, outcomes), parent.`,
    ` * Parent: ${t.parent.name} ("Ink": neutral, no accent; colour belongs only to products).`,
    ' */',
    ':root {', '  color-scheme: light;', ...shared, ...colours(light), ...fixed, '}',
    '@media (prefers-color-scheme: dark) {', '  :root:not([data-theme="light"]) {', '    color-scheme: dark;', ...[...colours(dark), ...parentDark].map((l) => `  ${l}`), '  }', '}',
    ':root[data-theme="dark"] {', '  color-scheme: dark;', ...colours(dark), ...parentDark, '}',
    '',
  ].join('\n');
}
```

```js
// scripts/generate-tokens.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderSuite, renderTokens } from './tokens.mjs';

const root = join(import.meta.dirname, '..');
const source = readFileSync(join(root, 'design/tokens.toml'), 'utf8');
for (const [file, text] of [['apps/web/src/lib/kit/tokens.css', renderTokens(source)], ['apps/web/src/lib/kit/suite.generated.ts', renderSuite(source)]]) {
  writeFileSync(join(root, file), text);
  console.log(`wrote ${file}`);
}
```

Root `package.json`: add `"tokens": "node scripts/generate-tokens.mjs"` to `scripts` and `"smol-toml": "^1.3.4"` to `devDependencies`. `apps/web/package.json` `dependencies`: `"@fontsource/ibm-plex-sans": "^5.2.5"`, `"@fontsource/ibm-plex-mono": "^5.2.5"`. Then `pnpm install && pnpm tokens`.

`apps/web/svelte.config.js`: `kit: { adapter: adapter({ fallback: 'index.html' }), alias: { $kit: 'src/lib/kit' } }`.

`apps/web/src/routes/+layout.svelte`, first imports:

```ts
  // IBM Plex only (operator decision): Sans for words, Mono for code and data. Self-hosted ('self').
  import '@fontsource/ibm-plex-sans/400.css';
  import '@fontsource/ibm-plex-sans/500.css';
  import '@fontsource/ibm-plex-sans/600.css';
  import '@fontsource/ibm-plex-mono/400.css';
  import '$kit/tokens.css';
  import '../app.css';
```

`apps/web/src/app.css`: delete its `:root { … }` token line and its dark `@media` token line (from PR #16), then rename the legacy names and literals:

```bash
cd apps/web/src && perl -pi -e 's/var\(--fg\)/var(--color-content)/g; s/var\(--bg\)/var(--color-surface)/g; s/var\(--muted\)/var(--color-content-muted)/g; s/var\(--line\)/var(--color-border)/g; s/var\(--accent\)/var(--color-accent)/g; s/var\(--on-accent\)/var(--color-accent-content)/g; s/#c0392b/var(--color-danger)/g; s/rgb\(0 0 0 \/ 0\.45\)/var(--color-scrim)/g; s/0 10px 40px rgb\(0 0 0 \/ 0\.3\)/var(--elevation-overlay)/g; s/color: #fff;/color: var(--color-accent-content);/g; s/border-radius: 8px/border-radius: var(--radius-control)/g; s/border-radius: 12px/border-radius: var(--radius-card)/g' app.css
```

then delete the line `@media (prefers-color-scheme: dark) { .danger-outline, .danger-text { … } }` (the dark `--color-danger` does it), and set the body and code faces:

```css
body { margin: 0; background: var(--color-surface); color: var(--color-content); font: var(--type-body-weight) var(--type-body-size)/var(--type-body-line) var(--font-sans); }
code, pre, kbd, samp, .mono { font-family: var(--font-mono); }
h1, h2, h3 { font-family: var(--font-sans); font-weight: 600; }
```

`apps/web/src/lib/Mark.svelte`: `style="fill: var(--mark, #ff7a59)"` → `style="fill: var(--accent-mark)"` (no literal fallback: the token is the only source).

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @superlibrary/web test && pnpm --filter @superlibrary/web typecheck && pnpm --filter @superlibrary/web build`
Expected: PASS; the build emits the Plex `woff2` files under `_app/immutable/assets/`.

- [ ] **Step 5: Revert-proof**

Edit one value in `tokens.css` by hand; expect `tokens.css is exactly what design/tokens.toml generates` to FAIL. Restore with `pnpm tokens`. Remove the `if (r < c.min …) throw` line; expect `a colour that misses its contrast fails the build` to FAIL. Restore. Add `accent = { value = "#ff0000" }` under `[parent.color]` and run `pnpm tokens`; expect the generator to refuse. Remove the `parent(t)` call; expect `keeps the layers…` to FAIL. Restore.

- [ ] **Step 6: Commit**

```bash
git add design/tokens.toml scripts/tokens.mjs scripts/generate-tokens.mjs package.json pnpm-lock.yaml apps/web/package.json apps/web/svelte.config.js apps/web/src/lib/kit/tokens.css apps/web/src/lib/kit/suite.generated.ts apps/web/src/lib/kit/tokens.test.ts apps/web/src/app.css apps/web/src/routes/+layout.svelte apps/web/src/lib/Mark.svelte
git commit -m "feat(web): tokens from one source in the suite's shape: shared layer, coral product layer, Ink parent; IBM Plex

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---

## Task 12: The component kit

A small reusable kit, so pages compose parts instead of carrying their own styles (operator direction A): button, field (input and select), tabs, toolbar (labelled icons; on phones the secondary actions fold into **More**), dialog and confirm, toast, empty state, and the outcome badge. Shared patterns (the result list with its outcome edge, the timeline, filters) are in `kit.css`, which reads tokens only.

**Files:**
- Create: `apps/web/src/lib/kit/kit.css`, `Button.svelte`, `Field.svelte`, `Tabs.svelte`, `Toolbar.svelte`, `Icon.svelte`, `Toast.svelte`, `EmptyState.svelte`, `OutcomeBadge.svelte`, `outcome.ts`, `index.ts`, `kit.svelte.test.ts`, `kit.test.ts` (all under `apps/web/src/lib/kit/`), `apps/web/src/lib/no-markup-injection.test.ts`
- Move: `apps/web/src/lib/ConfirmDialog.svelte` → `apps/web/src/lib/kit/ConfirmDialog.svelte`, `apps/web/src/lib/ConfirmDialog.svelte.test.ts` → `apps/web/src/lib/kit/ConfirmDialog.svelte.test.ts`, `apps/web/src/lib/modal.ts` → `apps/web/src/lib/kit/modal.ts` (every importer updated: `git grep -l "lib/ConfirmDialog\|lib/modal\|'./modal'\|'./ConfirmDialog" apps/web/src`)
- Modify: `apps/web/src/routes/+layout.svelte` (imports `$kit/kit.css`), `apps/web/src/lib/ItemView.svelte` (its notice becomes a `Toast`)

**Interfaces:**
- Consumes: tokens (Task 11); `holdModal` (moved).
- Produces (later tasks import from `$kit/…`):
  - `<Button variant?='primary'|'secondary'|'danger'|'ghost' href? type? disabled? onclick? icon? children>` — an `<a class="kit-button">` with `href`, else a `<button>`
  - `<Field label hint? error? children(id)>` — labels its control by id, `aria-describedby` for hint and error
  - `<Tabs label items: Array<{ href; label; count?; current; tone? }>>` — a `nav` of links, `aria-current="page"`
  - `<Toolbar label items: ToolbarItem[]>`, `type ToolbarItem = { label; icon?: IconName; href?; onclick?; primary?: boolean; external?: boolean }` — every item shows its words; on phones (≤ 640 px) the non-primary items fold into a labelled **More** panel
  - `<Icon name size?>`, `type IconName = 'upload'|'link'|'external'|'more'|'check'|'close'`
  - `<Toast message tone?='ok'|'info'|'danger' onclose?>` — `role="status"` (or `alert` for danger), focusable, dismissible
  - `<EmptyState title body? action?>`
  - `<OutcomeBadge outcome>`, `OUTCOME_WORDS`, `OUTCOME_ORDER`, `outcomeVar(o)` from `$kit/outcome`
  - `<ConfirmDialog …>` unchanged props (Task 16 adds `reasonRequired`)
  - `kit.css` classes: `.kit-button` (+ `--primary|--danger|--ghost`), `.kit-field`, `.kit-tabs`, `.kit-toolbar`, `.kit-more`, `.kit-toast`, `.kit-empty`, `.outcome`, `.results .result .result-link .result-title .result-meta .snippet .replaced`, `.timeline`, `.filters .filter-grid .outcome-picks .pick`, `.searchbar`, `.inline-form`, `.entry`, `.count`, `.item-header .item-meta`, and the embed host hooks on `.viewer`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/src/lib/kit/kit.test.ts
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OUTCOMES } from '@superlibrary/contract';
import { OUTCOME_ORDER, OUTCOME_WORDS, outcomeVar } from './outcome';

const src = join(import.meta.dirname, '..', '..');
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? files(p) : [p]; });
}
describe('the kit reads tokens only (a working direction: a change must be a token edit)', () => {
  it('no colour or font literal anywhere in the app: design/tokens.toml is the one source', () => {
    const generated = new Set(['tokens.css', 'suite.generated.ts']);
    const scanned = files(src).filter((f) => /\.(css|svelte|ts)$/.test(f) && !/\.test\.ts$/.test(f) && !generated.has(f.split('/').at(-1)!));
    expect(scanned.some((f) => f.endsWith('kit.css'))).toBe(true);
    const offenders = scanned.flatMap((f) => {
      const text = readFileSync(f, 'utf8');
      const hits = [...text.matchAll(/#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\b(?![\w-])|rgba?\(|hsla?\(|font-family:\s*(?!var\()|'IBM Plex/g)].map((m) => m[0]);
      return hits.length ? [`${f}: ${hits.join(', ')}`] : [];
    });
    expect(offenders).toEqual([]);
  });
  it('every outcome has a word, a place, and a token', () => {
    expect(Object.keys(OUTCOME_WORDS).sort()).toEqual([...OUTCOMES].sort());
    expect([...OUTCOME_ORDER].sort()).toEqual([...OUTCOMES].sort());
    expect(outcomeVar('rejected')).toBe('var(--outcome-rejected)');
  });
  it('the embed in the app takes the suite colours and face', () => {
    const kit = readFileSync(join(import.meta.dirname, 'kit.css'), 'utf8');
    for (const n of ['bg', 'fg', 'muted', 'line', 'hover', 'accent', 'accent-content', 'danger']) {
      expect(kit, n).toMatch(new RegExp(`--sl-host-${n}: var\\(--`));
      expect(kit, `${n}-dark`).toMatch(new RegExp(`--sl-host-${n}-dark: var\\(--`));
    }
    expect(kit).toContain('--sl-host-font: var(--font-sans);');
  });
});
```

```ts
// apps/web/src/lib/kit/kit.svelte.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import Button from './Button.svelte';
import Tabs from './Tabs.svelte';
import Toolbar from './Toolbar.svelte';
import Toast from './Toast.svelte';
import EmptyState from './EmptyState.svelte';
import OutcomeBadge from './OutcomeBadge.svelte';
import { createRawSnippet } from 'svelte';

const mounted: ReturnType<typeof mount>[] = [];
const put = (C: any, props: Record<string, unknown>) => { const c = mount(C, { target: document.body, props }); mounted.push(c); flushSync(); return c; };
const text = (s: string) => createRawSnippet(() => ({ render: () => `<span>${s.replace(/</g, '&lt;')}</span>` }));
afterEach(() => { for (const c of mounted.splice(0)) unmount(c); document.body.innerHTML = ''; });

describe('the kit', () => {
  it('a Button with href is a link; without, a button; danger says so in its class', () => {
    put(Button, { href: '/upload', children: text('Upload') });
    put(Button, { variant: 'danger', onclick: vi.fn(), children: text('Remove') });
    expect(document.querySelector('a.kit-button')!.getAttribute('href')).toBe('/upload');
    expect(document.querySelector('button.kit-button--danger')!.getAttribute('type')).toBe('button');
  });
  it('Tabs mark the current one and show counts', () => {
    put(Tabs, { label: 'Outcome', items: [{ href: '/o', label: 'Everything', count: 3, current: false }, { href: '/o?outcome=rejected', label: 'Rejected', count: 1, current: true, tone: 'rejected' }] });
    const nav = document.querySelector('nav')!;
    expect(nav.getAttribute('aria-label')).toBe('Outcome');
    expect(document.querySelector('[aria-current="page"]')!.textContent).toContain('Rejected');
    expect(document.querySelector('[aria-current="page"]')!.textContent).toContain('1');
  });
  it('a Toolbar shows every item with its words, and folds the secondary ones into a labelled More', () => {
    const copy = vi.fn();
    put(Toolbar, { label: 'Item', items: [{ label: 'Upload a new version', icon: 'upload', href: '/upload?item=x', primary: true }, { label: 'Copy link', icon: 'link', onclick: copy }] });
    const bar = document.querySelector('[role="toolbar"]')!;
    expect(bar.getAttribute('aria-label')).toBe('Item');
    expect([...bar.querySelectorAll('.kit-toolbar-item')].map((e) => e.textContent!.trim())).toEqual(['Upload a new version', 'Copy link']);
    const more = bar.querySelector<HTMLButtonElement>('button.kit-more')!;
    expect(more.textContent!.trim()).toBe('More');
    more.click(); flushSync();
    const panel = document.getElementById(more.getAttribute('aria-controls')!)!;
    expect(panel.hidden).toBe(false);
    [...panel.querySelectorAll('button')].find((b) => b.textContent!.trim() === 'Copy link')!.click();
    expect(copy).toHaveBeenCalled();
  });
  it('a Toast speaks, and a danger Toast interrupts', () => {
    put(Toast, { message: 'Saved.' });
    put(Toast, { message: 'Could not save.', tone: 'danger' });
    expect(document.querySelector('[role="status"]')!.textContent).toContain('Saved.');
    expect(document.querySelector('[role="alert"]')!.textContent).toContain('Could not save.');
  });
  it('an EmptyState directs, and the outcome is a word', () => {
    put(EmptyState, { title: 'Nothing here yet', body: 'Upload a file or a folder.' });
    put(OutcomeBadge, { outcome: 'in-progress' });
    expect(document.querySelector('.kit-empty h2')!.textContent).toBe('Nothing here yet');
    expect(document.querySelector('.outcome')!.textContent).toBe('In progress');
  });
});
```

Move `src/lib/no-markup-injection.test.ts` in as written below (a guard for every task that follows):

```ts
// apps/web/src/lib/no-markup-injection.test.ts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sources(p);
    return /\.(ts|svelte)$/.test(name) && !/\.test\.ts$/.test(name) ? [p] : [];
  });
}

describe('text is rendered as text (agent-written titles, snippets, comments, handoffs)', () => {
  it('no {@html} and no innerHTML in the app', () => {
    const files = sources(join(import.meta.dirname, '..'));
    expect(files.some((f) => f.endsWith('ItemView.svelte'))).toBe(true);
    const offenders = files.filter((f) => /\{@html\b|\.innerHTML\s*=|outerHTML\s*=|insertAdjacentHTML/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @superlibrary/web test -- src/lib/kit`
Expected: FAIL (the components and `kit.css` are missing).

- [ ] **Step 3: Write the kit**

```ts
// apps/web/src/lib/kit/outcome.ts
import type { Outcome } from '@superlibrary/contract';

/** Spec §3: how the work turned out, in words. Shown on every result, always with its colour. */
export const OUTCOME_WORDS: Record<Outcome, string> = {
  approved: 'Approved', completed: 'Completed', 'in-progress': 'In progress', superseded: 'Superseded',
  rejected: 'Rejected', failed: 'Failed', abandoned: 'Abandoned',
};
/** In ranking order (spec §7): what ranks first, first. */
export const OUTCOME_ORDER: Outcome[] = ['approved', 'completed', 'in-progress', 'superseded', 'rejected', 'failed', 'abandoned'];
export const outcomeVar = (o: Outcome) => `var(--outcome-${o})`;
```

```svelte
<!-- apps/web/src/lib/kit/OutcomeBadge.svelte -->
<script lang="ts">
  import type { Outcome } from '@superlibrary/contract';
  import { OUTCOME_WORDS, outcomeVar } from './outcome';
  let { outcome }: { outcome: Outcome } = $props();
</script>

<span class="outcome" style:--o={outcomeVar(outcome)}>{OUTCOME_WORDS[outcome]}</span>
```

```svelte
<!-- apps/web/src/lib/kit/Icon.svelte -->
<script lang="ts" module>
  export type IconName = 'upload' | 'link' | 'external' | 'more' | 'check' | 'close';
</script>
<script lang="ts">
  const PATHS: Record<IconName, string> = {
    upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
    link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
    external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
    more: 'M5 12h.01M12 12h.01M19 12h.01',
    check: 'M5 12l5 5 9-10',
    close: 'M6 6l12 12M18 6L6 18',
  };
  let { name, size = 18 }: { name: IconName; size?: number } = $props();
</script>

<svg class="kit-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={PATHS[name]} /></svg>
```

```svelte
<!-- apps/web/src/lib/kit/Button.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon, { type IconName } from './Icon.svelte';
  let { variant = 'secondary', href, type = 'button', disabled = false, onclick, icon, children, ...rest }: {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; href?: string; type?: 'button' | 'submit'; disabled?: boolean;
    onclick?: (e: MouseEvent) => void; icon?: IconName; children: Snippet; [k: string]: unknown;
  } = $props();
  const cls = $derived(`kit-button kit-button--${variant}`);
</script>

{#if href}
  <a class={cls} {href} {...rest}>{#if icon}<Icon name={icon} />{/if}{@render children()}</a>
{:else}
  <button class={cls} {type} {disabled} {onclick} {...rest}>{#if icon}<Icon name={icon} />{/if}{@render children()}</button>
{/if}
```

```svelte
<!-- apps/web/src/lib/kit/Field.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  let { label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: Snippet<[{ id: string; describedby: string | undefined }]> } = $props();
  const id = `f-${Math.random().toString(36).slice(2, 10)}`;
  const describedby = $derived([hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined);
</script>

<div class="kit-field">
  <label for={id}>{label}</label>
  {@render children({ id, describedby })}
  {#if hint}<p class="kit-hint" id={`${id}-hint`}>{hint}</p>{/if}
  {#if error}<p class="kit-error" id={`${id}-error`} role="alert">{error}</p>{/if}
</div>
```

```svelte
<!-- apps/web/src/lib/kit/Tabs.svelte -->
<script lang="ts">
  import type { Outcome } from '@superlibrary/contract';
  import { outcomeVar } from './outcome';
  let { label, items }: { label: string; items: Array<{ href: string; label: string; count?: number | null; current: boolean; tone?: Outcome }> } = $props();
</script>

<nav aria-label={label}>
  <ul class="kit-tabs">
    {#each items as t (t.href)}
      <li style:--o={t.tone ? outcomeVar(t.tone) : undefined}>
        <a href={t.href} aria-current={t.current ? 'page' : undefined}>
          {#if t.tone}<span class="outcome">{t.label}</span>{:else}{t.label}{/if}
          {#if t.count !== undefined && t.count !== null}<span class="count">{t.count}</span>{/if}
        </a>
      </li>
    {/each}
  </ul>
</nav>
```

```svelte
<!-- apps/web/src/lib/kit/Toolbar.svelte -->
<script lang="ts" module>
  import type { IconName } from './Icon.svelte';
  export type ToolbarItem = { label: string; icon?: IconName; href?: string; onclick?: () => void; primary?: boolean; external?: boolean };
</script>
<script lang="ts">
  import Icon from './Icon.svelte';
  let { label, items }: { label: string; items: ToolbarItem[] } = $props();
  let open = $state(false);
  const panelId = `more-${Math.random().toString(36).slice(2, 10)}`;
  const secondary = $derived(items.filter((i) => !i.primary));
  const run = (i: ToolbarItem) => { open = false; i.onclick?.(); };
</script>

<!-- Every action keeps its words (operator review): at phone width the secondary ones fold into More. -->
<div class="kit-toolbar" role="toolbar" aria-label={label}>
  {#each items as i (i.label)}
    {#if i.href}
      <a class="kit-toolbar-item" class:kit-secondary={!i.primary} href={i.href} {...(i.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{#if i.icon}<Icon name={i.icon} />{/if}<span>{i.label}</span></a>
    {:else}
      <button type="button" class="kit-toolbar-item" class:kit-secondary={!i.primary} onclick={() => run(i)}>{#if i.icon}<Icon name={i.icon} />{/if}<span>{i.label}</span></button>
    {/if}
  {/each}
  {#if secondary.length}
    <button type="button" class="kit-more" aria-expanded={open} aria-controls={panelId} onclick={() => (open = !open)}><Icon name="more" /><span>More</span></button>
  {/if}
</div>
<div class="kit-more-panel" id={panelId} hidden={!open}>
  {#each secondary as i (i.label)}
    {#if i.href}
      <a class="kit-button kit-button--ghost" href={i.href} {...(i.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{i.label}</a>
    {:else}
      <button type="button" class="kit-button kit-button--ghost" onclick={() => run(i)}>{i.label}</button>
    {/if}
  {/each}
</div>
```

```svelte
<!-- apps/web/src/lib/kit/Toast.svelte -->
<script lang="ts">
  import Icon from './Icon.svelte';
  let { message, tone = 'ok', onclose }: { message: string; tone?: 'ok' | 'info' | 'danger'; onclose?: () => void } = $props();
</script>

<div class="kit-toast kit-toast--{tone}" role={tone === 'danger' ? 'alert' : 'status'} tabindex="-1">
  <span>{message}</span>
  {#if onclose}<button type="button" class="kit-button kit-button--ghost" aria-label="Dismiss" onclick={onclose}><Icon name="close" /></button>{/if}
</div>
```

```svelte
<!-- apps/web/src/lib/kit/EmptyState.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  let { title, body, action }: { title: string; body?: string; action?: Snippet } = $props();
</script>

<section class="kit-empty">
  <h2>{title}</h2>
  {#if body}<p>{body}</p>{/if}
  {#if action}<div class="kit-empty-action">{@render action()}</div>{/if}
</section>
```

```ts
// apps/web/src/lib/kit/index.ts
/** The kit: the suite design system's first instance (operator direction A). Import from `$kit`. */
export { default as Button } from './Button.svelte';
export { default as Field } from './Field.svelte';
export { default as Tabs } from './Tabs.svelte';
export { default as Toolbar, type ToolbarItem } from './Toolbar.svelte';
export { default as Icon, type IconName } from './Icon.svelte';
export { default as Toast } from './Toast.svelte';
export { default as EmptyState } from './EmptyState.svelte';
export { default as OutcomeBadge } from './OutcomeBadge.svelte';
export { default as ConfirmDialog } from './ConfirmDialog.svelte';
export { OUTCOME_ORDER, OUTCOME_WORDS, outcomeVar } from './outcome';
export { holdModal } from './modal';
```

```css
/* apps/web/src/lib/kit/kit.css — the kit's styles and shared patterns. Tokens only (kit.test.ts checks). */
:focus-visible { outline: var(--focus-ring); outline-offset: var(--focus-offset); }
.kit-icon { flex: none; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }

.kit-button { display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); min-height: var(--tap); padding: 0 var(--space-4); box-sizing: border-box;
  border: 1px solid var(--color-border-strong); border-radius: var(--radius-control); background: var(--color-surface-raised); color: var(--color-content);
  font: var(--type-ui-lg-weight) var(--type-ui-size)/1 var(--font-sans); text-decoration: none; cursor: pointer; transition: background var(--motion-quick) var(--motion-easing); }
.kit-button:hover { background: var(--color-surface-sunken); }
.kit-button:disabled { opacity: 0.55; cursor: default; }
.kit-button--primary { background: var(--color-accent); border-color: var(--color-accent); color: var(--color-accent-content); }
.kit-button--primary:hover { background: var(--color-accent); filter: brightness(1.06); }
.kit-button--danger { background: var(--color-danger); border-color: var(--color-danger); color: var(--color-surface); }
.kit-button--ghost { border-color: transparent; background: transparent; }

.kit-field { display: grid; gap: var(--space-1); }
.kit-field label { font: var(--type-label-weight) var(--type-label-size)/var(--type-label-line) var(--font-sans); color: var(--color-content-muted); }
.kit-hint { margin: 0; color: var(--color-content-faint); font-size: var(--type-meta-size); }
.kit-error { margin: 0; color: var(--color-danger); font-size: var(--type-meta-size); }

.kit-tabs { display: flex; flex-wrap: wrap; gap: var(--space-2); margin: var(--space-3) 0; padding: 0; list-style: none; }
.kit-tabs a { display: inline-flex; align-items: center; gap: 6px; min-height: var(--tap); padding: 0 var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-pill); color: inherit; text-decoration: none; }
.kit-tabs a[aria-current='page'] { border-color: var(--o, var(--color-accent)); box-shadow: inset 0 0 0 1px var(--o, var(--color-accent)); }
.count { color: var(--color-content-faint); font-variant-numeric: tabular-nums; }

.kit-toolbar { container-type: inline-size; display: flex; flex-wrap: wrap; gap: var(--space-1); }
.kit-toolbar-item, .kit-more { display: inline-flex; align-items: center; gap: 6px; min-height: var(--tap); padding: 0 var(--space-3); border: 0; border-radius: var(--radius-control); background: transparent; color: var(--color-content); font: var(--type-ui-size)/1 var(--font-sans); text-decoration: none; cursor: pointer; }
.kit-toolbar-item:hover, .kit-more:hover, .kit-more[aria-expanded='true'] { background: var(--color-surface-sunken); }
.kit-more { display: none; }
.kit-more-panel { display: grid; gap: var(--space-1); padding: var(--space-2); border: 1px solid var(--color-border); border-radius: var(--radius-card); background: var(--color-surface-raised); box-shadow: var(--elevation-overlay); }
.kit-more-panel[hidden] { display: none; }
@container (max-width: 640px) { .kit-toolbar .kit-secondary { display: none; } .kit-more { display: inline-flex; } }

.kit-toast { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); margin: 0 0 var(--space-3); padding: var(--space-2) var(--space-3); border: 1px solid var(--color-border); border-left: 3px solid var(--color-ok); border-radius: var(--radius-card); background: var(--color-surface-raised); }
.kit-toast--info { border-left-color: var(--color-accent); }
.kit-toast--danger { border-left-color: var(--color-danger); }

.kit-empty { padding: var(--space-8) var(--space-4); text-align: center; color: var(--color-content-muted); }
.kit-empty h2 { margin: 0 0 var(--space-2); color: var(--color-content); font-size: var(--type-ui-lg-size); }
.kit-empty p { margin: 0 0 var(--space-4); }

/* The outcome edge (the one signature): a 3px rule in the outcome's colour beside its word. */
.outcome { display: inline-flex; align-items: center; gap: 6px; font: var(--type-label-weight) var(--type-label-size)/1 var(--font-sans); letter-spacing: 0.02em; color: var(--o); white-space: nowrap; }
.outcome::before { content: ''; width: 8px; height: 8px; border-radius: var(--radius-pill); background: var(--o); flex: none; }
.searchbar { display: flex; gap: var(--space-2); margin: var(--space-3) 0; }
.searchbar input { flex: 1; min-width: 0; }
.filters { margin: 0 0 var(--space-4); border-bottom: 1px solid var(--color-border); }
.filters summary { display: flex; align-items: center; min-height: var(--tap); }
.filter-grid { display: grid; gap: var(--space-3); grid-template-columns: minmax(0, 1fr); padding-bottom: var(--space-3); }
@media (min-width: 768px) { .filter-grid { grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); } }
.filter-grid select { width: 100%; }
.outcome-picks { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 0 var(--space-4); margin: 0; padding: 0; border: 0; }
.outcome-picks legend { margin-bottom: var(--space-1); padding: 0; color: var(--color-content-muted); }
.pick { color: var(--o); font-weight: 600; }
.results { list-style: none; margin: 0 0 var(--space-4); padding: 0; }
.result { padding-left: var(--space-3); border-bottom: 1px solid var(--color-border); border-left: 3px solid var(--o); }
.result-link { display: grid; gap: 2px; min-height: var(--tap); padding: var(--space-2) 0; color: inherit; text-decoration: none; overflow-wrap: anywhere; }
.result-title { font-weight: 600; color: var(--color-content); }
.result-meta { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1) var(--space-3); color: var(--color-content-muted); font-size: var(--type-meta-size); }
.snippet { display: -webkit-box; overflow: hidden; color: var(--color-content-muted); font-size: var(--type-ui-size); -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; }
.replaced { display: inline-flex; align-items: center; min-height: var(--tap); font-size: var(--type-meta-size); }
.timeline { list-style: none; margin: 0 0 var(--space-6); padding: 0 0 0 var(--space-4); border-left: 2px solid var(--color-border); }
.timeline li { position: relative; padding: 0 0 var(--space-4) var(--space-3); overflow-wrap: anywhere; }
.timeline li::before { content: ''; position: absolute; left: calc(-1 * var(--space-4) - 7px); top: 6px; width: 12px; height: 12px; box-sizing: border-box; border: 2px solid var(--o, var(--color-content-faint)); border-radius: var(--radius-pill); background: var(--color-surface); }
.timeline .when { color: var(--color-content-faint); font-size: var(--type-meta-size); }
.body { margin: var(--space-1) 0 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.inline-form { display: flex; flex-wrap: wrap; align-items: end; gap: var(--space-2); }
.inline-form .field, .inline-form .kit-field { flex: 1 1 220px; }
.entry { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-2); }
.entry .result-link { flex: 1 1 260px; }

/* The item page's header (operator review: the title block took too much height before the content). */
.item-header { margin: 0 0 var(--space-2); }
.item-header h1 { margin: 0; font: var(--type-title-weight) var(--type-title-size)/var(--type-title-line) var(--font-sans); overflow-wrap: anywhere; }
.item-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 2px var(--space-3); margin: var(--space-1) 0 0; color: var(--color-content-muted); font-size: var(--type-meta-size); }

/* The embed takes the suite's colours and face (packages/embed host hooks). */
.viewer {
  --sl-host-font: var(--font-sans);
  --sl-host-bg: var(--color-surface-raised-light); --sl-host-fg: var(--color-content-light); --sl-host-muted: var(--color-content-muted-light);
  --sl-host-line: var(--color-border-light); --sl-host-hover: var(--color-surface-sunken-light); --sl-host-accent: var(--accent-light);
  --sl-host-accent-content: var(--accent-content-light); --sl-host-danger: var(--color-danger-light);
  --sl-host-bg-dark: var(--color-surface-raised-dark); --sl-host-fg-dark: var(--color-content-dark); --sl-host-muted-dark: var(--color-content-muted-dark);
  --sl-host-line-dark: var(--color-border-dark); --sl-host-hover-dark: var(--color-surface-sunken-dark); --sl-host-accent-dark: var(--accent-dark);
  --sl-host-accent-content-dark: var(--accent-content-dark); --sl-host-danger-dark: var(--color-danger-dark);
}
```

Then:
- `git mv apps/web/src/lib/ConfirmDialog.svelte apps/web/src/lib/kit/ConfirmDialog.svelte && git mv apps/web/src/lib/ConfirmDialog.svelte.test.ts apps/web/src/lib/kit/ConfirmDialog.svelte.test.ts && git mv apps/web/src/lib/modal.ts apps/web/src/lib/kit/modal.ts`, and in `ConfirmDialog.svelte` import `holdModal` from `./modal`; replace its buttons' plain classes with the kit's (`class="kit-button"` on Cancel, `class="kit-button kit-button--danger"` on the act). Update every importer found by the `git grep` above to `$kit/ConfirmDialog.svelte` / `$kit/modal`.
- `+layout.svelte`: `import '$kit/kit.css';` after `$kit/tokens.css`.
- `app.css`: make the phase-1 global rules `button, .button`, `.primary` and `.danger` carry the same declarations as `.kit-button`, `.kit-button--primary` and `.kit-button--danger` (copy them), so phase-1 markup and any unclassed button look of the kit until each page moves to `<Button>`.
- If the guard finds a colour or font literal left in a phase-1 file under `src` (a page, the login screen), replace it with the token it stands for; add a token to `design/tokens.toml` only when none fits.
- `ItemView.svelte`: replace `{#if notice}<p class="notice-line" role="status" tabindex="-1" bind:this={noticeEl}>{notice}</p>{/if}` with `{#if notice}<div bind:this={noticeEl}><Toast message={notice} onclose={() => (notice = null)} /></div>{/if}` and `import Toast from '$kit/Toast.svelte';` (focus still goes to `noticeEl` as before).

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @superlibrary/web test && pnpm --filter @superlibrary/web typecheck`
Expected: PASS (the moved `ConfirmDialog` tests and the phase-1 `no-browser-dialogs` guard included).

- [ ] **Step 5: Revert-proof**

Put `color: #fff;` in `.kit-button--primary`, or `font-family: Inter` in any component; expect `no colour or font literal…` to FAIL. Restore. In `Toolbar.svelte` render the More panel's items without their label (`{''}`); expect `a Toolbar shows every item with its words…` to FAIL. Restore. Add `{@html message}` to `Toast.svelte`; expect `no {@html}…` to FAIL. Restore.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/kit apps/web/src/lib/no-markup-injection.test.ts apps/web/src/routes/+layout.svelte apps/web/src/lib/ItemView.svelte
git add -u apps/web/src
git commit -m "feat(web): the component kit: button, field, tabs, toolbar with More, dialog, toast, empty state, outcome badge

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---

## Task 13: The suite shell: the header every product shares

The operator's phone review: the header was unstyled (plain blue underlined links and a bordered Sign out). The suite shell rule (direction A): **product mark and name on the left, primary navigation, and on the right the suite switcher and an account menu holding the theme and Sign out**; the parent (Super Jackfruit Labs, "Ink") appears in the switcher's head and the footer link, with its hexagon mark, in the same place in every product. Superlibrary's header is its first instance; `SuiteHeader` lives in the kit so another product passes its own mark, name and nav.

**Files:**
- Create: `apps/web/src/lib/kit/SuiteHeader.svelte`, `apps/web/src/lib/kit/SuiteSwitcher.svelte`, `apps/web/src/lib/kit/SuiteFooter.svelte`, `apps/web/src/lib/kit/ParentMark.svelte`, `apps/web/src/lib/kit/theme.svelte.ts`, `apps/web/src/lib/kit/SuiteHeader.svelte.test.ts`, `apps/web/src/lib/kit/SuiteSwitcher.svelte.test.ts`, `apps/web/src/lib/kit/theme.test.ts`
- Modify: `apps/web/src/lib/AppHeader.svelte` (PR #16; becomes a `SuiteHeader` with the Superlibrary mark), `apps/web/src/lib/AppHeader.svelte.test.ts`, `apps/web/src/routes/+layout.svelte`, `apps/web/src/lib/kit/kit.css` (shell styles), `apps/web/src/app.html` (theme before first paint), `apps/web/src/lib/ItemView.svelte` (the embed follows the app's theme)

**Interfaces:**
- Consumes: `Mark.svelte` (PR #16); `PARENT`, `PRODUCTS` and the `--parent-*`/`--product-*-accent` tokens (Task 11); `Me` (api.ts); the embed's theme key `superlibrary:theme` (`packages/embed/src/view.ts` `THEME_KEY`), so the app and the viewer share one choice per device.
- Produces:
  - `<SuiteHeader product home mark nav account onsignout theme? ontheme? suite?>` with `nav: Array<{ href; label; current }>`, `account: { label: string; detail?: string }`, `mark: Snippet`, `suite?: Snippet` (the switcher's slot; nothing rendered without it)
  - `<ParentMark size? tile? label?>`: the Super Jackfruit Labs mark, three hexagons on the ink tile (64×64, `rx 15`; stroked at 3.2, filled at 32 px and under)
  - `<SuiteSwitcher products current>`: a **Products** button with the parent mark; its panel is headed by the parent mark and "Super Jackfruit Labs", and lists each product with an address, its accent beside its name, the current one marked
  - `<SuiteFooter parentHref?>`: the footer's "Super Jackfruit Labs" link with the parent mark (`parentHref` default `https://superjackfruit.com`, decision O8)
  - `theme.svelte.ts`: `type Theme = 'system'|'light'|'dark'`, `THEME_KEY = 'superlibrary:theme'`, `readTheme(): Theme`, `applyTheme(t: Theme): void` (stores, sets or clears `<html data-theme>`), and a `$state` holder `themeState` for components

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/src/lib/kit/theme.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { THEME_KEY, applyTheme, readTheme } from './theme.svelte';

afterEach(() => { vi.unstubAllGlobals(); document.documentElement.removeAttribute('data-theme'); });
const store = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }; };

describe('the theme, one choice per device for the app and its viewer', () => {
  it('is stored under the embed’s own key and set on <html>; system clears it', () => {
    const s = store();
    vi.stubGlobal('localStorage', s);
    expect(THEME_KEY).toBe('superlibrary:theme');
    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(s.getItem(THEME_KEY)).toBe('dark');
    expect(readTheme()).toBe('dark');
    applyTheme('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(readTheme()).toBe('system');
  });
  it('a blocked or junk store reads as system and never throws', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => {} });
    expect(readTheme()).toBe('system');
    expect(() => applyTheme('light')).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});
```

```ts
// apps/web/src/lib/kit/SuiteHeader.svelte.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRawSnippet, flushSync, mount, unmount } from 'svelte';
import SuiteHeader from './SuiteHeader.svelte';

let c: ReturnType<typeof mount> | null = null;
afterEach(() => { if (c) unmount(c); c = null; document.body.innerHTML = ''; });
const mark = createRawSnippet(() => ({ render: () => '<svg data-testid="mark"></svg>' }));
const suite = createRawSnippet(() => ({ render: () => '<button>Products</button>' }));

function open(extra: Record<string, unknown> = {}) {
  const onsignout = vi.fn();
  const ontheme = vi.fn();
  c = mount(SuiteHeader, { target: document.body, props: {
    product: 'Superlibrary', home: '/', mark, onsignout, ontheme, theme: 'system',
    nav: [{ href: '/', label: 'Library', current: true }, { href: '/outcomes', label: 'Outcomes', current: false }],
    account: { label: 'Account', detail: 'An owner of this workspace' }, ...extra,
  } });
  flushSync();
  return { onsignout, ontheme };
}

describe('the suite shell (operator direction A)', () => {
  it('puts the mark and name left, the nav in the middle, the account menu right', () => {
    open();
    const header = document.querySelector('header')!;
    const parts = [...header.children].map((e) => e.className.split(' ')[0]);
    expect(parts).toEqual(['shell-brand', 'shell-nav', 'shell-end']);
    expect(header.querySelector('.shell-brand')!.textContent).toContain('Superlibrary');
    expect(header.querySelector('[data-testid="mark"]')).not.toBeNull();
    expect(header.querySelector('nav[aria-label="Superlibrary"] [aria-current="page"]')!.textContent).toBe('Library');
  });
  it('the account menu holds the theme and Sign out, and Escape closes it back to its button', () => {
    const { onsignout, ontheme } = open();
    const btn = document.querySelector<HTMLButtonElement>('.shell-account')!;
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    btn.click(); flushSync();
    const menu = document.getElementById(btn.getAttribute('aria-controls')!)!;
    expect(menu.hidden).toBe(false);
    expect(menu.textContent).toContain('An owner of this workspace');
    const dark = [...menu.querySelectorAll<HTMLInputElement>('input[type=radio]')].find((r) => r.value === 'dark')!;
    dark.click(); flushSync();
    expect(ontheme).toHaveBeenCalledWith('dark');
    menu.querySelector<HTMLButtonElement>('button.shell-signout')!.click();
    expect(onsignout).toHaveBeenCalled();
    btn.click(); flushSync();
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    flushSync();
    expect(menu.hidden).toBe(true);
    expect(document.activeElement).toBe(btn);
  });
  it('the suite switcher has its slot beside the account menu, and nothing is drawn without one', () => {
    open();
    expect(document.querySelector('[data-slot="suite-switcher"]')).toBeNull();
    unmount(c!); c = null; document.body.innerHTML = '';
    open({ suite });
    expect(document.querySelector('.shell-end [data-slot="suite-switcher"] button')!.textContent).toBe('Products');
  });
});
```

```ts
// apps/web/src/lib/kit/SuiteSwitcher.svelte.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import SuiteSwitcher from './SuiteSwitcher.svelte';
import SuiteFooter from './SuiteFooter.svelte';
import { PRODUCTS } from './suite.generated';

const mounted: ReturnType<typeof mount>[] = [];
afterEach(() => { for (const c of mounted.splice(0)) unmount(c); document.body.innerHTML = ''; });

describe('the parent in the shell (option C "Ink")', () => {
  it('the switcher is headed by the parent mark and name, and lists products with addresses, the current one marked', () => {
    mounted.push(mount(SuiteSwitcher, { target: document.body, props: { products: PRODUCTS, current: 'superlibrary' } }));
    flushSync();
    const btn = document.querySelector<HTMLButtonElement>('button.suite-switcher')!;
    expect(btn.textContent!.trim()).toBe('Products');
    expect(btn.querySelector('svg.parent-mark')).not.toBeNull();
    btn.click(); flushSync();
    const panel = document.getElementById(btn.getAttribute('aria-controls')!)!;
    expect(panel.querySelector('.suite-head')!.textContent).toContain('Super Jackfruit Labs');
    expect(panel.querySelector('.suite-head svg.parent-mark')).not.toBeNull();
    const links = [...panel.querySelectorAll('a')];
    expect(links.map((a) => a.textContent!.trim())).toEqual(['AgentPod', 'Superpipeline', 'Superlibrary']);   // no address yet: not linked
    expect(panel.querySelector('[aria-current="true"]')!.textContent).toContain('Superlibrary');
  });
  it('the parent mark is three hexagons on the ink tile, filled when small', () => {
    mounted.push(mount(SuiteFooter, { target: document.body, props: {} }));
    flushSync();
    const link = document.querySelector<HTMLAnchorElement>('footer a')!;
    expect(link.textContent!.trim()).toBe('Super Jackfruit Labs');
    expect(link.getAttribute('href')).toBe('https://superjackfruit.com');
    const svg = link.querySelector('svg.parent-mark')!;
    expect(svg.getAttribute('viewBox')).toBe('0 0 64 64');
    expect(svg.querySelectorAll('path')).toHaveLength(3);
    expect(svg.querySelector('rect')!.getAttribute('rx')).toBe('15');
    expect(svg.querySelector('g')!.getAttribute('style')).toContain('fill: var(--parent-mark)');   // 20px: the filled variant
  });
});
```

Replace `apps/web/src/lib/AppHeader.svelte.test.ts`'s assertions with: the mark is present (`[data-testid="superlibrary-mark"]`), the name reads `Superlibrary`, the four nav links read `Library`, `Outcomes`, `Collections`, `Upload`, and `Sign out` is inside the account menu, not in the bar.

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @superlibrary/web test -- src/lib/kit/theme.test.ts src/lib/kit/SuiteHeader.svelte.test.ts src/lib/kit/SuiteSwitcher.svelte.test.ts src/lib/AppHeader.svelte.test.ts`
Expected: FAIL (`./theme.svelte`, `SuiteHeader.svelte`, `SuiteSwitcher.svelte` missing).

- [ ] **Step 3: Write the theme, the shell and Superlibrary's header**

```ts
// apps/web/src/lib/kit/theme.svelte.ts
/**
 * One theme choice per device for the app and its viewer: the embed stores the person's choice under
 * the same key (packages/embed/src/view.ts THEME_KEY). `system` follows the OS (no data-theme).
 */
export type Theme = 'system' | 'light' | 'dark';
export const THEME_KEY = 'superlibrary:theme';
const isTheme = (t: unknown): t is Theme => t === 'system' || t === 'light' || t === 'dark';

export function readTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return isTheme(t) ? t : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(t: Theme): void {
  const root = document.documentElement;
  if (t === 'system') root.removeAttribute('data-theme');
  else root.dataset.theme = t;
  try {
    if (t === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, t);
  } catch { /* private window or blocked storage: the choice lasts this page only */ }
  themeState.value = t;
}

export const themeState = $state<{ value: Theme }>({ value: 'system' });
```

```svelte
<!-- apps/web/src/lib/kit/SuiteHeader.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Theme } from './theme.svelte';

  let { product, home, mark, nav, account, onsignout, theme = 'system', ontheme, suite }: {
    product: string; home: string; mark: Snippet; nav: Array<{ href: string; label: string; current: boolean }>;
    account: { label: string; detail?: string }; onsignout: () => void; theme?: Theme; ontheme?: (t: Theme) => void; suite?: Snippet;
  } = $props();

  let open = $state(false);
  let button = $state<HTMLButtonElement | null>(null);
  let menu = $state<HTMLElement | null>(null);
  const menuId = `account-${Math.random().toString(36).slice(2, 10)}`;
  const close = (refocus: boolean) => { open = false; if (refocus) button?.focus(); };

  $effect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (menu && button && !menu.contains(e.target as Node) && !button.contains(e.target as Node)) close(false); };
    document.addEventListener('click', onDoc, true);
    return () => document.removeEventListener('click', onDoc, true);
  });
</script>

<!-- The suite shell rule: mark and name left, primary nav, account menu (theme, Sign out) and the suite switcher right. -->
<header class="shell">
  <a class="shell-brand" href={home}>{@render mark()}<span class="shell-product">{product}</span></a>
  <nav class="shell-nav" aria-label={product}>
    {#each nav as n (n.href)}<a href={n.href} aria-current={n.current ? 'page' : undefined}>{n.label}</a>{/each}
  </nav>
  <div class="shell-end">
    {#if suite}<div class="shell-suite" data-slot="suite-switcher">{@render suite()}</div>{/if}
    <button bind:this={button} type="button" class="shell-account" aria-expanded={open} aria-controls={menuId} onclick={() => (open = !open)}>{account.label}</button>
    <div bind:this={menu} id={menuId} class="shell-menu" hidden={!open} onkeydown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close(true); } }} role="group" aria-label={account.label}>
      {#if account.detail}<p class="shell-detail">{account.detail}</p>{/if}
      <fieldset class="shell-theme">
        <legend>Theme</legend>
        {#each [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']] as [v, l] (v)}
          <label class="check"><input type="radio" name={`${menuId}-theme`} value={v} checked={theme === v} onchange={() => ontheme?.(v as Theme)} /> {l}</label>
        {/each}
      </fieldset>
      <button type="button" class="kit-button shell-signout" onclick={() => { close(false); onsignout(); }}>Sign out</button>
    </div>
  </div>
</header>
```

```svelte
<!-- apps/web/src/lib/kit/ParentMark.svelte -->
<script lang="ts">
  /**
   * The Super Jackfruit Labs mark (option C "Ink"): three hexagons, the cells of the jackfruit's skin,
   * white on the shared ink product tile. Stroked when large; filled at 32px and under, where a 3px
   * stroke would close the shapes up. Decorative unless `label` says it stands alone.
   */
  let { size = 24, tile = true, label }: { size?: number; tile?: boolean; label?: string } = $props();
  const HEX = ['M24 14l8 4.6v9.2L24 32.4l-8-4.6v-9.2z', 'M40 14l8 4.6v9.2L40 32.4l-8-4.6v-9.2z', 'M32 28l8 4.6v9.2L32 46.4l-8-4.6v-9.2z'];
  const style = $derived(size <= 32
    ? 'fill: var(--parent-mark); stroke: var(--parent-mark); stroke-width: 1.2; stroke-linejoin: round'
    : 'fill: none; stroke: var(--parent-mark); stroke-width: 3.2; stroke-linejoin: round');
</script>

<svg class="parent-mark" width={size} height={size} viewBox="0 0 64 64" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : 'true'} focusable="false">
  {#if tile}<rect width="64" height="64" rx="15" style="fill: var(--parent-tile)" />{/if}
  <g {style}>{#each HEX as d (d)}<path {d} />{/each}</g>
</svg>
```

```svelte
<!-- apps/web/src/lib/kit/SuiteSwitcher.svelte -->
<script lang="ts">
  import ParentMark from './ParentMark.svelte';
  import { PARENT } from './suite.generated';
  let { products, current }: { products: ReadonlyArray<{ key: string; name: string; accent: string; url: string }>; current: string } = $props();
  let open = $state(false);
  let button = $state<HTMLButtonElement | null>(null);
  const panelId = `suite-${Math.random().toString(36).slice(2, 10)}`;
</script>

<button bind:this={button} type="button" class="suite-switcher" aria-expanded={open} aria-controls={panelId} onclick={() => (open = !open)}>
  <ParentMark size={20} /><span>Products</span>
</button>
<div id={panelId} class="shell-menu suite-panel" hidden={!open} role="group" aria-label={PARENT.name}
  onkeydown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); open = false; button?.focus(); } }}>
  <p class="suite-head"><ParentMark size={28} /><span>{PARENT.name}</span></p>
  <ul class="suite-list">
    {#each products.filter((p) => p.url) as p (p.key)}
      <li style:--product-accent={`var(--product-${p.key}-accent)`}>
        <a href={p.url} aria-current={p.key === current ? 'true' : undefined}><span class="suite-dot" aria-hidden="true"></span>{p.name}</a>
      </li>
    {/each}
  </ul>
</div>
```

```svelte
<!-- apps/web/src/lib/kit/SuiteFooter.svelte -->
<script lang="ts">
  import ParentMark from './ParentMark.svelte';
  import { PARENT } from './suite.generated';
  /** Decision O8: the parent's address, to confirm with the operator. */
  let { parentHref = 'https://superjackfruit.com' }: { parentHref?: string } = $props();
</script>

<footer class="shell-footer"><a href={parentHref}><ParentMark size={20} /><span>{PARENT.name}</span></a></footer>
```

Append the shell's styles to `kit.css`:

```css
/* The suite shell (direction A). Phones: mark, name and account on one row; the nav as a full-width row of four below. */
.shell { position: relative; display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: var(--space-2) var(--space-4); padding: var(--space-2) 0; margin-bottom: var(--space-4); border-bottom: 1px solid var(--color-border); }
.shell-brand { display: inline-flex; align-items: center; gap: var(--space-2); min-height: var(--tap); color: var(--color-content); text-decoration: none; font: 600 var(--type-ui-lg-size)/1 var(--font-sans); }
.shell-brand .mark { width: 24px; height: 24px; }
.shell-nav { display: flex; gap: var(--space-1); }
.shell-nav a { display: inline-flex; align-items: center; min-height: var(--tap); padding: 0 var(--space-3); border-radius: var(--radius-control); color: var(--color-content-muted); text-decoration: none; font: 500 var(--type-ui-size)/1 var(--font-sans); }
.shell-nav a:hover { background: var(--color-surface-sunken); color: var(--color-content); }
.shell-nav a[aria-current='page'] { color: var(--color-content); box-shadow: inset 0 -2px 0 var(--color-accent); }
.shell-end { display: flex; align-items: center; gap: var(--space-2); justify-self: end; }
.shell-account { min-height: var(--tap); padding: 0 var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-pill); background: var(--color-surface-raised); color: var(--color-content); font: 500 var(--type-ui-size)/1 var(--font-sans); cursor: pointer; }
.shell-menu { position: absolute; right: 0; top: calc(100% + var(--space-1)); z-index: 50; display: grid; gap: var(--space-3); width: min(280px, calc(100vw - 2 * var(--space-4))); padding: var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-card); background: var(--color-surface-raised); box-shadow: var(--elevation-overlay); }
.shell-menu[hidden] { display: none; }
.shell-detail { margin: 0; color: var(--color-content-muted); font-size: var(--type-meta-size); overflow-wrap: anywhere; }
.shell-theme { margin: 0; padding: 0; border: 0; }
.shell-theme legend { margin-bottom: var(--space-1); color: var(--color-content-muted); font-size: var(--type-label-size); font-weight: var(--type-label-weight); }
.suite-switcher { display: inline-flex; align-items: center; gap: var(--space-2); min-height: var(--tap); padding: 0 var(--space-2); border: 0; border-radius: var(--radius-control); background: transparent; color: var(--color-content-muted); font: 500 var(--type-ui-size)/1 var(--font-sans); cursor: pointer; }
.suite-switcher:hover, .suite-switcher[aria-expanded='true'] { background: var(--color-surface-sunken); color: var(--color-content); }
.suite-head { display: flex; align-items: center; gap: var(--space-2); margin: 0; font: 600 var(--type-ui-size)/1 var(--font-sans); }
.suite-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
.suite-list a { display: flex; align-items: center; gap: var(--space-2); min-height: var(--tap); padding: 0 var(--space-2); border-radius: var(--radius-control); color: var(--color-content); text-decoration: none; }
.suite-list a:hover, .suite-list a[aria-current='true'] { background: var(--color-surface-sunken); }
.suite-dot { width: 10px; height: 10px; border-radius: var(--radius-pill); background: var(--product-accent); flex: none; }
.shell-footer { margin-top: var(--space-8); padding: var(--space-4) 0; border-top: 1px solid var(--color-border); }
.shell-footer a { display: inline-flex; align-items: center; gap: var(--space-2); min-height: var(--tap); color: var(--color-content-muted); text-decoration: none; font-size: var(--type-meta-size); }
@media (max-width: 767px) {
  .shell { grid-template-columns: 1fr auto; }
  .shell-nav { grid-column: 1 / -1; grid-row: 2; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .shell-nav a { justify-content: center; padding: 0 var(--space-1); }
}
```

Replace `apps/web/src/lib/AppHeader.svelte` (PR #16) with:

```svelte
<script lang="ts">
  import { page } from '$app/state';
  import Mark from './Mark.svelte';
  import SuiteHeader from '$kit/SuiteHeader.svelte';
  import SuiteSwitcher from '$kit/SuiteSwitcher.svelte';
  import { PRODUCTS } from '$kit/suite.generated';
  import { applyTheme, themeState } from '$kit/theme.svelte';
  import type { Me } from './api';

  let { me, onsignout }: { me: Me; onsignout: () => void } = $props();
  const at = (href: string) => (href === '/' ? page.url.pathname === '/' || page.url.pathname.startsWith('/a/') : page.url.pathname.startsWith(href));
  const nav = $derived([['/', 'Library'], ['/outcomes', 'Outcomes'], ['/collections', 'Collections'], ['/upload', 'Upload']].map(([href, label]) => ({ href: href!, label: label!, current: at(href!) })));
</script>

{#snippet mark()}<Mark />{/snippet}
{#snippet suite()}<SuiteSwitcher products={PRODUCTS} current="superlibrary" />{/snippet}
<SuiteHeader product="Superlibrary" home="/" {mark} {suite} {nav} {onsignout}
  account={{ label: 'Account', detail: `${me.role === 'owner' ? 'An owner' : 'A member'} of this workspace · ${me.principalId}` }}
  theme={themeState.value} ontheme={applyTheme} />
```

In `+layout.svelte`: pass `me={session.me}` to `<AppHeader>`, and add `<SuiteFooter />` (from `$kit/SuiteFooter.svelte`) after `{@render children()}` inside `.shell`; in `onMount`, before `start()`, call `applyTheme(readTheme())` (import both from `$kit/theme.svelte`); drop the old `.top` header styles from `app.css` (`.top`, `.top nav`, `.top nav a`, `.brand`) since the shell replaces them.

In `apps/web/src/app.html`, in `<head>` before `%sveltekit.head%`, so the first paint is already in the chosen theme:

```html
    <script>try{var t=localStorage.getItem('superlibrary:theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}</script>
```

(If PR #16's `_headers` adds a `script-src` CSP, add this script's `sha256-` hash to it; the app's current `_headers` sets no `script-src`.)

In `ItemView.svelte`, pass `theme: themeState.value` in `mountArtifact`'s options, and add `$effect(() => { const t = themeState.value; mounted?.setTheme(t); });` so a change in the account menu reaches the open viewer.

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @superlibrary/web test && pnpm --filter @superlibrary/web typecheck`
Expected: PASS.

- [ ] **Step 5: Revert-proof**

Move `Sign out` out of the menu into the bar; expect the AppHeader and SuiteHeader tests to FAIL. Restore. Drop the `onkeydown` Escape handler; expect `…Escape closes it back to its button` to FAIL. Restore. Change `THEME_KEY` to `'app:theme'`; expect `is stored under the embed’s own key…` to FAIL. Restore. Make `ParentMark` always stroked; expect `the parent mark is three hexagons…, filled when small` to FAIL. Restore. Drop `.filter((p) => p.url)`; expect the switcher test to FAIL (a product with no address is linked). Restore.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/kit apps/web/src/lib/AppHeader.svelte apps/web/src/lib/AppHeader.svelte.test.ts apps/web/src/routes/+layout.svelte apps/web/src/app.html apps/web/src/app.css apps/web/src/lib/ItemView.svelte
git commit -m "feat(web): the suite shell: mark and name, nav, account menu with theme and sign-out, the parent's switcher and footer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---

## Task 14: The Library page: search and browse with filters in the address

**Files:**
- Create: `apps/web/src/lib/library.ts`, `apps/web/src/lib/FilterBar.svelte`, `apps/web/src/lib/ResultList.svelte`, `apps/web/src/lib/library.test.ts`, `apps/web/src/lib/ResultList.svelte.test.ts`
- Modify: `apps/web/src/routes/+page.svelte`

**Interfaces:**
- Consumes: `api` (session.svelte.ts), `explain` (item.ts), `OUTCOME_ORDER`, `OUTCOME_WORDS`, `outcomeVar`, `OutcomeBadge` (Task 12); `SearchResult`, `ItemSummary`, `BrowsePage`, `Facets`, `BOARD_ID`, `PRN_ID`, `OUTCOMES` (contract); `POST /api/v1/search`, `POST /api/v1/browse`, `GET /api/v1/facets` (Task 3).
- Produces (Tasks 15–18 use them):
  - `type Kind`, `type Period = 'any'|'week'|'month'|'30d'|'custom'`, `interface Filters { q; kind; outcomes; board; agent; station; period; from; to }`, `EMPTY_FILTERS`
  - `readFilters(params, defaults?)`, `writeFilters(f, defaults?)`, `activeFilters(f)`, `periodRange(f, now?)`, `rangeProblem(f)`, `searchBody(f, now?)`, `browseBody(f, cursor, now?, limit?)`
  - `interface Row { id; title; kind; outcome; line; snippet; supersededBy }`, `rowOfResult(r, boards)`, `rowOfItem(i, boards)`, `boardNames(facets)`
  - `type Loaded<T>`, `loadJson<T>(api, path, body?)`, `searchLibrary(api, f)`, `browseLibrary(api, f, cursor?)`, `loadFacets(api)`
  - `<FilterBar filters facets onchange hideOutcomes?>`, `<ResultList rows label>`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/src/lib/library.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import type { ItemSummary, SearchResult } from '@superlibrary/contract';
import { EMPTY_FILTERS, activeFilters, browseBody, periodRange, rangeProblem, readFilters, rowOfItem, rowOfResult, searchBody, writeFilters } from './library';

const TZ = process.env.TZ;
afterEach(() => { process.env.TZ = TZ; });

describe('filters in the address (spec §11: a view can be kept and shared)', () => {
  it('round-trips, and drops what is not a known value', () => {
    const qs = 'q=launch&kind=work-record&outcome=rejected&outcome=failed&board=brd_00000000000000b1&agent=prn_000000000000000000a2&station=docs&period=month';
    const f = readFilters(new URLSearchParams(qs));
    expect(f).toMatchObject({ q: 'launch', kind: 'work-record', outcomes: ['rejected', 'failed'], board: 'brd_00000000000000b1', period: 'month' });
    expect(writeFilters(f)).toBe(qs);
    const junk = readFilters(new URLSearchParams('kind=folder&outcome=great&board=marketing&agent=bob&period=forever&from=yesterday'));
    expect(junk).toEqual(EMPTY_FILTERS);
    expect(activeFilters(f)).toBe(6);
  });
  it('a page may default the period; the other choice is then written out', () => {
    const d = { period: 'month' } as const;
    expect(readFilters(new URLSearchParams(''), d).period).toBe('month');
    expect(writeFilters({ ...EMPTY_FILTERS, period: 'month' }, d)).toBe('');
    expect(writeFilters({ ...EMPTY_FILTERS, period: 'any' }, d)).toBe('period=any');
  });
});

describe('periods in the person’s own time zone (Review Focus)', () => {
  it("periodRange starts a month at the person's local midnight", () => {
    process.env.TZ = 'Pacific/Kiritimati';   // UTC+14
    expect(periodRange({ period: 'month', from: '', to: '' }, new Date('2026-10-31T12:00:00Z'))).toEqual({ since: '2026-10-31T10:00:00.000Z' });   // 1 Nov, local
    process.env.TZ = 'America/Los_Angeles';  // UTC-7 in October
    expect(periodRange({ period: 'month', from: '', to: '' }, new Date('2026-10-01T05:00:00Z'))).toEqual({ since: '2026-09-01T07:00:00.000Z' });   // still 30 Sept, local
  });
  it('a custom range includes its last day, and a backwards one is named', () => {
    process.env.TZ = 'UTC';
    expect(periodRange({ period: 'custom', from: '2026-10-01', to: '2026-10-31' })).toEqual({ since: '2026-10-01T00:00:00.000Z', until: '2026-11-01T00:00:00.000Z' });
    expect(rangeProblem({ ...EMPTY_FILTERS, period: 'custom', from: '2026-10-31', to: '2026-10-01' })).toBe('Choose an end date on or after the start date.');
    expect(periodRange({ period: 'week', from: '', to: '' }, new Date('2026-10-08T12:00:00Z'))).toEqual({ since: '2026-10-05T00:00:00.000Z' });   // Monday
  });
});

describe('request bodies', () => {
  it('send only what is set', () => {
    process.env.TZ = 'UTC';
    const f = { ...EMPTY_FILTERS, q: '  launch ', kind: 'artifact' as const, outcomes: ['approved' as const] };
    expect(searchBody(f)).toEqual({ query: 'launch', kinds: ['artifact'], outcomes: ['approved'], limit: 25 });
    expect(browseBody(EMPTY_FILTERS, 'c1')).toEqual({ limit: 50, cursor: 'c1' });
  });
});

describe('rows', () => {
  const boards = new Map([['brd_00000000000000b1', 'Marketing & Community']]);
  it('say kind, board, station and path', () => {
    const r = { itemId: 'itm_0123456789abcdef', kind: 'artifact', title: 'T', outcome: 'completed', scope: 'board:brd_00000000000000b1', snippet: 's', url: 'u', score: 1, supersededBy: null,
      provenance: { board: 'brd_00000000000000b1', station: 'stn_1', stationName: 'docs', path: 'out/report.md' } } as SearchResult;
    expect(rowOfResult(r, boards).line).toBe('Artifact · Marketing & Community · docs · out/report.md');
    const i = { id: 'itm_0123456789abcde0', kind: 'work-record', title: 'W', outcome: 'rejected', scope: 'board:brd_00000000000000b1', createdBy: 'source:superpipeline', createdAt: '2026-10-01T00:00:00.000Z', latestVersion: 0, expiresAt: null, revokedAt: null } as ItemSummary;
    expect(rowOfItem(i, boards)).toMatchObject({ line: 'Work record · Marketing & Community', snippet: null });
  });
});
```

```ts
// apps/web/src/lib/ResultList.svelte.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import ResultList from './ResultList.svelte';

let c: ReturnType<typeof mount> | null = null;
afterEach(() => { if (c) unmount(c); c = null; document.body.innerHTML = ''; });

describe('ResultList', () => {
  it('a title with markup is shown as text', () => {
    c = mount(ResultList, { target: document.body, props: { label: 'Search results', rows: [
      { id: 'itm_0123456789abcdef', title: '<img src=x onerror=alert(1)>Plan', kind: 'artifact', outcome: 'rejected', line: 'Artifact', snippet: '<script>alert(2)</script>', supersededBy: 'itm_0123456789abcde0' },
    ] } });
    flushSync();
    expect(document.querySelector('img, script')).toBeNull();
    expect(document.body.textContent).toContain('<img src=x onerror=alert(1)>Plan');
    expect(document.body.textContent).toContain('Rejected');
    expect(document.querySelector('a.result-link')!.getAttribute('href')).toBe('/a/itm_0123456789abcdef');
    expect(document.querySelector('a.replaced')!.getAttribute('href')).toBe('/a/itm_0123456789abcde0');
    expect(document.querySelector('ul')!.getAttribute('aria-label')).toBe('Search results');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @superlibrary/web test -- src/lib/library.test.ts src/lib/ResultList.svelte.test.ts`
Expected: FAIL (`./library` and `ResultList.svelte` missing).

- [ ] **Step 3: Write the helpers and components**

```ts
// apps/web/src/lib/library.ts
/** The library page's state (the address), its requests, and its rows. */
import { BOARD_ID, OUTCOMES, PRN_ID, type BrowsePage, type Facets, type ItemSource, type ItemSummary, type Outcome, type SearchResult } from '@superlibrary/contract';
import { explain } from './item';

type Api = (path: string, init?: RequestInit) => Promise<Response>;
export type Kind = 'artifact' | 'work-record';
export type Period = 'any' | 'week' | 'month' | '30d' | 'custom';
export interface Filters { q: string; kind: Kind | ''; outcomes: Outcome[]; board: string; agent: string; station: string; period: Period; from: string; to: string }
export const EMPTY_FILTERS: Filters = { q: '', kind: '', outcomes: [], board: '', agent: '', station: '', period: 'any', from: '', to: '' };

const PERIODS: readonly Period[] = ['any', 'week', 'month', '30d', 'custom'];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The address is the view (spec §11 "views by outcome" can be kept and shared). Unknown values are dropped. */
export function readFilters(params: URLSearchParams, defaults: Partial<Pick<Filters, 'period'>> = {}): Filters {
  const kind = params.get('kind');
  const period = params.get('period');
  const board = params.get('board') ?? '';
  const agent = params.get('agent') ?? '';
  const station = (params.get('station') ?? '').trim();
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  return {
    q: (params.get('q') ?? '').slice(0, 1000),
    kind: kind === 'artifact' || kind === 'work-record' ? kind : '',
    outcomes: [...new Set(params.getAll('outcome').filter((o): o is Outcome => (OUTCOMES as readonly string[]).includes(o)))],
    board: BOARD_ID.test(board) ? board : '',
    agent: PRN_ID.test(agent) ? agent : '',
    station: station.length <= 100 ? station : '',
    period: period && (PERIODS as readonly string[]).includes(period) ? (period as Period) : (defaults.period ?? 'any'),
    from: DAY.test(from) ? from : '',
    to: DAY.test(to) ? to : '',
  };
}

export function writeFilters(f: Filters, defaults: Partial<Pick<Filters, 'period'>> = {}): string {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set('q', f.q.trim());
  if (f.kind) p.set('kind', f.kind);
  for (const o of f.outcomes) p.append('outcome', o);
  if (f.board) p.set('board', f.board);
  if (f.agent) p.set('agent', f.agent);
  if (f.station) p.set('station', f.station);
  if (f.period !== (defaults.period ?? 'any')) p.set('period', f.period);
  if (f.period === 'custom') { if (f.from) p.set('from', f.from); if (f.to) p.set('to', f.to); }
  return p.toString();
}

export const activeFilters = (f: Filters) => [f.kind, f.board, f.agent, f.station].filter(Boolean).length + f.outcomes.length + (f.period !== 'any' ? 1 : 0);

const localDay = (s: string, plusDays = 0) => {
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d + plusDays);
};

/** A period's bounds as instants, computed in the person's own time zone (Review Focus). */
export function periodRange(f: Pick<Filters, 'period' | 'from' | 'to'>, now: Date = new Date()): { since?: string; until?: string } {
  switch (f.period) {
    case 'week': {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7));   // back to Monday
      return { since: d.toISOString() };
    }
    case 'month': return { since: new Date(now.getFullYear(), now.getMonth(), 1).toISOString() };
    case '30d': return { since: new Date(now.getTime() - 30 * 86_400_000).toISOString() };
    case 'custom': {
      const out: { since?: string; until?: string } = {};
      if (DAY.test(f.from)) out.since = localDay(f.from).toISOString();
      if (DAY.test(f.to)) out.until = localDay(f.to, 1).toISOString();   // through the end of that day
      return out;
    }
    default: return {};
  }
}
export function rangeProblem(f: Filters): string | null {
  if (f.period !== 'custom') return null;
  const r = periodRange(f);
  return r.since && r.until && r.since >= r.until ? 'Choose an end date on or after the start date.' : null;
}

function filterBody(f: Filters, now: Date) {
  return {
    ...(f.kind ? { kinds: [f.kind] } : {}), ...(f.outcomes.length ? { outcomes: f.outcomes } : {}), ...(f.board ? { board: f.board } : {}),
    ...(f.agent ? { agent: f.agent } : {}), ...(f.station ? { station: f.station } : {}), ...periodRange(f, now),
  };
}
export const searchBody = (f: Filters, now = new Date()) => ({ query: f.q.trim(), ...filterBody(f, now), limit: 25 });
export const browseBody = (f: Filters, cursor: string | null, now = new Date(), limit = 50) => ({ ...filterBody(f, now), limit, ...(cursor ? { cursor } : {}) });

/** One row of any list: a search hit or a browsed item, said the same way. */
export interface Row { id: string; title: string; kind: Kind; outcome: Outcome; line: string; snippet: string | null; supersededBy: string | null }
const KIND_WORD: Record<Kind, string> = { artifact: 'Artifact', 'work-record': 'Work record' };
function lineOf(kind: Kind, s: ItemSource | undefined, boards: Map<string, string>): string {
  const parts = [KIND_WORD[kind]];
  if (s?.board) parts.push(boards.get(s.board) ?? s.board);
  const station = s?.stationName ?? s?.station;
  if (station) parts.push(station);
  if (s?.path) parts.push(s.path);
  return parts.join(' · ');
}
export const rowOfResult = (r: SearchResult, boards: Map<string, string>): Row => ({
  id: r.itemId, title: r.title, kind: r.kind, outcome: r.outcome, line: lineOf(r.kind, r.provenance, boards), snippet: r.snippet || null, supersededBy: r.supersededBy,
});
export const rowOfItem = (i: ItemSummary, boards: Map<string, string>): Row => ({
  id: i.id, title: i.title, kind: i.kind, outcome: i.outcome,
  line: lineOf(i.kind, i.source ?? (i.scope.startsWith('board:') ? { board: i.scope.slice(6) } : undefined), boards),
  snippet: i.caption ?? null, supersededBy: i.supersededBy ?? null,
});
export const boardNames = (f: Facets | null) => new Map((f?.boards ?? []).map((b) => [b.id, b.name]));

export type Loaded<T> = { ok: true; value: T } | { ok: false; message: string };
const UNREACHABLE = 'The library could not be reached. Check your connection and try again.';
/** GET, or POST with a JSON body. A refusal comes back as a sentence (`explain`). */
export async function loadJson<T>(api: Api, path: string, body?: unknown): Promise<Loaded<T>> {
  try {
    const res = await api(path, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) {
      const b = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
      return { ok: false, message: explain(b.error ?? `http_${res.status}`, b.detail) };
    }
    return { ok: true, value: (await res.json()) as T };
  } catch {
    return { ok: false, message: UNREACHABLE };
  }
}
export const searchLibrary = (api: Api, f: Filters) => loadJson<{ results: SearchResult[] }>(api, '/api/v1/search', searchBody(f));
export const browseLibrary = (api: Api, f: Filters, cursor: string | null = null) => loadJson<BrowsePage>(api, '/api/v1/browse', browseBody(f, cursor));
export const loadFacets = (api: Api) => loadJson<Facets>(api, '/api/v1/facets');
```

```svelte
<!-- apps/web/src/lib/ResultList.svelte -->
<script lang="ts">
  import OutcomeBadge from '$kit/OutcomeBadge.svelte';
  import { outcomeVar } from '$kit/outcome';
  import type { Row } from '$lib/library';

  let { rows, label }: { rows: Row[]; label: string } = $props();
</script>

<ul class="results" aria-label={label}>
  {#each rows as r (r.id)}
    <li class="result" style:--o={outcomeVar(r.outcome)}>
      <a class="result-link" href={`/a/${r.id}`}>
        <span class="result-title">{r.title}</span>
        <span class="result-meta"><OutcomeBadge outcome={r.outcome} /><small>{r.line}</small></span>
        {#if r.snippet}<span class="snippet">{r.snippet}</span>{/if}
      </a>
      {#if r.supersededBy}<a class="replaced" href={`/a/${r.supersededBy}`}>See what replaced it</a>{/if}
    </li>
  {/each}
</ul>
```

```svelte
<!-- apps/web/src/lib/FilterBar.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { Facets, Outcome } from '@superlibrary/contract';
  import { OUTCOME_ORDER, OUTCOME_WORDS, outcomeVar } from '$kit/outcome';
  import { EMPTY_FILTERS, activeFilters, rangeProblem, type Filters } from '$lib/library';

  let { filters, facets, onchange, hideOutcomes = false }: { filters: Filters; facets: Facets | null; onchange: (f: Filters) => void; hideOutcomes?: boolean } = $props();
  // Folded on phones, open from 768px (the operator reads on a phone first).
  let open = $state(false);
  onMount(() => { open = window.matchMedia('(min-width: 768px)').matches; });

  const set = (patch: Partial<Filters>) => onchange({ ...filters, ...patch });
  const toggle = (o: Outcome, on: boolean) => set({ outcomes: on ? [...filters.outcomes, o] : filters.outcomes.filter((x) => x !== o) });
  const count = $derived(activeFilters(filters) - (hideOutcomes ? filters.outcomes.length : 0));
  const problem = $derived(rangeProblem(filters));
</script>

<details class="filters" bind:open>
  <summary>Filters{count ? ` · ${count} on` : ''}</summary>
  <div class="filter-grid">
    <label class="field">Kind
      <select value={filters.kind} onchange={(e) => set({ kind: e.currentTarget.value as Filters['kind'] })}>
        <option value="">Everything</option><option value="artifact">Artifacts</option><option value="work-record">Work records</option>
      </select>
    </label>
    <label class="field">Board
      <select value={filters.board} onchange={(e) => set({ board: e.currentTarget.value })}>
        <option value="">Every board</option>
        {#each facets?.boards ?? [] as b (b.id)}<option value={b.id}>{b.name}</option>{/each}
      </select>
    </label>
    <label class="field">Agent
      <select value={filters.agent} onchange={(e) => set({ agent: e.currentTarget.value })}>
        <option value="">Anyone</option>
        {#each facets?.agents ?? [] as a (a)}<option value={a}>{a}</option>{/each}
      </select>
    </label>
    <label class="field">Station
      <select value={filters.station} onchange={(e) => set({ station: e.currentTarget.value })}>
        <option value="">Any station</option>
        {#each facets?.stations ?? [] as s (s.id)}<option value={s.id}>{s.name ?? s.id}</option>{/each}
      </select>
    </label>
    <label class="field">Active
      <select value={filters.period} onchange={(e) => set({ period: e.currentTarget.value as Filters['period'] })}>
        <option value="any">Any time</option><option value="week">This week</option><option value="month">This month</option>
        <option value="30d">Last 30 days</option><option value="custom">Between dates…</option>
      </select>
    </label>
    {#if filters.period === 'custom'}
      <label class="field">From <input type="date" value={filters.from} onchange={(e) => set({ from: e.currentTarget.value })} /></label>
      <label class="field">To <input type="date" value={filters.to} onchange={(e) => set({ to: e.currentTarget.value })} /></label>
    {/if}
    {#if !hideOutcomes}
      <fieldset class="outcome-picks">
        <legend>Outcome</legend>
        {#each OUTCOME_ORDER as o (o)}
          <label class="check pick" style:--o={outcomeVar(o)}>
            <input type="checkbox" checked={filters.outcomes.includes(o)} onchange={(e) => toggle(o, e.currentTarget.checked)} />
            {OUTCOME_WORDS[o]}
          </label>
        {/each}
      </fieldset>
    {/if}
  </div>
  {#if problem}<p class="error" role="alert">{problem}</p>{/if}
  {#if count}<p><button type="button" onclick={() => onchange({ ...EMPTY_FILTERS, q: filters.q, period: hideOutcomes ? filters.period : 'any', outcomes: hideOutcomes ? filters.outcomes : [] })}>Clear filters</button></p>{/if}
</details>
```

Replace `apps/web/src/routes/+page.svelte` with:

```svelte
<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { onMount, untrack } from 'svelte';
  import type { Facets, ItemSummary, SearchResult } from '@superlibrary/contract';
  import { api } from '$lib/session.svelte';
  import FilterBar from '$lib/FilterBar.svelte';
  import ResultList from '$lib/ResultList.svelte';
  import { boardNames, browseLibrary, loadFacets, rangeProblem, readFilters, rowOfItem, rowOfResult, searchLibrary, writeFilters, type Filters } from '$lib/library';
  import Button from '$kit/Button.svelte';
  import EmptyState from '$kit/EmptyState.svelte';

  let facets = $state<Facets | null>(null);
  let results = $state<SearchResult[]>([]);
  let items = $state<ItemSummary[]>([]);
  let next = $state<string | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let words = $state('');
  const filters = $derived(readFilters(page.url.searchParams));
  const searching = $derived(filters.q.trim() !== '');
  const boards = $derived(boardNames(facets));
  const rows = $derived(searching ? results.map((r) => rowOfResult(r, boards)) : items.map((i) => rowOfItem(i, boards)));

  onMount(async () => { const f = await loadFacets(api); if (f.ok) facets = f.value; });

  function show(f: Filters) {
    const qs = writeFilters(f);
    return goto(qs ? `/?${qs}` : '/', { replaceState: true, keepFocus: true, noScroll: true });
  }

  let loads = 0;
  async function load(f: Filters, cursor: string | null = null) {
    const mine = ++loads;
    loading = true;
    error = null;
    if (rangeProblem(f)) { results = []; items = []; next = null; loading = false; return; }
    if (f.q.trim()) {
      const r = await searchLibrary(api, f);
      if (mine !== loads) return;
      if (r.ok) { results = r.value.results; next = null; } else error = r.message;
    } else {
      const r = await browseLibrary(api, f, cursor);
      if (mine !== loads) return;
      if (r.ok) { items = cursor ? [...items, ...r.value.items] : r.value.items; next = r.value.next; } else error = r.message;
    }
    loading = false;
  }
  $effect(() => { const f = filters; untrack(() => { words = f.q; void load(f); }); });

  const summaryLine = $derived(
    searching ? (rows.length === 25 ? 'The 25 best matches' : `${rows.length} match${rows.length === 1 ? '' : 'es'}`)
      : `${rows.length}${next ? '+' : ''} item${rows.length === 1 ? '' : 's'}, most recent activity first`,
  );
</script>

<svelte:head><title>Library · Superlibrary</title></svelte:head>
<div class="heading">
  <h1>Library</h1>
  <a class="kit-button kit-button--primary" href="/upload">Upload</a>
</div>
<form class="searchbar" role="search" onsubmit={(e) => { e.preventDefault(); void show({ ...filters, q: words }); }}>
  <label class="visually-hidden" for="q">Search the library</label>
  <input id="q" type="search" name="q" placeholder="Search artifacts and work records" bind:value={words} />
  <button type="submit">Search</button>
</form>
<FilterBar {filters} {facets} onchange={(f) => void show(f)} />
<p class="muted" role="status">{loading ? 'Loading…' : error ? '' : summaryLine}</p>
{#if error}
  <p class="error" role="alert">{error}</p>
  <button type="button" onclick={() => load(filters)}>Try again</button>
{:else if !loading && rows.length === 0}
  {#if searching}
    <EmptyState title="Nothing matches." body="Try other words, or clear the filters." />
  {:else}
    <EmptyState title="Nothing here yet" body="Upload a file or a folder, or link one from an agent's station.">
      {#snippet action()}<Button variant="primary" href="/upload">Upload</Button>{/snippet}
    </EmptyState>
  {/if}
{/if}
{#if rows.length}
  <ResultList {rows} label={searching ? 'Search results' : 'Library'} />
  {#if next}<button type="button" disabled={loading} onclick={() => load(filters, next)}>{loading ? 'Loading…' : 'More'}</button>{/if}
{/if}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @superlibrary/web test && pnpm --filter @superlibrary/web typecheck`
Expected: PASS.

- [ ] **Step 5: Revert-proof**

In `periodRange`'s `month` case use `new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))`; expect `periodRange starts a month at the person's local midnight` to FAIL. Restore. Change `{r.title}` to `{@html r.title}` in `ResultList.svelte`; expect `a title with markup is shown as text` (and the Task 12 guard) to FAIL. Restore.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/library.ts apps/web/src/lib/FilterBar.svelte apps/web/src/lib/ResultList.svelte apps/web/src/lib/library.test.ts apps/web/src/lib/ResultList.svelte.test.ts apps/web/src/routes/+page.svelte
git commit -m "feat(web): search and browse the library with filters kept in the address

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---

## Task 15: The item page: a compact header, related items and the work-record timeline

**Files:**
- Create: `apps/web/src/lib/record.ts`, `apps/web/src/lib/record.test.ts`, `apps/web/src/lib/WorkRecordView.svelte`, `apps/web/src/lib/WorkRecordView.svelte.test.ts`, `apps/web/src/lib/RelatedList.svelte`, `apps/web/src/lib/ItemHeader.svelte`, `apps/web/src/lib/ItemHeader.svelte.test.ts`
- Modify: `apps/web/src/lib/ItemView.svelte`, `apps/web/src/lib/item.ts` (`provenanceRows`: board and stage)

**Interfaces:**
- Consumes: `WorkRecordView`, `WorkRecord`, `RelatedItem` (contract); `GET /api/v1/items/:id/record` (Task 4); `POST /api/v1/related { itemId, limit }` (A4); `when` (item.ts); `OutcomeBadge`, `outcomeVar` (Task 12).
- Produces: `<ItemHeader item version? latest? actions?>` (the title and one meta line, then the content: the operator's phone review found the title block too tall), `timelineOf(r: WorkRecord): TimelineEntry[]`, `handoffText(h: unknown): string | null`, `specRows(spec: unknown)`, `toneVar(tone)`, `interface TimelineEntry { key; kind; at; title; who; detail; tone }`; `<WorkRecordView view>`; `<RelatedList itemId>`.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/src/lib/record.test.ts
import { describe, expect, it } from 'vitest';
import type { WorkRecord } from '@superlibrary/contract';
import { handoffText, specRows, timelineOf } from './record';

const rec = (over: Partial<WorkRecord> = {}): WorkRecord => ({
  schema: 'work-record/1', boardId: 'brd_00000000000000b1', cardId: 'card_00000000000000c1', title: 'Launch post', spec: { goal: 'Write it', audience: ['press'] },
  state: 'completed', stage: 'publish', archivedAt: null, createdAt: '2026-10-01T09:00:00.000Z', updatedAt: '2026-10-03T17:00:00.000Z',
  handoffs: [
    { runId: 'run_2', stage: 'draft', agent: 'prn_000000000000000000a2', startedAt: '2026-10-02T10:00:00.000Z', endedAt: null, attempt: 2, status: 'completed', handoff: { summary: 'Draft ready' }, failureReason: null },
    { runId: 'run_1', stage: 'draft', agent: 'prn_000000000000000000a2', startedAt: '2026-10-01T10:00:00.000Z', endedAt: null, attempt: 1, status: 'failed', handoff: null, failureReason: 'timed out' },
  ],
  comments: [{ id: 'c1', author: { kind: 'human', name: null }, body: 'Ship it', createdAt: '2026-10-02T12:00:00.000Z' }],
  references: [], gates: [{ id: 'g1', stage: 'review', decision: 'request_changes', resolvedAt: '2026-10-02T13:00:00.000Z' }, { id: 'g2', stage: 'final', decision: null, resolvedAt: null }],
  supersededByCard: null, outcome: 'approved', redactions: [], truncated: false, ...over,
});

describe('the work-record timeline (spec §11: stages, agents, handoffs, comments)', () => {
  it('timelineOf orders attempts, comments and gates by time, undated last', () => {
    const t = timelineOf(rec());
    expect(t.map((e) => e.title)).toEqual([
      'Card created', 'draft · attempt 1 · failed', 'draft · attempt 2 · completed', 'Comment', 'Gate at review: sent back for changes', 'Gate at final: waiting',
    ]);
    expect(t[1]).toMatchObject({ who: 'prn_000000000000000000a2', detail: 'Failed: timed out', tone: 'bad' });
    expect(t[2]).toMatchObject({ detail: 'Draft ready', tone: 'good' });
    expect(t[3]).toMatchObject({ who: 'A person', detail: 'Ship it' });
    expect(timelineOf(rec({ archivedAt: '2026-10-04T00:00:00.000Z' })).at(-1)!.title).toBe('Gate at final: waiting');
  });
  it('a handoff is text: a string, a summary, else its JSON, capped', () => {
    expect(handoffText('  done ')).toBe('done');
    expect(handoffText({ text: 'ok' })).toBe('ok');
    expect(handoffText({ files: 2 })).toBe('{\n  "files": 2\n}');
    expect(handoffText({ blob: 'x'.repeat(5000) })!.length).toBeLessThanOrEqual(2001);
    expect(handoffText(null)).toBeNull();
  });
  it('the spec reads as labelled rows', () => {
    expect(specRows(rec().spec)).toEqual([{ label: 'goal', value: 'Write it' }, { label: 'audience', value: '[\n  "press"\n]' }]);
    expect(specRows('free text')).toEqual([{ label: 'Spec', value: 'free text' }]);
    expect(specRows(null)).toEqual([]);
  });
});
```

```ts
// apps/web/src/lib/WorkRecordView.svelte.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import type { WorkRecordView as View } from '@superlibrary/contract';
import WorkRecordView from './WorkRecordView.svelte';

let c: ReturnType<typeof mount> | null = null;
afterEach(() => { if (c) unmount(c); c = null; document.body.innerHTML = ''; });

const view: View = {
  item: { id: 'itm_0123456789abcdef', kind: 'work-record', title: 'Launch post', scope: 'board:brd_00000000000000b1', outcome: 'rejected', createdBy: 'source:superpipeline', createdAt: '2026-10-01T09:00:00.000Z', latestVersion: 0, expiresAt: null, revokedAt: null, source: { sourceUrl: 'https://app.superpipeline.dev/b/brd_00000000000000b1/c/card_00000000000000c1' } },
  record: {
    schema: 'work-record/1', boardId: 'brd_00000000000000b1', cardId: 'card_00000000000000c1', title: 'Launch post', spec: { goal: '<b>bold</b>' }, state: 'rejected', stage: 'review', archivedAt: null,
    createdAt: '2026-10-01T09:00:00.000Z', updatedAt: '2026-10-03T17:00:00.000Z',
    handoffs: [{ runId: 'run_1', stage: 'draft', agent: null, startedAt: '2026-10-01T10:00:00.000Z', endedAt: null, attempt: 1, status: 'completed', handoff: '<script>alert(1)</script>', failureReason: null }],
    comments: [{ id: 'c1', author: { kind: 'agent', name: null }, body: 'Looks good <img src=x onerror=alert(1)>', createdAt: '2026-10-02T12:00:00.000Z' }],
    references: [], gates: [], supersededByCard: null, outcome: 'rejected', redactions: [{ field: 'comments[0].body', rule: 'github-token' }], truncated: false,
  },
  artifacts: [{ id: 'itm_0123456789abcde0', kind: 'artifact', title: 'Draft', scope: 'workspace', outcome: 'completed', createdBy: 'prn_000000000000000000a2', createdAt: '2026-10-02T00:00:00.000Z', latestVersion: 2, expiresAt: null, revokedAt: null }],
  boardName: 'Marketing & Community',
};

describe('WorkRecordView', () => {
  it('comments and handoffs are text, never markup', () => {
    c = mount(WorkRecordView, { target: document.body, props: { view } });
    flushSync();
    expect(document.querySelector('img, script, b')).toBeNull();
    expect(document.body.textContent).toContain('Looks good <img src=x onerror=alert(1)>');
    expect(document.body.textContent).toContain('<script>alert(1)</script>');
    expect(document.body.textContent).toContain('Some text was hidden because it looked like a secret.');
    expect(document.body.textContent).toContain('Marketing & Community');
    expect([...document.querySelectorAll('ol.timeline > li')].length).toBe(3);
    expect(document.querySelector('a[href="/a/itm_0123456789abcde0"]')!.textContent).toContain('Draft');
    expect(document.querySelector('a[target="_blank"]')!.getAttribute('rel')).toBe('noopener noreferrer');
  });
});
```

```ts
// apps/web/src/lib/ItemHeader.svelte.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import type { ItemSummary } from '@superlibrary/contract';
import ItemHeader from './ItemHeader.svelte';

let c: ReturnType<typeof mount> | null = null;
afterEach(() => { if (c) unmount(c); c = null; document.body.innerHTML = ''; });
const item = { id: 'itm_0123456789abcdef', kind: 'artifact', title: 'Queue diagram', scope: 'workspace', outcome: 'completed', createdBy: 'p', createdAt: '2026-10-01T00:00:00.000Z', latestVersion: 3, expiresAt: null, revokedAt: null } as ItemSummary;

describe('the item header (operator phone review: the title block was too tall)', () => {
  it('is the title and one meta line, then actions with their words', () => {
    c = mount(ItemHeader, { target: document.body, props: { item, version: 3, latest: 3, actions: [{ label: 'Upload a new version', icon: 'upload', href: '/upload?item=x', primary: true }] } });
    flushSync();
    const header = document.querySelector('header.item-header')!;
    expect([...header.children].map((e) => e.tagName.toLowerCase())).toEqual(['h1', 'p', 'div', 'div']);   // title, meta, toolbar, its More panel
    const meta = header.querySelector('p.item-meta')!;
    expect(meta.textContent).toContain('Completed');
    expect(meta.textContent).toContain('v3 (latest)');
    expect(meta.textContent).toContain('Everyone in the workspace');
    expect(header.querySelector('[role="toolbar"]')!.textContent).toContain('Upload a new version');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @superlibrary/web test -- src/lib/record.test.ts src/lib/WorkRecordView.svelte.test.ts src/lib/ItemHeader.svelte.test.ts`
Expected: FAIL (`./record` missing).

- [ ] **Step 3: Write the timeline, the view, the related list and wire the item page**

```ts
// apps/web/src/lib/record.ts
import type { WorkRecord } from '@superlibrary/contract';

export type Tone = 'good' | 'bad' | 'neutral';
export interface TimelineEntry { key: string; kind: 'created' | 'attempt' | 'comment' | 'gate' | 'archived'; at: string | null; title: string; who: string | null; detail: string | null; tone: Tone }

const GATE_WORDS = { approve: 'approved', request_changes: 'sent back for changes', reject: 'rejected' } as const;
const toneOf = (status: string): Tone =>
  /^(completed|produced|succeeded|done)$/.test(status) ? 'good' : /^(failed|error|rejected|canceled|cancelled|timed_out)$/.test(status) ? 'bad' : 'neutral';

/** A handoff as text: a string, an object's summary or text, else its JSON (capped at 2,000). Never markup. */
export function handoffText(h: unknown): string | null {
  if (h === null || h === undefined) return null;
  if (typeof h === 'string') return h.trim() || null;
  if (typeof h === 'object' && !Array.isArray(h)) {
    const o = h as Record<string, unknown>;
    for (const k of ['summary', 'text', 'message']) if (typeof o[k] === 'string' && (o[k] as string).trim()) return (o[k] as string).trim();
  }
  const s = JSON.stringify(h, null, 2);
  return s.length > 2000 ? `${s.slice(0, 2000)}…` : s;
}

/** Spec §11: stages, agents, handoffs, comments and gates, in the order they happened. */
export function timelineOf(r: WorkRecord): TimelineEntry[] {
  const out: TimelineEntry[] = [{ key: 'created', kind: 'created', at: r.createdAt, title: 'Card created', who: null, detail: null, tone: 'neutral' }];
  for (const h of r.handoffs) {
    out.push({ key: `run:${h.runId}`, kind: 'attempt', at: h.startedAt ?? h.endedAt, title: `${h.stage} · attempt ${h.attempt} · ${h.status}`, who: h.agent,
      detail: h.failureReason ? `Failed: ${h.failureReason}` : handoffText(h.handoff), tone: toneOf(h.status) });
  }
  for (const c of r.comments) {
    out.push({ key: `comment:${c.id}`, kind: 'comment', at: c.createdAt, title: 'Comment', who: c.author.name ?? (c.author.kind === 'agent' ? 'An agent' : 'A person'), detail: c.body, tone: 'neutral' });
  }
  for (const g of r.gates) {
    out.push({ key: `gate:${g.id}`, kind: 'gate', at: g.resolvedAt, title: g.decision ? `Gate at ${g.stage}: ${GATE_WORDS[g.decision]}` : `Gate at ${g.stage}: waiting`,
      who: null, detail: null, tone: g.decision === 'approve' ? 'good' : g.decision ? 'bad' : 'neutral' });
  }
  if (r.archivedAt) out.push({ key: 'archived', kind: 'archived', at: r.archivedAt, title: 'Archived', who: null, detail: null, tone: 'neutral' });
  return out
    .map((e, i) => ({ e, i }))
    .sort((a, b) => Number(a.e.at === null) - Number(b.e.at === null) || (a.e.at && b.e.at ? Date.parse(a.e.at) - Date.parse(b.e.at) : 0) || a.i - b.i)
    .map((x) => x.e);
}

export const toneVar = (t: Tone) => (t === 'good' ? 'var(--outcome-approved)' : t === 'bad' ? 'var(--outcome-rejected)' : 'var(--color-content-faint)');

export function specRows(spec: unknown): Array<{ label: string; value: string }> {
  if (spec === null || spec === undefined) return [];
  if (typeof spec !== 'object' || Array.isArray(spec)) return [{ label: 'Spec', value: handoffText(spec) ?? '' }];
  return Object.entries(spec as Record<string, unknown>).map(([label, v]) => ({ label, value: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }));
}
```

```svelte
<!-- apps/web/src/lib/WorkRecordView.svelte -->
<script lang="ts">
  import type { WorkRecordView } from '@superlibrary/contract';
  import OutcomeBadge from '$kit/OutcomeBadge.svelte';
  import { specRows, timelineOf, toneVar } from '$lib/record';
  import Toast from '$kit/Toast.svelte';
  import { when } from '$lib/item';

  let { view }: { view: WorkRecordView } = $props();
  const r = $derived(view.record);
  const entries = $derived(timelineOf(r));
  const spec = $derived(specRows(r.spec));
  const card = $derived(view.item.source?.sourceUrl && /^https:\/\//.test(view.item.source.sourceUrl) ? view.item.source.sourceUrl : null);
</script>

<section class="record" aria-labelledby="timeline-h">
  <p class="result-meta">
    <OutcomeBadge outcome={view.item.outcome} />
    <span>{view.boardName ?? r.boardId}</span>
    {#if r.stage}<span>Now at {r.stage}</span>{/if}
  </p>
  {#if card}<p><a class="kit-button" href={card} target="_blank" rel="noopener noreferrer">Open the card in Superpipeline</a></p>{/if}
  {#if r.redactions.length}<Toast tone="info" message="Some text was hidden because it looked like a secret." />{/if}
  {#if r.truncated}<Toast tone="info" message="This record is long: its oldest comments and handoffs were shortened." />{/if}
  {#if spec.length}
    <h2>Spec</h2>
    <dl class="rows">{#each spec as s (s.label)}<dt>{s.label}</dt><dd class="body">{s.value}</dd>{/each}</dl>
  {/if}
  <h2 id="timeline-h">Timeline</h2>
  <ol class="timeline">
    {#each entries as e (e.key)}
      <li style:--o={toneVar(e.tone)}>
        <strong>{e.title}</strong>
        <div class="when">{e.at ? when(e.at) : 'Time not recorded'}{e.who ? ` · ${e.who}` : ''}</div>
        {#if e.detail}<p class="body">{e.detail}</p>{/if}
      </li>
    {/each}
  </ol>
  <h2>Artifacts</h2>
  {#if view.artifacts.length}
    <ul class="items">
      {#each view.artifacts as a (a.id)}<li><a href={`/a/${a.id}`}><span class="title">{a.title}</span><small>v{a.latestVersion}</small></a></li>{/each}
    </ul>
  {:else}
    <p class="muted">No artifacts linked that you can see.</p>
  {/if}
</section>
```

```svelte
<!-- apps/web/src/lib/RelatedList.svelte -->
<script lang="ts">
  import type { RelatedItem } from '@superlibrary/contract';
  import OutcomeBadge from '$kit/OutcomeBadge.svelte';
  import { outcomeVar } from '$kit/outcome';
  import { api } from '$lib/session.svelte';

  let { itemId }: { itemId: string } = $props();
  let items = $state<RelatedItem[]>([]);
  let phase = $state<'loading' | 'ok' | 'failed'>('loading');

  $effect(() => {
    const id = itemId;
    let live = true;
    phase = 'loading';
    api('/api/v1/related', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ itemId: id, limit: 5 }) })
      .then(async (res) => {
        if (!live) return;
        if (!res.ok) { phase = 'failed'; return; }
        items = ((await res.json()) as { items: RelatedItem[] }).items;
        phase = 'ok';
      })
      .catch(() => { if (live) phase = 'failed'; });
    return () => { live = false; };
  });
</script>

<section aria-labelledby="related-h">
  <h2 id="related-h">Related</h2>
  {#if phase === 'loading'}
    <p class="muted" role="status">Looking for related work…</p>
  {:else if phase === 'failed'}
    <p class="muted">Related items could not be loaded.</p>
  {:else if items.length === 0}
    <p class="muted">Nothing related found yet.</p>
  {:else}
    <ul class="results" aria-label="Related items">
      {#each items as r (r.itemId)}
        <li class="result" style:--o={outcomeVar(r.outcome)}>
          <a class="result-link" href={`/a/${r.itemId}`}>
            <span class="result-title">{r.title}</span>
            <span class="result-meta"><OutcomeBadge outcome={r.outcome} /></span>
            {#if r.snippet}<span class="snippet">{r.snippet}</span>{/if}
          </a>
        </li>
      {/each}
    </ul>
  {/if}
</section>
```

```svelte
<!-- apps/web/src/lib/ItemHeader.svelte -->
<script lang="ts">
  import type { ItemSummary } from '@superlibrary/contract';
  import { visibilityWords } from '@superlibrary/embed';
  import OutcomeBadge from '$kit/OutcomeBadge.svelte';
  import Toolbar, { type ToolbarItem } from '$kit/Toolbar.svelte';
  import { day } from '$lib/item';

  let { item, version, latest, actions = [] }: { item: ItemSummary; version?: number; latest?: number; actions?: ToolbarItem[] } = $props();
  const meta = $derived([
    version !== undefined ? `v${version}${version === latest ? ' (latest)' : ''}` : null,
    visibilityWords({ scope: item.scope, canWiden: false, boardVisible: item.audience === 'board' }),
    item.expiresAt ? `deleted on ${day(item.expiresAt)}` : null,
  ].filter((m): m is string => m !== null));
</script>

<!-- One line of facts under the title, then the content: details live below the viewer. -->
<header class="item-header">
  <h1>{item.title}</h1>
  <p class="item-meta"><OutcomeBadge outcome={item.outcome} />{#each meta as m (m)}<span>{m}</span>{/each}</p>
  {#if actions.length}<Toolbar label="Item" items={actions} />{/if}
</header>
```

In `apps/web/src/lib/ItemView.svelte`:
0. Replace the `<header class="item-head">…</header>` block with `<ItemHeader {item} version={current?.version} latest={latestLive} actions={manage && item.kind === 'artifact' ? [{ label: 'Upload a new version', icon: 'upload', href: `/upload?item=${itemId}`, primary: true }] : []} />` (import `ItemHeader from '$lib/ItemHeader.svelte'`), and delete the old `{#if manage}<p><a … href={`/upload?item=${itemId}`}>Upload a new version</a></p>{/if}` under the versions list: the action now sits under the title.
1. Imports: `import type { WorkRecordView as RecordView } from '@superlibrary/contract';`, `import WorkRecordView from '$lib/WorkRecordView.svelte';`, `import RelatedList from '$lib/RelatedList.svelte';`.
2. State: `let record = $state<RecordView | null>(null);`
3. In `load()`, in the `r.state === 'ok'` branch before `phase = 'ok'`:
   ```ts
   if (r.item.kind === 'work-record') {
     const res = await api(`/api/v1/items/${itemId}/record`).catch(() => null);
     if (mine !== loads) return;
     record = res?.ok ? ((await res.json()) as RecordView) : null;
   } else record = null;
   ```
4. In the viewer `$effect`, change the guard to `if (!el || phase !== 'ok' || item?.kind !== 'artifact') return;`.
5. In the markup, wrap the viewer `<div class="viewer" …>`, the frame error block and the `.item-grid` (versions and details) in `{#if item.kind === 'artifact'} … {:else if record}<WorkRecordView view={record} />{:else}<p class="muted">The record could not be loaded.</p>{/if}`.
6. After the Provenance section add `<RelatedList {itemId} />`.

In `apps/web/src/lib/item.ts` `provenanceRows`, after the `Source path` row add:

```ts
  if (s.board) rows.push({ label: 'Board', value: s.board, mono: true });
  if (s.stage) rows.push({ label: 'Stage', value: s.stage });
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @superlibrary/web test && pnpm --filter @superlibrary/web typecheck`
Expected: PASS.

- [ ] **Step 5: Revert-proof**

Sort `timelineOf` by key instead of time (`a.e.key.localeCompare(b.e.key)`); expect `timelineOf orders…` to FAIL. Restore. Render `{e.detail}` through `{@html e.detail}`; expect `comments and handoffs are text…` to FAIL. Restore.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/record.ts apps/web/src/lib/record.test.ts apps/web/src/lib/WorkRecordView.svelte apps/web/src/lib/WorkRecordView.svelte.test.ts apps/web/src/lib/RelatedList.svelte apps/web/src/lib/ItemHeader.svelte apps/web/src/lib/ItemHeader.svelte.test.ts apps/web/src/lib/ItemView.svelte apps/web/src/lib/item.ts
git commit -m "feat(web): a compact item header, work-record timelines and related items

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---
## Task 16: Moderation in the item page

**Files:**
- Create: `apps/web/src/lib/moderation.ts`, `apps/web/src/lib/moderation.test.ts`, `apps/web/src/lib/ModerationPanel.svelte`
- Modify: `apps/web/src/lib/kit/ConfirmDialog.svelte` (a required reason), `apps/web/src/lib/kit/ConfirmDialog.svelte.test.ts`, `apps/web/src/lib/item.ts` (`explain` sentences), `apps/web/src/lib/ItemView.svelte`

**Interfaces:**
- Consumes: `change`, `readItem`, `explain`, `type Ask`, `mayManage` (item.ts); `ITEM_ID` (contract); `POST …/supersede`, `PATCH …/caption`, `POST …/remove` (Tasks 6–7), `POST …/scope` (phase 1).
- Produces: `parseItemRef(input): string | null`, `askSupersede(title, byTitle)`, `askWiden(title)`, `askRemove(title, kind)`, `supersede(api, id, by)`, `setCaption(api, id, caption)`, `widen(api, id)`, `removeItem(api, id, reason)`; `<ModerationPanel item onchanged onremoved>`; `ConfirmDialog` props `reasonRequired?: boolean`.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/src/lib/moderation.test.ts
import { describe, expect, it } from 'vitest';
import { askRemove, askSupersede, parseItemRef } from './moderation';
import { explain } from './item';

describe('moderation helpers (spec §11)', () => {
  it('parseItemRef takes an id or an item link, and nothing else', () => {
    expect(parseItemRef(' itm_0123456789abcdef ')).toBe('itm_0123456789abcdef');
    expect(parseItemRef('https://app.superlibrary.dev/a/itm_0123456789abcdef/v/3')).toBe('itm_0123456789abcdef');
    expect(parseItemRef('http://localhost:5173/a/itm_0123456789abcdef?x=1')).toBe('itm_0123456789abcdef');
    expect(parseItemRef('itm_0123')).toBeNull();
    expect(parseItemRef('https://example.com/b/itm_0123456789abcdef')).toBeNull();
  });
  it('the confirmations name the act, and removal asks for a reason', () => {
    expect(askSupersede('Old plan', 'New plan')).toMatchObject({ title: 'Mark “Old plan” as superseded?', action: 'Mark as superseded' });
    expect(askRemove('Old plan', 'work-record')).toMatchObject({ action: 'Remove from memory', reason: true, required: true });
    expect(askRemove('Old plan', 'work-record').message).toContain('later changes to the card will not bring it back');
  });
  it('refusals read as sentences', () => {
    expect(explain('invalid', 'that would make a loop of replacements')).toBe('That would make a loop: the replacement is already marked as superseded by this item.');
    expect(explain('invalid', 'an item cannot supersede itself')).toBe('An item cannot replace itself.');
    expect(explain('not_found', 'the replacement was not found')).toBe('Nothing here, or you cannot see it.');
  });
});
```

Add to `apps/web/src/lib/kit/ConfirmDialog.svelte.test.ts`, inside its `describe`:

```ts
  it('a required reason keeps the act disabled until it is given, and says it is recorded', () => {
    const { dialog, props } = open({ reason: true, reasonRequired: true, action: 'Remove from memory' });
    const act = [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Remove from memory')!;
    expect(act.disabled).toBe(true);
    expect(dialog.textContent).toContain('required');
    const ta = dialog.querySelector('textarea')!;
    ta.value = 'posted twice';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect(act.disabled).toBe(false);
    act.click();
    expect(props.onconfirm).toHaveBeenCalledWith('posted twice');
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @superlibrary/web test -- src/lib/moderation.test.ts src/lib/kit/ConfirmDialog.svelte.test.ts`
Expected: FAIL (`./moderation` missing; the act is enabled with an empty reason).

- [ ] **Step 3: Write the helpers, the dialog change, the panel and wire the item page**

```ts
// apps/web/src/lib/moderation.ts
/** Spec §11 moderation, from the item page. A person's act; the API decides who may. */
import { ITEM_ID } from '@superlibrary/contract';
import { change, type Ask } from './item';

type Api = (path: string, init?: RequestInit) => Promise<Response>;
const LINK = /^https?:\/\/[^/]+\/a\/(itm_[0-9a-f]{16})(?:\/v\/[1-9][0-9]*)?\/?(?:[?#].*)?$/;

/** An item id, or the id in an item link (`…/a/itm_…[/v/n]`). Anything else is not an item. */
export function parseItemRef(input: string): string | null {
  const s = input.trim();
  if (ITEM_ID.test(s)) return s;
  return LINK.exec(s)?.[1] ?? null;
}

export const askSupersede = (title: string, byTitle: string): Ask => ({
  title: `Mark “${title}” as superseded?`,
  message: `It will show as superseded by “${byTitle}” and rank lower in search. You can undo this.`,
  action: 'Mark as superseded',
});
export const askWiden = (title: string): Ask => ({
  title: `Show “${title}” to everyone in the workspace?`,
  message: 'Everyone in the workspace, and every agent in it, will be able to find and open it. It cannot be narrowed again.',
  action: 'Show to everyone',
});
export const askRemove = (title: string, kind: 'artifact' | 'work-record'): Ask & { required: true } => ({
  title: `Remove “${title}” from memory?`,
  message: kind === 'work-record'
    ? 'The record and its search entries are deleted, and later changes to the card will not bring it back. Your reason is kept in the audit log.'
    : 'The item, every version, its files and its search entries are deleted. Your reason is kept in the audit log.',
  action: 'Remove from memory',
  reason: true,
  required: true,
});

export const supersede = (api: Api, id: string, by: string | null) => change(api, `/api/v1/items/${id}/supersede`, 'POST', { by });
export const setCaption = (api: Api, id: string, caption: string | null) => change(api, `/api/v1/items/${id}/caption`, 'PATCH', { caption });
export const widen = (api: Api, id: string) => change(api, `/api/v1/items/${id}/scope`, 'POST', { scope: 'workspace' });
export const removeItem = (api: Api, id: string, reason: string) => change(api, `/api/v1/items/${id}/remove`, 'POST', { reason });
```

In `apps/web/src/lib/item.ts` `explain`, inside the `code === 'invalid'` branch before its `return`s:

```ts
    if (detail === 'that would make a loop of replacements') return 'That would make a loop: the replacement is already marked as superseded by this item.';
    if (detail === 'an item cannot supersede itself') return 'An item cannot replace itself.';
    if (detail === 'a reason of 3 to 500 characters is required') return 'Say why, in at least 3 characters.';
```

In `apps/web/src/lib/kit/ConfirmDialog.svelte`: add the prop `reasonRequired = false` (typed `/** The act stays disabled until a reason of 3+ characters is given. */ reasonRequired?: boolean;`); change the label to `<label class="field">{reasonRequired ? 'Why? (required; recorded in the audit log)' : 'Why? (optional)'} <textarea bind:value={why} maxlength="500" rows="2" disabled={busy} required={reasonRequired} aria-required={reasonRequired}></textarea></label>`; and the confirm button's `disabled` to `disabled={busy || (reasonRequired && why.trim().length < 3)}`.

```svelte
<!-- apps/web/src/lib/ModerationPanel.svelte -->
<script lang="ts">
  import { untrack } from 'svelte';
  import type { ItemSummary } from '@superlibrary/contract';
  import ConfirmDialog from '$kit/ConfirmDialog.svelte';
  import { api } from '$lib/session.svelte';
  import { readItem, type Ask } from '$lib/item';
  import { askRemove, askSupersede, askWiden, parseItemRef, removeItem, setCaption, supersede, widen } from '$lib/moderation';

  let { item, onchanged, onremoved }: { item: ItemSummary; onchanged: (notice: string) => void; onremoved: () => void } = $props();

  let caption = $state(untrack(() => item.caption ?? ''));
  let captionError = $state<string | null>(null);
  let savingCaption = $state(false);
  let replacement = $state('');
  let replaceError = $state<string | null>(null);
  let pending = $state<(Ask & { required?: boolean; opener: HTMLElement | null; run: (reason: string) => Promise<string | null> }) | null>(null);
  let busy = $state(false);
  let dialogError = $state<string | null>(null);

  function ask(opener: HTMLElement | null, a: Ask & { required?: boolean }, run: (reason: string) => Promise<string | null>) {
    dialogError = null;
    pending = { ...a, opener, run };
  }
  async function confirm(reason: string) {
    if (!pending || busy) return;
    busy = true;
    dialogError = null;
    const err = await pending.run(reason);
    busy = false;
    if (err) { dialogError = err; return; }
    pending = null;
  }
  async function saveCaption(e: SubmitEvent) {
    e.preventDefault();
    savingCaption = true;
    captionError = await setCaption(api, item.id, caption.trim() || null);
    savingCaption = false;
    if (!captionError) onchanged(caption.trim() ? 'Caption saved.' : 'Caption removed.');
  }
  async function askReplace(e: SubmitEvent) {
    e.preventDefault();
    replaceError = null;
    const opener = e.submitter instanceof HTMLElement ? e.submitter : null;
    const by = parseItemRef(replacement);
    if (!by) { replaceError = 'Paste a Superlibrary link or an item id (itm_…).'; return; }
    if (by === item.id) { replaceError = 'An item cannot replace itself.'; return; }
    const r = await readItem(api, by).catch(() => null);
    if (!r || r.state !== 'ok') { replaceError = 'Nothing here, or you cannot see it.'; return; }
    ask(opener, askSupersede(item.title, r.item.title), async () => {
      const err = await supersede(api, item.id, by);
      if (!err) { replacement = ''; onchanged(`Marked as superseded by “${r.item.title}”.`); }
      return err;
    });
  }
  async function undo() {
    const err = await supersede(api, item.id, null);
    if (err) replaceError = err;
    else onchanged('No longer marked as superseded.');
  }
</script>

<section class="panel" aria-labelledby="moderate-h">
  <h2 id="moderate-h">Moderate</h2>
  {#if item.kind === 'artifact'}
    <form class="stack" onsubmit={saveCaption}>
      <label class="field">Caption <textarea rows="2" maxlength="2000" bind:value={caption} disabled={savingCaption}></textarea></label>
      <p class="muted hint">Shown with the item and used by search. Most useful for images.</p>
      {#if captionError}<p class="error" role="alert">{captionError}</p>{/if}
      <div class="actions"><button type="submit" disabled={savingCaption}>Save caption</button></div>
    </form>
  {/if}
  {#if item.supersededBy}
    <p>Superseded by <a href={`/a/${item.supersededBy}`}>the item that replaced it</a>.</p>
    {#if replaceError}<p class="error" role="alert">{replaceError}</p>{/if}
    <div class="actions"><button type="button" onclick={undo}>Undo superseded</button></div>
  {:else}
    <form class="stack" novalidate onsubmit={askReplace}>
      <label class="field">Replaced by <input name="replacement" placeholder="A Superlibrary link, or itm_…" bind:value={replacement} /></label>
      {#if replaceError}<p class="error" role="alert">{replaceError}</p>{/if}
      <div class="actions"><button type="submit" disabled={!replacement.trim()}>Mark as superseded</button></div>
    </form>
  {/if}
  {#if item.kind === 'work-record' && item.scope !== 'workspace'}
    <div class="actions">
      <button type="button" onclick={(e) => ask(e.currentTarget, askWiden(item.title), async () => {
        const err = await widen(api, item.id);
        if (!err) onchanged('Everyone in the workspace can now see it.');
        return err;
      })}>Show to everyone in the workspace</button>
    </div>
  {/if}
  <div class="actions">
    <button type="button" class="kit-button kit-button--danger" onclick={(e) => ask(e.currentTarget, askRemove(item.title, item.kind), async (reason) => {
      const err = await removeItem(api, item.id, reason);
      if (!err) onremoved();
      return err;
    })}>Remove from memory</button>
  </div>
</section>

{#if pending}
  <ConfirmDialog title={pending.title} message={pending.message} action={pending.action} reason={pending.reason ?? false} reasonRequired={pending.required ?? false}
    {busy} error={dialogError} opener={pending.opener} onconfirm={confirm} oncancel={() => { if (!busy) pending = null; }} />
{/if}
```

In `apps/web/src/lib/ItemView.svelte`:
1. `import ModerationPanel from '$lib/ModerationPanel.svelte';` and `let removed = $state(false);`.
2. Wrap the whole `{#if phase === 'loading'} … {/if}` chain as `{#if removed} … {:else if phase === 'loading'} …`, with the removed branch:
   ```svelte
   {#if removed}
     <h1 tabindex="-1">Removed from memory</h1>
     <p>It is gone from the library and from search. The audit log keeps your reason.</p>
     <p><a class="kit-button" href="/">Back to the library</a></p>
   ```
3. Inside `{#if manage}`'s `.manage` section, first child:
   ```svelte
   <ModerationPanel {item} onchanged={(n) => { notice = n; void load(); }} onremoved={() => { removed = true; }} />
   ```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @superlibrary/web test && pnpm --filter @superlibrary/web typecheck`
Expected: PASS.

- [ ] **Step 5: Revert-proof**

Drop `(reasonRequired && why.trim().length < 3)` from the button; expect `a required reason keeps the act disabled…` to FAIL. Restore. Make `LINK` accept any path (`/(itm_[0-9a-f]{16})/`); expect `parseItemRef takes an id or an item link, and nothing else` to FAIL. Restore.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/moderation.ts apps/web/src/lib/moderation.test.ts apps/web/src/lib/ModerationPanel.svelte apps/web/src/lib/kit/ConfirmDialog.svelte apps/web/src/lib/kit/ConfirmDialog.svelte.test.ts apps/web/src/lib/item.ts apps/web/src/lib/ItemView.svelte
git commit -m "feat(web): moderate from the item page: caption, superseded by, show to everyone, remove with a reason

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---

## Task 17: Collections pages, and "Add to collection" on the item page

**Files:**
- Create: `apps/web/src/lib/collections.ts`, `apps/web/src/lib/collections.test.ts`, `apps/web/src/lib/AddToCollection.svelte`, `apps/web/src/routes/collections/+page.svelte`, `apps/web/src/routes/collections/[id]/+page.svelte`
- Modify: `apps/web/src/lib/item.ts` (`change` takes `DELETE`; `name_taken` sentence), `apps/web/src/lib/ItemView.svelte`

**Interfaces:**
- Consumes: the collection routes (Task 5); `loadJson`, `type Loaded` (Task 14); `change`, `explain`, `when`, `type Ask` (item.ts); `ConfirmDialog`, `OutcomeBadge`, `outcomeVar`.
- Produces: `listCollections(api)`, `getCollection(api, id)`, `createCollection(api, name, description)`, `updateCollection(api, id, patch)`, `deleteCollection(api, id)`, `addToCollection(api, id, itemId)`, `removeFromCollection(api, id, itemId)`, `askDeleteCollection(name)`; `<AddToCollection itemId>`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/collections.test.ts
import { describe, expect, it } from 'vitest';
import { addToCollection, askDeleteCollection, createCollection, removeFromCollection } from './collections';

function fakeApi(answer: (path: string, init: RequestInit) => Response) {
  const calls: Array<{ path: string; method: string; body: unknown }> = [];
  const api = async (path: string, init: RequestInit = {}) => {
    calls.push({ path, method: init.method ?? 'GET', body: init.body ? JSON.parse(String(init.body)) : undefined });
    return answer(path, init);
  };
  return { api, calls };
}

describe('collections from the app', () => {
  it('adds and removes through the collection routes', async () => {
    const { api, calls } = fakeApi(() => new Response(null, { status: 204 }));
    expect(await addToCollection(api, 'col_0123456789abcdef', 'itm_0123456789abcdef')).toBeNull();
    expect(await removeFromCollection(api, 'col_0123456789abcdef', 'itm_0123456789abcdef')).toBeNull();
    expect(calls).toEqual([
      { path: '/api/v1/collections/col_0123456789abcdef/items', method: 'POST', body: { itemId: 'itm_0123456789abcdef' } },
      { path: '/api/v1/collections/col_0123456789abcdef/items/itm_0123456789abcdef', method: 'DELETE', body: undefined },
    ]);
  });
  it('a taken name reads as a sentence', async () => {
    const { api } = fakeApi(() => Response.json({ error: 'name_taken' }, { status: 409 }));
    expect(await createCollection(api, 'Week 41', '')).toEqual({ ok: false, message: 'A collection with that name already exists.' });
  });
  it('deleting says what happens to the items', () => {
    expect(askDeleteCollection('Week 41')).toMatchObject({ title: 'Delete the collection “Week 41”?', action: 'Delete collection' });
    expect(askDeleteCollection('Week 41').message).toContain('its items stay in the library');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @superlibrary/web test -- src/lib/collections.test.ts`
Expected: FAIL (`./collections` missing).

- [ ] **Step 3: Write the helpers, pages and the item-page control**

In `apps/web/src/lib/item.ts`: change `change`'s signature to `export async function change(api: Api, path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<string | null>` and its request to `api(path, body === undefined ? { method } : { method, headers: JSON_HEADERS, body: JSON.stringify(body) })`; add `name_taken: 'A collection with that name already exists.'` to `WORDS`.

```ts
// apps/web/src/lib/collections.ts
import type { CollectionDetail, CollectionSummary } from '@superlibrary/contract';
import { change, type Ask } from './item';
import { loadJson } from './library';

type Api = (path: string, init?: RequestInit) => Promise<Response>;

export const listCollections = (api: Api) => loadJson<{ collections: CollectionSummary[] }>(api, '/api/v1/collections');
export const getCollection = (api: Api, id: string) => loadJson<CollectionDetail>(api, `/api/v1/collections/${id}`);
export const createCollection = (api: Api, name: string, description: string) => loadJson<CollectionSummary>(api, '/api/v1/collections', { name, description });
export const updateCollection = (api: Api, id: string, patch: { name?: string; description?: string }) => change(api, `/api/v1/collections/${id}`, 'PATCH', patch);
export const deleteCollection = (api: Api, id: string) => change(api, `/api/v1/collections/${id}`, 'DELETE');
export const addToCollection = (api: Api, id: string, itemId: string) => change(api, `/api/v1/collections/${id}/items`, 'POST', { itemId });
export const removeFromCollection = (api: Api, id: string, itemId: string) => change(api, `/api/v1/collections/${id}/items/${itemId}`, 'DELETE');

export const askDeleteCollection = (name: string): Ask => ({
  title: `Delete the collection “${name}”?`,
  message: 'The collection goes; its items stay in the library. An artifact kept only by this collection is deleted after 30 days.',
  action: 'Delete collection',
});
```

```svelte
<!-- apps/web/src/routes/collections/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import type { CollectionSummary } from '@superlibrary/contract';
  import { api } from '$lib/session.svelte';
  import { createCollection, listCollections } from '$lib/collections';

  let list = $state<CollectionSummary[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let name = $state('');
  let description = $state('');
  let creating = $state(false);
  let createError = $state<string | null>(null);

  async function load() {
    loading = true;
    const r = await listCollections(api);
    loading = false;
    if (r.ok) { list = r.value.collections; error = null; } else error = r.message;
  }
  onMount(load);

  async function create(e: SubmitEvent) {
    e.preventDefault();
    if (!name.trim()) { createError = 'Give the collection a name.'; return; }
    creating = true;
    createError = null;
    const r = await createCollection(api, name.trim(), description.trim());
    creating = false;
    if (!r.ok) { createError = r.message; return; }
    await goto(`/collections/${r.value.id}`);
  }
</script>

<svelte:head><title>Collections · Superlibrary</title></svelte:head>
<h1>Collections</h1>
<p class="muted">Named sets of items, put together by people. An artifact in a collection is kept however old it is.</p>
<form class="inline-form" novalidate onsubmit={create}>
  <label class="field">Name <input bind:value={name} maxlength="120" /></label>
  <label class="field">Description (optional) <input bind:value={description} maxlength="1000" /></label>
  <button type="submit" class="kit-button kit-button--primary" disabled={creating}>{creating ? 'Creating…' : 'Create collection'}</button>
</form>
{#if createError}<p class="error" role="alert">{createError}</p>{/if}
{#if loading}
  <p class="muted" role="status">Loading…</p>
{:else if error}
  <p class="error" role="alert">{error}</p>
  <button type="button" onclick={load}>Try again</button>
{:else if list.length === 0}
  <p>No collections yet. Create the first one above.</p>
{:else}
  <ul class="items" aria-label="Collections">
    {#each list as c (c.id)}
      <li><a href={`/collections/${c.id}`}><span class="title">{c.name}</span><small>{c.itemCount} item{c.itemCount === 1 ? '' : 's'}{c.description ? ` · ${c.description}` : ''}</small></a></li>
    {/each}
  </ul>
{/if}
```

```svelte
<!-- apps/web/src/routes/collections/[id]/+page.svelte -->
<script lang="ts">
  import { untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { COLLECTION_ID, type CollectionDetail } from '@superlibrary/contract';
  import { api } from '$lib/session.svelte';
  import ConfirmDialog from '$kit/ConfirmDialog.svelte';
  import OutcomeBadge from '$kit/OutcomeBadge.svelte';
  import { outcomeVar } from '$kit/outcome';
  import { when } from '$lib/item';
  import { askDeleteCollection, deleteCollection, getCollection, removeFromCollection, updateCollection } from '$lib/collections';
  import Toast from '$kit/Toast.svelte';

  const id = $derived(page.params.id ?? '');
  let c = $state<CollectionDetail | null>(null);
  let error = $state<string | null>(null);
  let notice = $state<string | null>(null);
  let editing = $state(false);
  let name = $state('');
  let description = $state('');
  let editError = $state<string | null>(null);
  let deleting = $state<HTMLElement | null>(null);
  let busy = $state(false);
  let dialogError = $state<string | null>(null);

  async function load() {
    if (!COLLECTION_ID.test(id)) { error = 'Nothing here, or you cannot see it.'; return; }
    const r = await getCollection(api, id);
    if (r.ok) { c = r.value; error = null; } else error = r.message;
  }
  $effect(() => { void id; untrack(() => void load()); });

  function startEdit() { name = c!.name; description = c!.description; editError = null; editing = true; }
  async function save(e: SubmitEvent) {
    e.preventDefault();
    const err = await updateCollection(api, id, { name: name.trim(), description: description.trim() });
    if (err) { editError = err; return; }
    editing = false;
    notice = 'Saved.';
    await load();
  }
  async function remove(itemId: string, title: string) {
    const err = await removeFromCollection(api, id, itemId);
    notice = err ?? `Removed “${title}” from the collection.`;
    await load();
  }
  async function confirmDelete() {
    busy = true;
    dialogError = null;
    const err = await deleteCollection(api, id);
    busy = false;
    if (err) { dialogError = err; return; }
    deleting = null;
    await goto('/collections');
  }
</script>

<svelte:head><title>{c ? c.name : 'Collection'} · Superlibrary</title></svelte:head>
{#if notice}<Toast message={notice} onclose={() => (notice = null)} />{/if}
{#if error}
  <p class="error" role="alert">{error}</p>
  <p><a class="kit-button" href="/collections">All collections</a></p>
{:else if !c}
  <p class="muted" role="status">Loading…</p>
{:else}
  <h1>{c.name}</h1>
  {#if c.description}<p class="body">{c.description}</p>{/if}
  <p class="muted">{c.itemCount} item{c.itemCount === 1 ? '' : 's'} · created {when(c.createdAt)}</p>
  {#if c.canEdit}
    {#if editing}
      <form class="inline-form" novalidate onsubmit={save}>
        <label class="field">Name <input bind:value={name} maxlength="120" /></label>
        <label class="field">Description <input bind:value={description} maxlength="1000" /></label>
        <button type="submit" class="kit-button kit-button--primary">Save</button>
        <button type="button" onclick={() => (editing = false)}>Cancel</button>
      </form>
      {#if editError}<p class="error" role="alert">{editError}</p>{/if}
    {:else}
      <div class="actions">
        <button type="button" onclick={startEdit}>Rename or describe</button>
        <button type="button" class="kit-button kit-button--danger" onclick={(e) => { dialogError = null; deleting = e.currentTarget; }}>Delete collection</button>
      </div>
    {/if}
  {/if}
  {#if c.entries.length === 0}
    <p>Nothing in it yet. Open an item and choose <strong>Add to collection</strong>.</p>
  {:else}
    <ul class="results" aria-label="Items in this collection">
      {#each c.entries as e (e.item.id)}
        <li class="result entry" style:--o={outcomeVar(e.item.outcome)}>
          <a class="result-link" href={`/a/${e.item.id}`}>
            <span class="result-title">{e.item.title}</span>
            <span class="result-meta"><OutcomeBadge outcome={e.item.outcome} /><small>added {when(e.addedAt)}</small></span>
            {#if e.note}<span class="snippet">{e.note}</span>{/if}
          </a>
          <button type="button" onclick={() => remove(e.item.id, e.item.title)}>Remove <span class="visually-hidden">“{e.item.title}” </span>from collection</button>
        </li>
      {/each}
    </ul>
  {/if}
{/if}
{#if deleting && c}
  {@const ask = askDeleteCollection(c.name)}
  <ConfirmDialog title={ask.title} message={ask.message} action={ask.action} {busy} error={dialogError} opener={deleting}
    onconfirm={confirmDelete} oncancel={() => { if (!busy) deleting = null; }} />
{/if}
```

```svelte
<!-- apps/web/src/lib/AddToCollection.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { CollectionSummary } from '@superlibrary/contract';
  import { api } from '$lib/session.svelte';
  import { addToCollection, listCollections } from '$lib/collections';

  let { itemId }: { itemId: string } = $props();
  let list = $state<CollectionSummary[]>([]);
  let chosen = $state('');
  let message = $state<string | null>(null);
  let failed = $state(false);
  let busy = $state(false);

  onMount(async () => {
    const r = await listCollections(api);
    if (r.ok) { list = r.value.collections; chosen = list[0]?.id ?? ''; }
  });
  async function add(e: SubmitEvent) {
    e.preventDefault();
    if (!chosen) return;
    busy = true;
    const err = await addToCollection(api, chosen, itemId);
    busy = false;
    failed = err !== null;
    message = err ?? `Added to “${list.find((c) => c.id === chosen)?.name ?? 'the collection'}”.`;
  }
</script>

<section class="panel" aria-labelledby="collect-h">
  <h2 id="collect-h">Collections</h2>
  {#if list.length === 0}
    <p class="muted">No collections yet. <a href="/collections">Create one</a>.</p>
  {:else}
    <form class="inline-form" onsubmit={add}>
      <label class="field">Collection
        <select bind:value={chosen}>{#each list as c (c.id)}<option value={c.id}>{c.name}</option>{/each}</select>
      </label>
      <button type="submit" disabled={busy || !chosen}>Add to collection</button>
    </form>
  {/if}
  {#if message}<p class={failed ? 'error' : 'muted'} role={failed ? 'alert' : 'status'}>{message}</p>{/if}
</section>
```

In `apps/web/src/lib/ItemView.svelte`: `import AddToCollection from '$lib/AddToCollection.svelte';` and, right after `<RelatedList {itemId} />`, add `<AddToCollection {itemId} />` (every person who can see the item may add it, decision O2).

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @superlibrary/web test && pnpm --filter @superlibrary/web typecheck`
Expected: PASS.

- [ ] **Step 5: Revert-proof**

Make `change` ignore `DELETE` (always send `POST`); expect `adds and removes through the collection routes` to FAIL. Restore. Remove `name_taken` from `WORDS`; expect `a taken name reads as a sentence` to FAIL. Restore.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/collections.ts apps/web/src/lib/collections.test.ts apps/web/src/lib/AddToCollection.svelte apps/web/src/routes/collections apps/web/src/lib/item.ts apps/web/src/lib/ItemView.svelte
git commit -m "feat(web): collections: create, rename, delete, add from the item page, remove

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---

## Task 18: Views by outcome

**Files:**
- Create: `apps/web/src/routes/outcomes/+page.svelte`
- Modify: `apps/web/src/lib/library.ts` (`viewTitle`), `apps/web/src/lib/library.test.ts`

**Interfaces:**
- Consumes: `browseLibrary` (its `counts`), `readFilters`/`writeFilters` with `defaults`, `rowOfItem`, `boardNames`, `rangeProblem` (Task 14); `FilterBar` with `hideOutcomes`, `ResultList`; `OUTCOME_ORDER`, `OUTCOME_WORDS`, `outcomeVar` (Task 12).
- Produces: `viewTitle(outcome: Outcome | null, board: string | null, period: Period): string`; the page `/outcomes?outcome=<o>&board=<brd>&period=<p>` (period defaults to `month`).

- [ ] **Step 1: Write the failing test**

Add to `apps/web/src/lib/library.test.ts`:

```ts
import { viewTitle } from './library';

describe('views by outcome (spec §11)', () => {
  it('the heading says the view in words', () => {
    expect(viewTitle('rejected', 'Marketing & Community', 'month')).toBe('Everything rejected on Marketing & Community this month');
    expect(viewTitle('in-progress', null, '30d')).toBe('Everything in progress in the last 30 days');
    expect(viewTitle(null, null, 'any')).toBe('Everything');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @superlibrary/web test -- src/lib/library.test.ts`
Expected: FAIL (`viewTitle` is not exported).

- [ ] **Step 3: Write `viewTitle` and the page**

Append to `apps/web/src/lib/library.ts`:

```ts
import { OUTCOME_WORDS } from './outcome';

const PERIOD_WORDS: Record<Period, string> = { any: '', week: ' this week', month: ' this month', '30d': ' in the last 30 days', custom: ' between those dates' };
/** "Everything rejected on Marketing & Community this month" (spec §11's own example). */
export function viewTitle(outcome: Outcome | null, board: string | null, period: Period): string {
  const what = outcome ? `Everything ${OUTCOME_WORDS[outcome].toLowerCase()}` : 'Everything';
  return `${what}${board ? ` on ${board}` : ''}${PERIOD_WORDS[period]}`;
}
```

(Move the import to the top of the file with the others.)

```svelte
<!-- apps/web/src/routes/outcomes/+page.svelte -->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { onMount, untrack } from 'svelte';
  import { OUTCOMES, type Facets, type ItemSummary, type Outcome, type OutcomeCounts } from '@superlibrary/contract';
  import { api } from '$lib/session.svelte';
  import FilterBar from '$lib/FilterBar.svelte';
  import ResultList from '$lib/ResultList.svelte';
  import { OUTCOME_ORDER, OUTCOME_WORDS, outcomeVar } from '$kit/outcome';
  import { boardNames, browseLibrary, loadFacets, rangeProblem, readFilters, rowOfItem, viewTitle, writeFilters, type Filters } from '$lib/library';

  /** This page opens on this month (spec §11 "everything rejected on … this month"). */
  const DEFAULTS = { period: 'month' } as const;
  let facets = $state<Facets | null>(null);
  let items = $state<ItemSummary[]>([]);
  let counts = $state<OutcomeCounts | null>(null);
  let next = $state<string | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  const filters = $derived<Filters>({ ...readFilters(page.url.searchParams, DEFAULTS), q: '' });
  const selected = $derived<Outcome | null>(filters.outcomes[0] ?? null);
  const boards = $derived(boardNames(facets));
  const rows = $derived(items.map((i) => rowOfItem(i, boards)));
  const title = $derived(viewTitle(selected, filters.board ? (boards.get(filters.board) ?? filters.board) : null, filters.period));
  const total = $derived(counts ? OUTCOMES.reduce((n, o) => n + counts![o], 0) : null);
  const href = (f: Filters) => { const qs = writeFilters(f, DEFAULTS); return qs ? `/outcomes?${qs}` : '/outcomes'; };

  onMount(async () => { const f = await loadFacets(api); if (f.ok) facets = f.value; });

  let loads = 0;
  async function load(f: Filters, cursor: string | null = null) {
    const mine = ++loads;
    loading = true;
    error = null;
    if (rangeProblem(f)) { items = []; counts = null; next = null; loading = false; return; }
    const r = await browseLibrary(api, { ...f, outcomes: f.outcomes.slice(0, 1) }, cursor);
    if (mine !== loads) return;
    if (r.ok) { items = cursor ? [...items, ...r.value.items] : r.value.items; counts = r.value.counts; next = r.value.next; } else error = r.message;
    loading = false;
  }
  $effect(() => { const f = filters; untrack(() => void load(f)); });
</script>

<svelte:head><title>Outcomes · Superlibrary</title></svelte:head>
<h1>{title}</h1>
<nav aria-label="Outcome">
  <ul class="tabs">
    <li><a href={href({ ...filters, outcomes: [] })} aria-current={selected === null ? 'page' : undefined}>Everything{#if total !== null} <span class="count">{total}</span>{/if}</a></li>
    {#each OUTCOME_ORDER as o (o)}
      <li style:--o={outcomeVar(o)}>
        <a href={href({ ...filters, outcomes: [o] })} aria-current={selected === o ? 'page' : undefined}>
          <span class="outcome">{OUTCOME_WORDS[o]}</span>{#if counts} <span class="count">{counts[o]}</span>{/if}
        </a>
      </li>
    {/each}
  </ul>
</nav>
<FilterBar {filters} {facets} hideOutcomes onchange={(f) => void goto(href({ ...f, outcomes: filters.outcomes }), { replaceState: true, keepFocus: true, noScroll: true })} />
<p class="muted" role="status">{loading ? 'Loading…' : error ? '' : `${rows.length}${next ? '+' : ''} item${rows.length === 1 ? '' : 's'}, most recent activity first`}</p>
{#if error}
  <p class="error" role="alert">{error}</p>
  <button type="button" onclick={() => load(filters)}>Try again</button>
{:else if !loading && rows.length === 0}
  <p>Nothing{selected ? ` ${OUTCOME_WORDS[selected].toLowerCase()}` : ''} here in this period. Try another board or a longer period.</p>
{/if}
{#if rows.length}
  <ResultList {rows} label={title} />
  {#if next}<button type="button" disabled={loading} onclick={() => load(filters, next)}>{loading ? 'Loading…' : 'More'}</button>{/if}
{/if}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @superlibrary/web test && pnpm --filter @superlibrary/web typecheck`
Expected: PASS.

- [ ] **Step 5: Revert-proof**

Drop `${PERIOD_WORDS[period]}` from `viewTitle`; expect `the heading says the view in words` to FAIL. Restore.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/library.ts apps/web/src/lib/library.test.ts apps/web/src/routes/outcomes
git commit -m "feat(web): views by outcome, with counts per outcome for the board and period

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---

## Task 19: End to end, at every width

**Files:**
- Create: `apps/web/e2e/library.spec.ts`, `apps/web/e2e/responsive.spec.ts`
- Modify: `apps/web/e2e/helpers.ts` (`devWorkspace`, `seedWorkRecordLocal`, and `expectNoSideways`/`shortControls` moved here from `phone.spec.ts`), `apps/web/e2e/phone.spec.ts` (imports them), `apps/web/playwright.config.ts` (WebKit runs `responsive.spec.ts`)

**Interfaces:**
- Consumes: the whole app (Tasks 11–18) and API (Tasks 1–8) on the local stack the Playwright config boots; `uploadViaApi`, `DEV`, `APP` (helpers.ts).
- Produces: `devWorkspace(request): Promise<string>`, `seedWorkRecordLocal(o): string` (an item id), `expectNoSideways(page, label)`, `shortControls(page, atLeast): Promise<string[]>`.

- [ ] **Step 1: Move the phone checks and add the seed helper**

Cut `expectNoSideways` and `shortControls` from `apps/web/e2e/phone.spec.ts` into `apps/web/e2e/helpers.ts` unchanged, prefixed with `export`; in `phone.spec.ts` import them: `import { expectNoSideways, frameOf, shortControls, uploadViaApi } from './helpers';`. Then append to `helpers.ts`:

```ts
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** The dev person's workspace (on a fresh run, the dev person is its owner: the first person seen). */
export async function devWorkspace(request: APIRequestContext): Promise<string> {
  const res = await request.get(`${API}/api/v1/me`, { headers: DEV });
  return ((await res.json()) as { workspaceId: string }).workspaceId;
}

const sq = (s: string) => `'${s.replace(/'/g, "''")}'`;
const REPO = join(import.meta.dirname, '..', '..', '..');
let seq = 0;

/**
 * A work record written straight into the local D1 the dev Worker serves, with its FTS row. e2e has
 * no Superpipeline; these are the rows the ingest and index consumers write (phases 2-3 A13, B3).
 */
export function seedWorkRecordLocal(o: { ws: string; title: string; text: string; outcome: string; board?: string; boardName?: string; comment?: string }): string {
  const hex = `${Date.now().toString(16)}${(seq++).toString(16).padStart(4, '0')}`.slice(-16).padStart(16, '0');
  const id = `itm_${hex}`;
  const card = `card_${hex}`;
  const board = o.board ?? 'brd_00000000000000e1';
  const now = new Date().toISOString();
  const text = `${o.title}\n${o.text}`;
  const body = {
    schema: 'work-record/1', boardId: board, cardId: card, title: o.title, spec: { goal: o.text }, state: 'completed', stage: 'review', archivedAt: null, createdAt: now, updatedAt: now,
    handoffs: [{ runId: `run_${hex}`, stage: 'draft', agent: 'prn_000000000000000000a2', startedAt: now, endedAt: now, attempt: 1, status: 'completed', handoff: { summary: 'Draft ready' }, failureReason: null }],
    comments: [{ id: 'cmt_e2e', author: { kind: 'human', name: 'A person' }, body: o.comment ?? 'Reviewed', createdAt: now }],
    references: [], gates: [], supersededByCard: null, outcome: o.outcome, redactions: [], truncated: false,
  };
  const sql = [
    `INSERT OR REPLACE INTO source_boards (workspace_id, board_id, name, last_seen_at) VALUES (${sq(o.ws)}, ${sq(board)}, ${sq(o.boardName ?? 'Marketing & Community')}, ${sq(now)});`,
    `INSERT INTO items (id, workspace_id, kind, title, scope, outcome, created_by) VALUES (${sq(id)}, ${sq(o.ws)}, 'work-record', ${sq(o.title)}, ${sq(`board:${board}`)}, ${sq(o.outcome)}, 'source:superpipeline');`,
    `INSERT INTO work_records (item_id, workspace_id, board_id, card_id, digest, body, text, source_updated_at) VALUES (${sq(id)}, ${sq(o.ws)}, ${sq(board)}, ${sq(card)}, 'e2e', ${sq(JSON.stringify(body))}, ${sq(text)}, ${sq(now)});`,
    `INSERT INTO item_sources (item_id, source, board_id, card_id, stage, source_id, source_url) VALUES (${sq(id)}, 'superpipeline', ${sq(board)}, ${sq(card)}, 'review', ${sq(card)}, ${sq(`https://app.superpipeline.dev/b/${board}/c/${card}`)});`,
    `INSERT INTO chunks (id, item_id, version, position, text, tokens) VALUES (${sq(`${id}:0:0`)}, ${sq(id)}, 0, 0, ${sq(text)}, 20);`,
    `INSERT INTO chunks_fts (text, chunk_id, item_id) VALUES (${sq(text)}, ${sq(`${id}:0:0`)}, ${sq(id)});`,
  ].join('\n');
  const file = join(mkdtempSync(join(tmpdir(), 'sl-e2e-')), 'seed.sql');
  writeFileSync(file, sql);
  // The same persist directory the webServer's API uses (playwright.config.ts PERSIST), relative to apps/api.
  execFileSync('pnpm', ['--filter', '@superlibrary/api', 'exec', 'wrangler', 'd1', 'execute', 'superlibrary-catalog', '--local', '--persist-to', '../../.wrangler-e2e', '--file', file], { cwd: REPO, stdio: 'pipe' });
  return id;
}
```

In `apps/web/playwright.config.ts`, change WebKit's `testMatch` to `/(security|phone|responsive)\.spec\.ts$/`.

- [ ] **Step 2: Write the specs**

```ts
// apps/web/e2e/library.spec.ts
import { expect, test } from '@playwright/test';
import { DEV, devWorkspace, seedWorkRecordLocal, uploadViaApi } from './helpers';

const API = 'http://localhost:8787';

test.describe('the library app (phase 4)', () => {
  test('search with filters finds a work record, and the address keeps the view', async ({ page, request }) => {
    const ws = await devWorkspace(request);
    seedWorkRecordLocal({ ws, title: 'Spring campaign retrospective', text: 'budget overrun on the spring campaign', outcome: 'rejected' });
    await page.goto('/');
    await page.getByLabel('Search the library').fill('retrospective');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page).toHaveURL(/[?&]q=retrospective/);
    const hit = page.getByRole('list', { name: 'Search results' }).getByRole('listitem').filter({ hasText: 'Spring campaign retrospective' });
    await expect(hit).toContainText('Rejected');
    await expect(hit).toContainText('Marketing & Community');
    await page.getByRole('checkbox', { name: 'Approved' }).check();
    await expect(page).toHaveURL(/outcome=approved/);
    await expect(page.getByText('Nothing matches.')).toBeVisible();
    await page.reload();   // the view is the address
    await expect(page.getByRole('checkbox', { name: 'Approved' })).toBeChecked();
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(hit).toBeVisible();
  });

  test('an outcome view: everything rejected on one board this month', async ({ page, request }) => {
    const ws = await devWorkspace(request);
    const board = 'brd_00000000000000e2';
    seedWorkRecordLocal({ ws, title: 'Rejected press note', text: 'press note', outcome: 'rejected', board, boardName: 'Press' });
    seedWorkRecordLocal({ ws, title: 'Approved press note', text: 'press note', outcome: 'approved', board, boardName: 'Press' });
    await page.goto(`/outcomes?outcome=rejected&board=${board}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Everything rejected on Press this month');
    await expect(page.getByRole('link', { name: /Rejected press note/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Approved press note/ })).toHaveCount(0);
    const tabs = page.getByRole('navigation', { name: 'Outcome' });
    await expect(tabs.getByRole('link', { name: /Rejected/ })).toHaveAttribute('aria-current', 'page');
    await expect(tabs.getByRole('link', { name: /Approved/ })).toContainText('1');
  });

  test('a work record shows its timeline, and agent-written text as text', async ({ page, request }) => {
    const ws = await devWorkspace(request);
    const id = seedWorkRecordLocal({ ws, title: 'Timeline card', text: 'timeline', outcome: 'approved', comment: 'Looks good <img src=x onerror=alert(1)>' });
    await page.goto(`/a/${id}`);
    await expect(page.getByRole('heading', { name: 'Timeline card', level: 1 })).toBeVisible();
    const timeline = page.locator('ol.timeline');
    await expect(timeline).toContainText('draft · attempt 1 · completed');
    await expect(timeline).toContainText('Looks good <img src=x onerror=alert(1)>');
    await expect(timeline.locator('img')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Open the card in Superpipeline' })).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(page.getByRole('heading', { name: 'Related' })).toBeVisible();
  });

  test('collections: create, add from the item page, remove', async ({ page, request }) => {
    const a = await uploadViaApi(request, [{ path: 'note.md', body: '# Collected note' }], { title: 'Collected note' });
    const name = `Week ${Date.now()}`;
    await page.goto('/collections');
    await page.getByLabel('Name').fill(name);
    await page.getByRole('button', { name: 'Create collection' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
    await page.goto(`/a/${a.itemId}`);
    await page.getByLabel('Collection', { exact: true }).selectOption({ label: name });
    await page.getByRole('button', { name: 'Add to collection' }).click();
    await expect(page.getByRole('status').filter({ hasText: `Added to “${name}”.` })).toBeVisible();
    await page.goto('/collections');
    await page.getByRole('link', { name: new RegExp(name) }).click();
    await expect(page.getByRole('link', { name: /Collected note/ })).toBeVisible();
    await page.getByRole('button', { name: /Remove .*Collected note.*from collection/ }).click();
    await expect(page.getByRole('link', { name: /Collected note/ })).toHaveCount(0);
  });

  test('moderation: supersede with an in-page confirmation, undo, then remove with a recorded reason', async ({ page, request }) => {
    const dialogs: string[] = [];
    page.on('dialog', (d) => { dialogs.push(d.message()); void d.dismiss(); });
    const oldOne = await uploadViaApi(request, [{ path: 'old.md', body: '# Old plan' }], { title: 'Old plan' });
    const newOne = await uploadViaApi(request, [{ path: 'new.md', body: '# New plan' }], { title: 'New plan' });
    await page.goto(`/a/${oldOne.itemId}`);
    await page.getByLabel('Replaced by').fill(`http://localhost:5173/a/${newOne.itemId}`);
    const mark = page.getByRole('button', { name: 'Mark as superseded' });
    await mark.click();
    const dialog = page.getByRole('alertdialog', { name: 'Mark “Old plan” as superseded?' });
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(mark).toBeFocused();
    await mark.click();
    await dialog.getByRole('button', { name: 'Mark as superseded' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Marked as superseded by “New plan”.' })).toBeVisible();
    await page.getByRole('button', { name: 'Undo superseded' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'No longer marked as superseded.' })).toBeVisible();
    await page.getByRole('button', { name: 'Remove from memory' }).click();
    const remove = page.getByRole('alertdialog', { name: 'Remove “Old plan” from memory?' });
    const act = remove.getByRole('button', { name: 'Remove from memory' });
    await expect(act).toBeDisabled();
    await remove.getByLabel(/Why\?/).fill('posted twice');
    await act.click();
    await expect(page.getByRole('heading', { name: 'Removed from memory' })).toBeVisible();
    expect((await request.get(`${API}/api/v1/items/${oldOne.itemId}`, { headers: DEV })).status()).toBe(404);
    expect(dialogs).toEqual([]);
  });

  test('an owner shows a work record to everyone in the workspace', async ({ page, request }) => {
    const ws = await devWorkspace(request);
    const id = seedWorkRecordLocal({ ws, title: 'Widen me', text: 'widen', outcome: 'completed' });
    await page.goto(`/a/${id}`);
    await page.getByRole('button', { name: 'Show to everyone in the workspace' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Show to everyone' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Everyone in the workspace can now see it.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Show to everyone in the workspace' })).toHaveCount(0);
  });
});
```

```ts
// apps/web/e2e/responsive.spec.ts
import { expect, test } from '@playwright/test';
import { devWorkspace, expectNoSideways, seedWorkRecordLocal, shortControls, uploadViaApi } from './helpers';

/** The operator reads on a phone first; the app must hold at every width it is used at. */
const WIDTHS = [390, 768, 1024, 1280, 1920];

for (const width of WIDTHS) {
  test(`at ${width}px nothing scrolls sideways${width === 390 ? ' and every control is at least 44px tall' : ''}`, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 900 });
    const ws = await devWorkspace(request);
    const record = seedWorkRecordLocal({ ws, title: `A long title that has to wrap at phone width ${'word '.repeat(12)}`, text: 'responsive check', outcome: 'failed' });
    const art = await uploadViaApi(request, [{ path: 'r.md', body: '# r' }], { title: 'Responsive artifact' });
    for (const path of ['/', '/?q=responsive', '/outcomes', '/collections', `/a/${record}`, `/a/${art.itemId}`]) {
      await page.goto(path);
      await expect(page.locator('h1').first()).toBeVisible();
      await expectNoSideways(page, `${path} at ${width}px`);
      if (width === 390) expect(await shortControls(page, 3), `${path} at 390px`).toEqual([]);
    }
    // The operator's phone review of phase 1, held at every width:
    await page.goto(`/a/${art.itemId}`);
    const title = (await page.locator('h1').first().boundingBox())!;
    const viewer = (await page.locator('.viewer').boundingBox())!;
    expect(viewer.y - title.y, 'the content starts right under the title').toBeLessThan(width < 768 ? 170 : 130);
    const bar = page.locator('.sl-toolbar');
    await expect(bar).toBeVisible();
    for (const control of await bar.locator('button:visible, a:visible, .sl-select:visible').all()) {
      const words = await control.evaluate((el) => [...el.querySelectorAll('.sl-label, .sl-version')].some((l) => (l as HTMLElement).offsetWidth > 1 && l.textContent!.trim() !== ''));
      expect(words, 'no toolbar control is an icon alone').toBe(true);
    }
    const header = page.locator('header.shell');
    await expect(header.locator('.shell-brand')).toContainText('Superlibrary');
    await expect(header.locator('.shell-account')).toBeVisible();
    await expect(header.getByRole('button', { name: 'Sign out' })).toBeHidden();   // inside the account menu
  });
}
```

- [ ] **Step 3: Run the e2e suite**

Run: `pnpm --filter @superlibrary/web e2e -- e2e/library.spec.ts e2e/responsive.spec.ts e2e/phone.spec.ts`
Expected: PASS on Chromium; `responsive` and `phone` also on WebKit. A failure in `responsive` names the page, the width and the short control: fix the CSS in `kit.css` or the token it reads (never by exempting the control).

- [ ] **Step 4: Revert-proof**

Remove the `@media (max-width: 767px)` block for `.shell` and `.shell-nav` from `kit.css`; expect `at 390px …` to FAIL (sideways scroll). Restore. Change ModerationPanel's remove button to call `window.confirm('Remove?')` before asking; expect the moderation test to FAIL (`dialogs` not empty) and the phase-1 guard `src/lib/no-browser-dialogs.test.ts` to FAIL. Restore.

- [ ] **Step 5: Commit, push and open P4-APP**

```bash
git add apps/web/e2e apps/web/playwright.config.ts
git commit -m "test(web): the library app end to end, and at 390 to 1920px

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
pnpm -r typecheck && pnpm -r test
git push -u origin feat/p4-app
gh pr create --title "Phase 4 app: design system, suite shell, search and browse, outcome views, timelines, collections, moderation" --body "$(cat <<'EOF'
Plan tasks 11-19 of docs/superpowers/plans/2026-10-10-superlibrary-phase-4.md: the suite design system's first instance (a working direction): one token source with contrast contracts and IBM Plex, the component kit, the suite shell (mark, nav, account menu with theme and sign-out, switcher, footer with the provisional parent mark); the Library page (search + browse, filters in the address), work-record timelines and related items, moderation from the item page (in-page confirmations, required reason), collections, views by outcome, and e2e at 390-1920 px on Chromium and WebKit.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Merge on green; `deploy-web` publishes Pages.

---
## Task 20: `suli search`, `suli collect`, `suli scope`

Its own PR (P4-CLI), after P4-API is merged: `git -C /Users/rakeshgangwar/SuperJackfruit/superlibrary worktree add -b feat/p4-cli /Users/rakeshgangwar/SuperJackfruit/.worktrees/superlibrary-p4-cli origin/main`.

**Files:**
- Create: `packages/cli/src/library.ts`, `packages/cli/src/library.test.ts`, `docs/reference/cli/library.md` (generated)
- Modify: `packages/cli/src/commands.ts` (group `library`, seven entries, usage column width), `packages/cli/src/index.ts` (three arms), `packages/cli/src/artifacts.ts` (export `client`, `refused`, `itemId`), `docs/reference/cli/index.md` (generated)

**Interfaces:**
- Consumes: `POST /api/v1/search` (Task 3), the collection routes (Task 5), `POST /api/v1/items/:id/scope` (phase 1); `makeClient`/`client`, `refused`, `itemId`, `type Client` (artifacts.ts); `COLLECTION_ID`, `OUTCOMES`, `SearchResult`, `CollectionSummary`, `CollectionDetail` (contract).
- Produces commands (the reference test holds them to the switch):
  - `suli search <words…> [--kind] [--outcome a,b] [--board] [--agent] [--station] [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--limit n]`
  - `suli collect list`, `suli collect create <name…> [--description]`, `suli collect show <collection>`, `suli collect add <collection> <item> [--note]`, `suli collect remove <collection> <item>`
  - `suli scope <item> workspace`
  - functions `searchBody`, `resultLines`, `searchWith`, `resolveCollection`, `collectListWith`, `collectCreateWith`, `collectShowWith`, `collectAddWith`, `collectRemoveWith`, `scopeWith` (each takes a `Client`), and the CLI wrappers `search`, `collect`, `scope`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/cli/src/library.test.ts
import { describe, expect, it } from 'vitest';
import type { Client } from './artifacts.ts';
import { collectAddWith, resolveCollection, resultLines, scopeWith, searchBody } from './library.ts';

const NONE = { kind: null, outcome: null, board: null, agent: null, station: null, since: null, until: null, limit: null };
function fake(answers: Record<string, unknown>): { c: Client; calls: Array<[string, string, unknown]> } {
  const calls: Array<[string, string, unknown]> = [];
  const c: Client = async (method, path, body) => {
    calls.push([method, path, body]);
    const a = answers[`${method} ${path}`];
    return a === undefined ? Response.json({ error: 'not_found' }, { status: 404 }) : Response.json(a);
  };
  return { c, calls };
}
const COLS = { collections: [{ id: 'col_0123456789abcdef', name: 'Week 41', description: '', createdBy: 'p', createdAt: 't', updatedAt: 't', itemCount: 0, canEdit: true }] };

describe('suli search (spec §11)', () => {
  it('turns flags into the search body; --until includes its day', () => {
    expect(searchBody('deploy checklist', { ...NONE, kind: 'work-record', outcome: 'rejected,failed', board: 'brd_00000000000000b1', since: '2026-10-01', until: '2026-10-31', limit: '5' })).toEqual({
      query: 'deploy checklist', kinds: ['work-record'], outcomes: ['rejected', 'failed'], board: 'brd_00000000000000b1',
      since: '2026-10-01T00:00:00.000Z', until: '2026-11-01T00:00:00.000Z', limit: 5,
    });
  });
  it('refuses what the server would refuse, before sending', () => {
    expect(() => searchBody('', NONE)).toThrow('say what to look for');
    expect(() => searchBody('x', { ...NONE, outcome: 'great' })).toThrow('unknown outcome: great');
    expect(() => searchBody('x', { ...NONE, kind: 'folder' })).toThrow('--kind is artifact or work-record');
    expect(() => searchBody('x', { ...NONE, since: '1 Oct' })).toThrow('YYYY-MM-DD');
    expect(() => searchBody('x', { ...NONE, limit: '30' })).toThrow('--limit is 1 to 25');
  });
  it('prints one line per result with its outcome', () => {
    expect(resultLines([{ itemId: 'itm_0123456789abcdef', kind: 'artifact', title: 'Plan', outcome: 'rejected', scope: 'workspace', provenance: {}, snippet: 'too  costly\nfor now', url: 'u', score: 1, supersededBy: 'itm_0123456789abcde0' }]))
      .toEqual(['itm_0123456789abcdef  [rejected]  Plan', '    too costly for now', '    superseded by itm_0123456789abcde0']);
    expect(resultLines([])).toEqual(['Nothing matches.']);
  });
});

describe('suli collect', () => {
  it('finds a collection by id or by name, in any case', async () => {
    const { c } = fake({ 'GET /api/v1/collections': COLS });
    expect((await resolveCollection(c, 'week 41')).id).toBe('col_0123456789abcdef');
    expect((await resolveCollection(c, 'col_0123456789abcdef')).name).toBe('Week 41');
    await expect(resolveCollection(c, 'Week 42')).rejects.toThrow('no collection called Week 42');
  });
  it('adds an item to the collection it names', async () => {
    const { c, calls } = fake({ 'GET /api/v1/collections': COLS, 'POST /api/v1/collections/col_0123456789abcdef/items': { added: true } });
    await collectAddWith(c, 'Week 41', 'itm_0123456789abcdef', 'the keeper');
    expect(calls.at(-1)).toEqual(['POST', '/api/v1/collections/col_0123456789abcdef/items', { itemId: 'itm_0123456789abcdef', note: 'the keeper' }]);
  });
});

describe('suli scope', () => {
  it('widens to the workspace only, and refuses anything else without a request', async () => {
    const { c, calls } = fake({ 'POST /api/v1/items/itm_0123456789abcdef/scope': { item: { scope: 'workspace' } } });
    await expect(scopeWith(c, 'itm_0123456789abcdef', 'board')).rejects.toThrow('only workspace');
    expect(calls).toEqual([]);
    await scopeWith(c, 'itm_0123456789abcdef', 'workspace');
    expect(calls).toEqual([['POST', '/api/v1/items/itm_0123456789abcdef/scope', { scope: 'workspace' }]]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @superlibrary/cli test -- src/library.test.ts`
Expected: FAIL (`./library.ts` missing).

- [ ] **Step 3: Write the commands**

In `packages/cli/src/artifacts.ts`: export the existing `refused` (`export async function refused`), `itemId` (`export function itemId`) and `client` (`export const client`).

```ts
// packages/cli/src/library.ts
/** suli search, collect and scope (spec §11). A client: it adds no authority and renders the server's refusals. */
import { COLLECTION_ID, OUTCOMES, type CollectionDetail, type CollectionSummary, type SearchResult } from '@superlibrary/contract';
import { client, itemId, refused, type Client } from './artifacts.ts';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** The start of that day, UTC (as `suli upload --expires`); `plus` days later for an inclusive end. */
function dayStart(d: string, plus = 0): string {
  if (!DAY.test(d)) throw new Error(`a date is YYYY-MM-DD: ${d}`);
  const t = new Date(`${d}T00:00:00.000Z`);
  if (Number.isNaN(t.getTime())) throw new Error(`a date is YYYY-MM-DD: ${d}`);
  t.setUTCDate(t.getUTCDate() + plus);
  return t.toISOString();
}

export interface SearchOptions { kind: string | null; outcome: string | null; board: string | null; agent: string | null; station: string | null; since: string | null; until: string | null; limit: string | null }

export function searchBody(words: string, o: SearchOptions): Record<string, unknown> {
  if (!words.trim()) throw new Error('say what to look for: suli search <words>');
  const body: Record<string, unknown> = { query: words.trim() };
  if (o.kind) {
    if (o.kind !== 'artifact' && o.kind !== 'work-record') throw new Error('--kind is artifact or work-record');
    body.kinds = [o.kind];
  }
  if (o.outcome) {
    const list = o.outcome.split(',').map((s) => s.trim()).filter(Boolean);
    const bad = list.find((x) => !(OUTCOMES as readonly string[]).includes(x));
    if (bad) throw new Error(`unknown outcome: ${bad}. One of ${OUTCOMES.join(', ')}`);
    body.outcomes = list;
  }
  if (o.board) body.board = o.board;
  if (o.agent) body.agent = o.agent;
  if (o.station) body.station = o.station;
  if (o.since) body.since = dayStart(o.since);
  if (o.until) body.until = dayStart(o.until, 1);
  if (o.limit) {
    const n = Number(o.limit);
    if (!Number.isInteger(n) || n < 1 || n > 25) throw new Error('--limit is 1 to 25');
    body.limit = n;
  }
  return body;
}

export function resultLines(results: SearchResult[]): string[] {
  if (results.length === 0) return ['Nothing matches.'];
  return results.flatMap((r) => [
    `${r.itemId}  [${r.outcome}]  ${r.title}`,
    ...(r.snippet ? [`    ${r.snippet.replace(/\s+/g, ' ').trim().slice(0, 200)}`] : []),
    ...(r.supersededBy ? [`    superseded by ${r.supersededBy}`] : []),
  ]);
}

export async function searchWith(c: Client, words: string, o: SearchOptions): Promise<SearchResult[]> {
  const res = await c('POST', '/api/v1/search', searchBody(words, o));
  if (!res.ok) return refused(res, 'the search');
  return ((await res.json()) as { results: SearchResult[] }).results;
}

export async function search(words: string, o: SearchOptions & { json: boolean }): Promise<void> {
  const results = await searchWith(client(), words, o);
  process.stdout.write(o.json ? JSON.stringify({ results }) + '\n' : resultLines(results).join('\n') + '\n');
}

export async function collectListWith(c: Client): Promise<CollectionSummary[]> {
  const res = await c('GET', '/api/v1/collections');
  if (!res.ok) return refused(res, 'the collections');
  return ((await res.json()) as { collections: CollectionSummary[] }).collections;
}

/** A collection named by its id, or by its exact name in any case. */
export async function resolveCollection(c: Client, ref: string | undefined): Promise<CollectionSummary> {
  if (!ref) throw new Error('name a collection: its id (col_…) or its name');
  const all = await collectListWith(c);
  const found = COLLECTION_ID.test(ref) ? all.find((x) => x.id === ref) : all.find((x) => x.name.toLowerCase() === ref.toLowerCase());
  if (!found) throw new Error(`no collection called ${ref}. Run suli collect list.`);
  return found;
}

export async function collectCreateWith(c: Client, name: string, description: string | null): Promise<CollectionSummary> {
  if (!name.trim()) throw new Error('name the collection: suli collect create <name>');
  const res = await c('POST', '/api/v1/collections', { name: name.trim(), description: description ?? '' });
  if (!res.ok) return refused(res, 'the collection');
  return (await res.json()) as CollectionSummary;
}

export async function collectShowWith(c: Client, ref: string | undefined): Promise<CollectionDetail> {
  const col = await resolveCollection(c, ref);
  const res = await c('GET', `/api/v1/collections/${col.id}`);
  if (!res.ok) return refused(res, 'the collection');
  return (await res.json()) as CollectionDetail;
}

export async function collectAddWith(c: Client, ref: string | undefined, rawItem: string | undefined, note: string | null): Promise<void> {
  const id = itemId(rawItem, 'collect add');
  const col = await resolveCollection(c, ref);
  const res = await c('POST', `/api/v1/collections/${col.id}/items`, note ? { itemId: id, note } : { itemId: id });
  if (!res.ok) return refused(res, id);
}

export async function collectRemoveWith(c: Client, ref: string | undefined, rawItem: string | undefined): Promise<void> {
  const id = itemId(rawItem, 'collect remove');
  const col = await resolveCollection(c, ref);
  const res = await c('DELETE', `/api/v1/collections/${col.id}/items/${id}`);
  if (!res.ok) return refused(res, id);
}

/** Spec §4: widening to the workspace is a person's act, recorded. Narrowing does not exist. */
export async function scopeWith(c: Client, rawItem: string | undefined, scope: string | undefined): Promise<unknown> {
  if (scope !== 'workspace') throw new Error('only workspace: suli scope <item> workspace (an item is never narrowed)');
  const id = itemId(rawItem, 'scope');
  const res = await c('POST', `/api/v1/items/${id}/scope`, { scope: 'workspace' });
  if (!res.ok) return refused(res, id);
  return res.json();
}

const out = (json: boolean, value: unknown, text: string) => process.stdout.write(json ? JSON.stringify(value) + '\n' : text + '\n');

export async function collect(sub: string | undefined, args: string[], o: { description: string | null; note: string | null; json: boolean }): Promise<void> {
  const c = client();
  if (sub === 'list') {
    const list = await collectListWith(c);
    return out(o.json, { collections: list }, list.length ? list.map((x) => `${x.id}  ${x.name}  (${x.itemCount} item${x.itemCount === 1 ? '' : 's'})`).join('\n') : 'No collections yet.');
  }
  if (sub === 'create') {
    const col = await collectCreateWith(c, args.join(' '), o.description);
    return out(o.json, col, `Created ${col.name} (${col.id}).`);
  }
  if (sub === 'show') {
    const d = await collectShowWith(c, args[0]);
    return out(o.json, d, [`${d.name}  (${d.id})`, ...(d.description ? [d.description] : []), ...d.entries.map((e) => `  ${e.item.id}  [${e.item.outcome}]  ${e.item.title}`)].join('\n'));
  }
  if (sub === 'add') { await collectAddWith(c, args[0], args[1], o.note); return out(o.json, { added: true }, 'Added.'); }
  if (sub === 'remove') { await collectRemoveWith(c, args[0], args[1]); return out(o.json, { removed: true }, 'Removed.'); }
  throw new Error(`unknown command: collect ${sub ?? ''}. Run suli help collect.`);
}

export async function scope(rawItem: string | undefined, to: string | undefined, o: { json: boolean }): Promise<void> {
  const r = await scopeWith(client(), rawItem, to);
  out(o.json, r, 'Everyone in the workspace can now see it.');
}
```

In `packages/cli/src/index.ts`: `import { collect, scope, search } from './library.ts';` and add before `default:`:

```ts
    case "search":
      return search(pos.join(' '), { kind: flag(rest, "--kind"), outcome: flag(rest, "--outcome"), board: flag(rest, "--board"), agent: flag(rest, "--agent"), station: flag(rest, "--station"), since: flag(rest, "--since"), until: flag(rest, "--until"), limit: flag(rest, "--limit"), json });

    case "collect": {
      const [sub, ...args] = pos;
      if (sub === "list" || sub === "create" || sub === "show" || sub === "add" || sub === "remove") return collect(sub, args, { description: flag(rest, "--description"), note: flag(rest, "--note"), json });
      fail(`unknown command: collect ${sub ?? ''}. Run suli help collect.`);
    }

    case "scope":
      return scope(pos[0], pos[1], { json });
```

In `packages/cli/src/commands.ts`:
- `export type GroupId = 'session' | 'artifacts' | 'library';`
- add to `GROUPS`: `{ id: 'library', title: 'Finding and curating', label: 'Library', description: 'suli search, collect and scope.', intro: 'Searching the library with the same filters as the app, keeping collections, and widening who can see an item. Search shows only what you can see; collections and widening are a person\'s acts and are recorded.' }`
- in `renderUsage`, change `padEnd(16)` to `padEnd(22)` (two-word commands).
- add to `COMMANDS`:

```ts
  {
    path: ['search'], group: 'library', args: [{ name: 'words', description: 'What to look for; several words are one query' }],
    flags: [
      { name: '--kind', value: '<artifact|work-record>', type: 'string', description: 'Only artifacts, or only work records' },
      { name: '--outcome', value: '<a,b>', type: 'string', description: 'Only these outcomes, comma-separated: approved, completed, in-progress, superseded, rejected, failed, abandoned' },
      { name: '--board', value: '<brd_…>', type: 'string', description: 'Only this board' },
      { name: '--agent', value: '<prn_…>', type: 'string', description: 'Only items made by this agent' },
      { name: '--station', value: '<id or name>', type: 'string', description: 'Only items linked from this station' },
      { name: '--since', value: '<YYYY-MM-DD>', type: 'date', description: 'Last activity on or after the start of this day, UTC' },
      { name: '--until', value: '<YYYY-MM-DD>', type: 'date', description: 'Last activity on or before this day, UTC' },
      { name: '--limit', value: '<n>', type: 'integer', default: '10', description: 'At most this many results (1 to 25)' },
    ],
    summary: 'Search the library', description: 'Ranked results with their outcome: approved and completed work first, rejected and failed lower but never hidden. Only items you can see are searched, and none you cannot see is ever shown, even as a snippet.',
    routes: [{ method: 'POST', path: '/api/v1/search' }], access: { person: 'member', agent: null, note: 'Agents search through MCP (`library_search`), not through suli.' },
    output: 'one line per result (id, outcome, title), its snippet and its replacement', fails: ['a flag is not one of its values'],
    examples: ['suli search deploy checklist', 'suli search launch post --outcome rejected,failed --since 2026-10-01'],
  },
  { path: ['collect', 'list'], group: 'library', args: [], flags: [], summary: 'Every collection in the workspace', description: 'Lists the collections with how many items in each you can see.', routes: [{ method: 'GET', path: '/api/v1/collections' }], access: PERSON, output: 'one line per collection', fails: [], examples: ['suli collect list'] },
  { path: ['collect', 'create'], group: 'library', args: [{ name: 'name', description: 'The collection’s name; unique in the workspace, in any case' }], flags: [{ name: '--description', value: '<text>', type: 'string', description: 'What it is for' }], summary: 'Start a collection', description: 'Creates an empty collection. An artifact in a collection is kept however old it is.', routes: [{ method: 'POST', path: '/api/v1/collections' }], access: PERSON, output: '"Created <name> (<id>)."', fails: ['the name is taken (409)'], examples: ['suli collect create "Building in public — week 41"'] },
  { path: ['collect', 'show'], group: 'library', args: [{ name: 'collection', description: 'Its id (col_…) or its name' }], flags: [], summary: 'The items in a collection', description: 'Shows the collection and the items in it you can see, newest added first.', routes: [{ method: 'GET', path: '/api/v1/collections' }, { method: 'GET', path: '/api/v1/collections/:id' }], access: PERSON, output: 'the collection and one line per item', fails: ['no collection has that id or name'], examples: ['suli collect show "week 41"'] },
  { path: ['collect', 'add'], group: 'library', args: [{ name: 'collection', description: 'Its id (col_…) or its name' }, { name: 'item', description: 'The item id (itm_…)' }], flags: [{ name: '--note', value: '<text>', type: 'string', description: 'Why it is in the collection' }], summary: 'Add an item to a collection', description: 'Any member may add an item they can see. While it is in a collection, an artifact is not deleted by the 30-day sweep.', routes: [{ method: 'GET', path: '/api/v1/collections' }, { method: 'POST', path: '/api/v1/collections/:id/items' }], access: PERSON, output: '"Added."', fails: ['the item does not exist or you cannot see it (404)'], examples: ['suli collect add "week 41" itm_0123456789abcdef --note "the launch post"'] },
  { path: ['collect', 'remove'], group: 'library', args: [{ name: 'collection', description: 'Its id (col_…) or its name' }, { name: 'item', description: 'The item id (itm_…)' }], flags: [], summary: 'Take an item out of a collection', description: 'The item stays in the library; only the collection no longer holds it.', routes: [{ method: 'GET', path: '/api/v1/collections' }, { method: 'DELETE', path: '/api/v1/collections/:id/items/:item' }], access: PERSON, output: '"Removed."', fails: [], examples: ['suli collect remove "week 41" itm_0123456789abcdef'] },
  { path: ['scope'], group: 'library', args: [{ name: 'item', description: 'The item id (itm_…)' }, { name: 'scope', description: 'workspace (the only value: an item is never narrowed)' }], flags: [], summary: 'Show an item to the whole workspace', description: 'Widens who can see an item from its board to everyone in the workspace, agents included. Recorded in the audit log. Only the uploader or an owner may; it cannot be undone.', routes: [{ method: 'POST', path: '/api/v1/items/:id/scope' }], access: { ...PERSON, person: 'uploader-or-owner' }, output: '"Everyone in the workspace can now see it."', fails: ['the scope is not workspace', 'you are not the uploader or an owner (403)'], examples: ['suli scope itm_0123456789abcdef workspace'] },
```

- [ ] **Step 4: Regenerate the reference and run the tests**

Run: `pnpm -F @superlibrary/cli reference && pnpm --filter @superlibrary/cli test && pnpm --filter @superlibrary/cli typecheck && git status --short docs/reference/cli`
Expected: PASS; `docs/reference/cli/library.md` is new and `index.md` changed.

- [ ] **Step 5: Revert-proof**

Delete the `collect remove` entry from `COMMANDS`; expect `has an entry for every verb the switch dispatches` to FAIL. Restore. Delete the `--until` flag entry; expect `documents exactly the flags each verb reads` to FAIL. Restore. Edit `docs/reference/cli/library.md` by hand; expect `is committed exactly as the generator writes it` to FAIL. Restore with `pnpm -F @superlibrary/cli reference`. Remove the `scope !== 'workspace'` check; expect `widens to the workspace only…` to FAIL. Restore.

- [ ] **Step 6: Commit, push and open P4-CLI**

```bash
git add packages/cli/src/library.ts packages/cli/src/library.test.ts packages/cli/src/commands.ts packages/cli/src/index.ts packages/cli/src/artifacts.ts docs/reference/cli
git commit -m "feat(cli): suli search, suli collect list|create|show|add|remove, suli scope

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
git push -u origin feat/p4-cli
gh pr create --title "suli: search, collect and scope" --body "$(cat <<'EOF'
Plan task 20 of docs/superpowers/plans/2026-10-10-superlibrary-phase-4.md: suli search (the app's filters), suli collect list|create|show|add|remove and suli scope <item> workspace, through the command table, the generated reference and its drift guard.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Merge on green.

---

## Task 21 (superpipeline): A Superlibrary-audience token for the signed-in person

Superpipeline work starts after P4-API is deployed and P4-EMB is merged: `git -C /Users/rakeshgangwar/SuperJackfruit/superpipeline fetch origin && git -C /Users/rakeshgangwar/SuperJackfruit/superpipeline worktree add -b feat/superlibrary-drawer /Users/rakeshgangwar/SuperJackfruit/.worktrees/superpipeline-superlibrary-drawer origin/main`.

**How the token is obtained (verified).** Accounts' product registry lets client `superpipeline-web` request the resource `https://app.superlibrary.dev` (accounts `src/products/registry.ts:51`, tested in `tests/integration/first-party-clients.test.ts`, A21). Superpipeline's Worker already holds the person's rotating refresh token in an HttpOnly cookie and mints a second, hub-audience token with a refresh-token grant made right after the app's, with the newest refresh token, never concurrently (`apps/api/src/auth/plane-signin.ts`, A20). The Superlibrary token is a third grant on the same path, made only when the page asks (`/hub/token?library=1`), so sign-in and every other `/hub/token` caller are unchanged.

**Files:**
- Modify: `apps/api/src/auth/plane-signin.ts`, `apps/api/src/env.ts`, `apps/api/wrangler.jsonc`, `apps/web/src/lib/hub-token.ts`
- Test: `apps/api/test/plane-signin.test.ts`, `apps/web/src/lib/hub-token.test.ts`

**Interfaces:**
- Consumes: `tokenRequest`, `ttlOf`, `readCookie`, `handlePlaneSignInRoute` (A20).
- Produces:
  - `GET /hub/token?library=1` → `{ token, hubToken, libraryToken, hubConfigured, signIn }`; `libraryToken` is a token with `aud = https://app.superlibrary.dev` or `null`. Without `library=1` the answer is exactly as before.
  - cookie `superpipeline_plane_library_token` (`Path=/hub; HttpOnly; Secure; SameSite=Strict`), cleared by `/auth/logout`
  - env var `SUPERLIBRARY_AUDIENCE` (`https://app.superlibrary.dev` in `wrangler.jsonc`); unset means "no library"
  - web: `libraryToken(): Promise<string | null>` (cached until a minute before expiry; one request at a time), cleared by `forgetHubToken()`

- [ ] **Step 1: Write the failing tests**

Add to `apps/api/test/plane-signin.test.ts`:

```ts
describe('plane sign-in — a third, Superlibrary-audience token for the card drawer, on request', () => {
  const LIB = 'https://app.superlibrary.dev';
  const HUB_RES = 'https://hub.agentpod.test';
  function byResource3(opts: { libraryRefuses?: boolean } = {}) {
    const tokenRequests: URLSearchParams[] = [];
    let n = 0;
    const tokens = { app: '', hub: '', lib: '' };
    const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === PLANE_JWKS) return new Response((await planeKeys()).jwksBody, { headers: { 'content-type': 'application/json' } });
      if (url === `${PLANE}/api/auth/oauth2/token`) {
        const form = new URLSearchParams(String(init?.body));
        tokenRequests.push(form);
        const resource = form.get('resource');
        if (resource === LIB && opts.libraryRefuses) return Response.json({ error: 'invalid_target' }, { status: 400 });
        n += 1;
        const access = resource === LIB ? tokens.lib : resource === HUB_RES ? tokens.hub : tokens.app;
        return Response.json({ access_token: access, refresh_token: `r${n + 1}`, expires_in: 300 });
      }
      return new Response('unexpected', { status: 599 });
    }) as unknown as typeof fetch;
    return { impl, tokenRequests, tokens };
  }
  const env3 = () => envOn({ HUB_ISSUER: HUB_RES, SUPERLIBRARY_AUDIENCE: LIB });

  it('/hub/token?library=1 renews app, hub, then library, each with the newest refresh token', async () => {
    const fake = byResource3();
    fake.tokens.app = await planeToken();
    fake.tokens.hub = await planeToken({}, { aud: HUB_RES });
    fake.tokens.lib = await planeToken({}, { aud: LIB });
    const req = new Request('https://api.test/hub/token?library=1', { headers: { Cookie: 'superpipeline_plane_refresh=r1' } });
    const res = (await handlePlaneSignInRoute(req, env3(), '/hub/token', fake.impl))!;
    expect(await res.json()).toEqual({ token: fake.tokens.app, hubToken: fake.tokens.hub, libraryToken: fake.tokens.lib, hubConfigured: true, signIn: 'org-plane' });
    expect(fake.tokenRequests.map((f) => [f.get('resource'), f.get('refresh_token')])).toEqual([[APP_AUD, 'r1'], [HUB_RES, 'r2'], [LIB, 'r3']]);
    const c = cookies(res);
    expect(c.get('superpipeline_plane_library_token')).toBe(fake.tokens.lib);
    expect(c.get('superpipeline_plane_refresh')).toBe('r4');
  });
  it('without ?library=1 it never asks for the library and answers as before', async () => {
    const fake = byResource3();
    fake.tokens.app = await planeToken();
    fake.tokens.hub = await planeToken({}, { aud: HUB_RES });
    const req = new Request('https://api.test/hub/token', { headers: { Cookie: 'superpipeline_plane_refresh=r1' } });
    const res = (await handlePlaneSignInRoute(req, env3(), '/hub/token', fake.impl))!;
    expect(await res.json()).toEqual({ token: fake.tokens.app, hubToken: fake.tokens.hub, hubConfigured: true, signIn: 'org-plane' });
    expect(fake.tokenRequests.map((f) => f.get('resource'))).toEqual([APP_AUD, HUB_RES]);
  });
  it('serves a live library cookie without calling the plane', async () => {
    const fake = byResource3();
    const req = new Request('https://api.test/hub/token?library=1', {
      headers: { Cookie: 'superpipeline_hub_token=app1; superpipeline_plane_hub_token=hub1; superpipeline_plane_library_token=lib1; superpipeline_plane_refresh=r1' },
    });
    const res = (await handlePlaneSignInRoute(req, env3(), '/hub/token', fake.impl))!;
    expect(await res.json()).toEqual({ token: 'app1', hubToken: 'hub1', libraryToken: 'lib1', hubConfigured: true, signIn: 'org-plane' });
    expect(fake.tokenRequests).toHaveLength(0);
  });
  it('a plane that will not mint the library token leaves the others and the refresh token intact', async () => {
    const fake = byResource3({ libraryRefuses: true });
    const req = new Request('https://api.test/hub/token?library=1', { headers: { Cookie: 'superpipeline_hub_token=app1; superpipeline_plane_hub_token=hub1; superpipeline_plane_refresh=r1' } });
    const res = (await handlePlaneSignInRoute(req, env3(), '/hub/token', fake.impl))!;
    expect(await res.json()).toEqual({ token: 'app1', hubToken: 'hub1', libraryToken: null, hubConfigured: true, signIn: 'org-plane' });
    expect(cookies(res).get('superpipeline_plane_refresh')).toBe('r1');
  });
  it('makes no library request when no Superlibrary is configured', async () => {
    const fake = byResource3();
    const req = new Request('https://api.test/hub/token?library=1', { headers: { Cookie: 'superpipeline_hub_token=app1; superpipeline_plane_refresh=r1' } });
    const res = (await handlePlaneSignInRoute(req, envOn({ SUPERLIBRARY_AUDIENCE: '' }), '/hub/token', fake.impl))!;
    expect((await res.json() as { libraryToken?: unknown }).libraryToken).toBeNull();
    expect(fake.tokenRequests).toHaveLength(0);
  });
  it('logout clears the library cookie too', async () => {
    const res = (await handlePlaneSignInRoute(new Request('https://api.test/auth/logout'), envOn(), '/auth/logout'))!;
    expect(cookies(res).get('superpipeline_plane_library_token')).toBe('');
  });
});
```

Add to `apps/web/src/lib/hub-token.test.ts`:

```ts
import { libraryToken } from './hub-token';

describe('libraryToken (spec §9 Embedding)', () => {
  const jwt = (expSec: number) => `h.${btoa(JSON.stringify({ exp: expSec })).replace(/=+$/, '')}.s`;
  it('asks the Worker with ?library=1, caches until a minute before expiry, and is null when none is minted', async () => {
    forgetHubToken();
    const seen: string[] = [];
    const exp = Math.floor(Date.now() / 1000) + 300;
    vi.stubGlobal('fetch', vi.fn(async (u: string) => { seen.push(u); return Response.json({ token: 'a', hubToken: null, libraryToken: jwt(exp), signIn: 'org-plane' }); }));
    expect(await libraryToken()).toBe(jwt(exp));
    expect(await libraryToken()).toBe(jwt(exp));
    expect(seen).toEqual(['/hub/token?library=1']);
    forgetHubToken();
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ token: 'a', hubToken: null, libraryToken: null, signIn: 'org-plane' })));
    expect(await libraryToken()).toBeNull();
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @superpipeline/api test -- test/plane-signin.test.ts; pnpm --filter @superpipeline/web test -- src/lib/hub-token.test.ts`
Expected: FAIL (no `libraryToken` in the answer; `libraryToken` not exported).

- [ ] **Step 3: Write the third grant and the client**

In `apps/api/src/env.ts`, beside `HUB_ISSUER`:

```ts
  /** Superlibrary's audience (spec §9 Embedding). Set: the card drawer may ask for a token for it. Unset: no library. */
  SUPERLIBRARY_AUDIENCE?: string;
```

In `apps/api/wrangler.jsonc` `vars`, after `HUB_ISSUER`:

```jsonc
    // Superlibrary, embedded in the card drawer. Not a credential; it names an audience to ask for.
    "SUPERLIBRARY_AUDIENCE": "https://app.superlibrary.dev",
```

In `apps/api/src/auth/plane-signin.ts`:

```ts
/** The Superlibrary-audience access token, for the card drawer's viewer and related work. Never sent to this Worker's API. */
const LIBRARY_AUD_COOKIE = 'superpipeline_plane_library_token';
const libraryAudCookie = (v: string, maxAge: number) => `${LIBRARY_AUD_COOKIE}=${v}; Path=/hub; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;

/** Superlibrary's audience, if this deployment embeds it. Accounts lets superpipeline-web request it (registry). */
function libraryResource(env: Env): string | null {
  const raw = (env.SUPERLIBRARY_AUDIENCE ?? '').trim().replace(/\/+$/, '');
  return raw === '' ? null : raw;
}
```

In the `/auth/logout` branch add `headers.append('Set-Cookie', libraryAudCookie('', 0));`.

In the `/hub/token` branch, replace its first lines through `if ((app && !needHub) || !refresh) return answer(app, hubTok);` with:

```ts
    // The library token only when the page asks (the card drawer), so every other caller is unchanged.
    const wantLibrary = new URL(request.url).searchParams.get('library') === '1';
    const libResource = wantLibrary ? libraryResource(env) : null;
    let libTok: string | null = wantLibrary ? readCookie(request, LIBRARY_AUD_COOKIE) : null;
    const answer = (token: string | null, hubToken: string | null, headers?: Headers) =>
      Response.json({ token, hubToken, ...(wantLibrary ? { libraryToken: libTok } : {}), hubConfigured: true, signIn: 'org-plane' }, headers ? { headers } : undefined);
    let app = readCookie(request, TOKEN_COOKIE);
    let hubTok = readCookie(request, HUB_AUD_COOKIE);
    let refresh = readCookie(request, REFRESH_COOKIE);
    const needHub = !hubTok && hubResource(env) !== null;
    const needLibrary = !libTok && libResource !== null;
    if ((app && !needHub && !needLibrary) || !refresh) return answer(app, hubTok);
```

and after the existing `if (needHub && refresh) { … }` block, before the refresh cookie is appended:

```ts
    // Third, after the hub's, with the newest refresh token. Best-effort, like the hub's: a plane that
    // will not mint it (a workspace without Superlibrary) leaves the drawer saying so, nothing else.
    if (needLibrary && refresh) {
      const lib = await tokenRequest(cfg, { grant_type: 'refresh_token', refresh_token: refresh }, fetchImpl, libResource!);
      if (lib) {
        libTok = lib.access_token!;
        headers.append('Set-Cookie', libraryAudCookie(libTok, ttlOf(lib)));
        if (lib.refresh_token) refresh = lib.refresh_token;
      }
    }
```

In `apps/web/src/lib/hub-token.ts`: export `expiryOf` unchanged in body (`export function expiryOf`), add beside `cachedHubAud`:

```ts
/** The Superlibrary-audience token (spec §9 Embedding), for the card drawer. Minted by our Worker on request. */
let cachedLibrary: { token: string; expiresAtMs: number } | null = null;
let libraryInFlight: Promise<string | null> | null = null;

/**
 * A token Superlibrary accepts for this person, or null: not signed in through the plane, a
 * workspace without Superlibrary, or the plane declined. Null is an ordinary answer: the drawer says so.
 */
export async function libraryToken(): Promise<string | null> {
  if (cachedLibrary && cachedLibrary.expiresAtMs - REFRESH_MARGIN_MS > Date.now()) return cachedLibrary.token;
  if (libraryInFlight) return libraryInFlight;
  libraryInFlight = (async () => {
    try {
      const res = await fetch('/hub/token?library=1', { credentials: 'same-origin' });
      const body = (await res.json().catch(() => null)) as { libraryToken?: string | null } | null;
      const t = res.ok ? (body?.libraryToken ?? null) : null;
      const exp = t ? expiryOf(t) : 0;
      cachedLibrary = t && exp > 0 ? { token: t, expiresAtMs: exp } : null;
      return cachedLibrary?.token ?? null;
    } catch {
      return null;
    } finally {
      libraryInFlight = null;
    }
  })();
  return libraryInFlight;
}

/** Drop only the library token (Superlibrary answered 401). */
export function forgetLibraryToken(): void {
  cachedLibrary = null;
}
```

and in `forgetHubToken()` add `cachedLibrary = null;`.

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @superpipeline/api test -- test/plane-signin.test.ts && pnpm --filter @superpipeline/web test -- src/lib/hub-token.test.ts && pnpm -r typecheck`
Expected: PASS (the existing `/hub/token` tests still compare their exact answers).

- [ ] **Step 5: Revert-proof**

Use `refresh_token: 'r1'` (the cookie's) instead of `refresh` in the library grant; expect `…each with the newest refresh token` to FAIL. Restore. Drop `wantLibrary ?` (always ask); expect `without ?library=1 it never asks…` to FAIL. Restore.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/auth/plane-signin.ts apps/api/src/env.ts apps/api/wrangler.jsonc apps/api/test/plane-signin.test.ts apps/web/src/lib/hub-token.ts apps/web/src/lib/hub-token.test.ts
git commit -m "feat: a Superlibrary-audience token for the signed-in person, minted on request beside the hub's

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---

## Task 22 (superpipeline): Attached Superlibrary artifacts in the embedded viewer

**Files:**
- Create: `scripts/vendor-superlibrary-embed.sh`, `apps/web/src/lib/vendor/superlibrary-embed/{superlibrary-embed.js,superlibrary-embed.d.ts,VENDORED.json}` (written by the script), `apps/web/src/lib/vendor/superlibrary-embed/vendored.test.ts`, `apps/web/src/lib/superlibrary.ts`, `apps/web/src/lib/superlibrary.test.ts`, `apps/web/src/lib/components/card/LibraryArtifact.svelte`, `apps/web/src/lib/components/card/LibraryArtifact.svelte.test.ts`
- Modify: `apps/web/src/lib/components/CardDrawer.svelte`

**Interfaces:**
- Consumes: `libraryToken`, `forgetLibraryToken` (Task 21); the vendored `mountArtifact`, `MountOptions`, `Mounted`, `EmbedGrant`, `ShareInfo`, `Scope` (Task 10); Superlibrary `GET /api/v1/me`, `GET /api/v1/items/:id`, `POST …/embed`, `POST …/scope` with CORS for `https://app.superpipeline.dev` (Task 8, A22); `Reference` (`apps/web/src/lib/api.ts`), `refs` in `CardDrawer.svelte`.
- Produces: `LIBRARY_URL`, `libraryRef(url): { itemId; version? } | null`, `class LibraryError`, `libraryFetch(path, init?)`, `embedCallbacks(): Pick<MountOptions, 'getEmbedUrl' | 'getVersions' | 'getShareInfo' | 'setScope'>`, `sentenceFor(e: unknown): string`; `<LibraryArtifact itemId version? title open?>`.

- [ ] **Step 1: Vendor the bundle**

```bash
#!/usr/bin/env bash
# scripts/vendor-superlibrary-embed.sh
# Vendor @superlibrary/embed (superlibrary plan decision O3): build it in a superlibrary checkout,
# copy the module and its types here, and pin each by SHA-256 with the commit it came from.
# apps/web/src/lib/vendor/superlibrary-embed/vendored.test.ts fails if a file differs from its pin.
set -euo pipefail
src="${1:?usage: scripts/vendor-superlibrary-embed.sh <path to a superlibrary checkout at the commit to vendor>}"
dest="$(cd "$(dirname "$0")/.." && pwd)/apps/web/src/lib/vendor/superlibrary-embed"
git -C "$src" diff --quiet HEAD -- packages/embed packages/contract || { echo "the superlibrary checkout has uncommitted changes in packages/embed or packages/contract" >&2; exit 1; }
commit="$(git -C "$src" rev-parse HEAD)"
pnpm -C "$src" install --frozen-lockfile >/dev/null
pnpm -C "$src" --filter @superlibrary/embed bundle
mkdir -p "$dest"
cp "$src/packages/embed/dist/superlibrary-embed.js" "$src/packages/embed/dist/superlibrary-embed.d.ts" "$dest/"
sha() { shasum -a 256 "$1" | cut -d' ' -f1; }
cat > "$dest/VENDORED.json" <<JSON
{
  "source": "SuperJackfruitLabs/superlibrary packages/embed",
  "commit": "$commit",
  "files": {
    "superlibrary-embed.d.ts": "$(sha "$dest/superlibrary-embed.d.ts")",
    "superlibrary-embed.js": "$(sha "$dest/superlibrary-embed.js")"
  }
}
JSON
echo "vendored @superlibrary/embed at $commit"
```

Run, with a superlibrary worktree of your own at `origin/main` (after P4-EMB merged):

```bash
git -C /Users/rakeshgangwar/SuperJackfruit/superlibrary worktree add --detach /Users/rakeshgangwar/SuperJackfruit/.worktrees/superlibrary-embed-vendor origin/main
chmod +x scripts/vendor-superlibrary-embed.sh
scripts/vendor-superlibrary-embed.sh /Users/rakeshgangwar/SuperJackfruit/.worktrees/superlibrary-embed-vendor
git -C /Users/rakeshgangwar/SuperJackfruit/superlibrary worktree remove /Users/rakeshgangwar/SuperJackfruit/.worktrees/superlibrary-embed-vendor
```
Expected: `vendored @superlibrary/embed at <sha>`; three files in `apps/web/src/lib/vendor/superlibrary-embed/`.

- [ ] **Step 2: Write the failing tests**

```ts
// apps/web/src/lib/vendor/superlibrary-embed/vendored.test.ts
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const dir = import.meta.dirname;
const manifest = JSON.parse(readFileSync(join(dir, 'VENDORED.json'), 'utf8')) as { source: string; commit: string; files: Record<string, string> };

describe('the vendored @superlibrary/embed (decision O3)', () => {
  it('every file is exactly the one VENDORED.json pins, from a named commit', () => {
    expect(Object.keys(manifest.files).sort()).toEqual(['superlibrary-embed.d.ts', 'superlibrary-embed.js']);
    for (const [f, sha] of Object.entries(manifest.files)) {
      expect(createHash('sha256').update(readFileSync(join(dir, f))).digest('hex'), `${f} differs from its pin: re-run scripts/vendor-superlibrary-embed.sh`).toBe(sha);
    }
    expect(manifest.commit).toMatch(/^[0-9a-f]{40}$/);
  });
  it('imports nothing: it runs on its own', () => {
    expect(readFileSync(join(dir, 'superlibrary-embed.js'), 'utf8')).not.toMatch(/^\s*import[\s{*]/m);
  });
});
```

```ts
// apps/web/src/lib/superlibrary.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/hub-token', () => ({ libraryToken: vi.fn(async () => 'lib-token'), forgetLibraryToken: vi.fn() }));
import { forgetLibraryToken, libraryToken } from '$lib/hub-token';
import { LibraryError, embedCallbacks, libraryRef, sentenceFor } from './superlibrary';

afterEach(() => { vi.unstubAllGlobals(); vi.mocked(libraryToken).mockResolvedValue('lib-token'); });

describe('Superlibrary references (spec §11: the drawer previews linked artifacts)', () => {
  it('libraryRef reads an item link on the library, with its version', () => {
    expect(libraryRef('https://app.superlibrary.dev/a/itm_0123456789abcdef')).toEqual({ itemId: 'itm_0123456789abcdef' });
    expect(libraryRef('https://app.superlibrary.dev/a/itm_0123456789abcdef/v/3')).toEqual({ itemId: 'itm_0123456789abcdef', version: 3 });
    expect(libraryRef('http://app.superlibrary.dev/a/itm_0123456789abcdef')).toBeNull();
    expect(libraryRef('https://app.superlibrary.dev.evil.test/a/itm_0123456789abcdef')).toBeNull();
    expect(libraryRef('https://app.superlibrary.dev/upload')).toBeNull();
    expect(libraryRef('not a url')).toBeNull();
  });
  it('calls Superlibrary with the person’s own library token, never cookies', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => { calls.push({ url, init }); return Response.json({ url: 'https://itm-x.superlibrarycontent.dev/_view?sig=s', version: 2 }); }));
    await embedCallbacks().getEmbedUrl({ itemId: 'itm_0123456789abcdef', version: 2 });
    expect(calls[0]!.url).toBe('https://app.superlibrary.dev/api/v1/items/itm_0123456789abcdef/embed');
    expect(new Headers(calls[0]!.init.headers).get('Authorization')).toBe('Bearer lib-token');
    expect(calls[0]!.init.credentials).toBe('omit');
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ version: 2 });
  });
  it('a 401 drops the library token; no token is a refusal in words', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'unauthenticated' }, { status: 401 })));
    await expect(embedCallbacks().getEmbedUrl({ itemId: 'itm_0123456789abcdef' })).rejects.toBeInstanceOf(LibraryError);
    expect(forgetLibraryToken).toHaveBeenCalled();
    vi.mocked(libraryToken).mockResolvedValue(null);
    await expect(embedCallbacks().getEmbedUrl({ itemId: 'itm_0123456789abcdef' })).rejects.toMatchObject({ code: 'no_token' });
    expect(sentenceFor(new LibraryError(0, 'no_token'))).toBe('Previews need you signed in through your workspace account.');
    expect(sentenceFor(new LibraryError(403, 'product_not_enabled'))).toBe('Superlibrary is not enabled for this workspace.');
    expect(sentenceFor(new LibraryError(404, 'not_found'))).toBe('This artifact is not there, or you cannot see it.');
  });
});
```

```ts
// apps/web/src/lib/components/card/LibraryArtifact.svelte.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';

const mount = vi.fn();
vi.mock('$lib/vendor/superlibrary-embed/superlibrary-embed.js', () => ({ mountArtifact: (...a: unknown[]) => mount(...a) }));
vi.mock('$lib/hub-token', () => ({ libraryToken: vi.fn(async () => 'lib-token'), forgetLibraryToken: vi.fn() }));
import LibraryArtifact from './LibraryArtifact.svelte';
import { LibraryError } from '$lib/superlibrary';

afterEach(() => { cleanup(); mount.mockReset(); });

describe('LibraryArtifact (spec §9 Embedding, §11)', () => {
  it('LibraryArtifact mounts the embed with the person’s library token', async () => {
    const destroy = vi.fn();
    mount.mockResolvedValue({ destroy, setTheme: vi.fn(), setVersion: vi.fn(), iframe: document.createElement('iframe') });
    render(LibraryArtifact, { itemId: 'itm_0123456789abcdef', version: 3, title: 'Launch <b>post</b>', open: true });
    await waitFor(() => expect(mount).toHaveBeenCalledTimes(1));
    const [, opts] = mount.mock.calls[0]!;
    expect(opts).toMatchObject({ itemId: 'itm_0123456789abcdef', version: 3, appUrl: 'https://app.superlibrary.dev' });
    expect(typeof opts.getEmbedUrl).toBe('function');
    expect(screen.getByRole('link', { name: 'Launch <b>post</b>' }).getAttribute('href')).toBe('https://app.superlibrary.dev/a/itm_0123456789abcdef/v/3');
    expect(document.querySelector('b')).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Hide preview' }));
    expect(destroy).toHaveBeenCalled();
  });
  it('mounts nothing until asked, and a refusal is a sentence', async () => {
    mount.mockRejectedValue(new LibraryError(403, 'product_not_enabled'));
    render(LibraryArtifact, { itemId: 'itm_0123456789abcdef', title: 'Plan' });
    expect(mount).not.toHaveBeenCalled();
    await fireEvent.click(screen.getByRole('button', { name: 'Show preview' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Superlibrary is not enabled for this workspace.');
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `pnpm --filter @superpipeline/web test -- src/lib/vendor src/lib/superlibrary.test.ts src/lib/components/card/LibraryArtifact.svelte.test.ts`
Expected: `vendored.test.ts` PASS (Step 1 wrote the files); the other two FAIL (`./superlibrary` and `LibraryArtifact.svelte` missing).

- [ ] **Step 4: Write the client and the component, and put it in the drawer**

```ts
// apps/web/src/lib/superlibrary.ts
/**
 * Superlibrary from the card drawer (superlibrary spec §9 Embedding, §11). Every call carries the
 * signed-in person's own Superlibrary-audience token (hub-token.ts `libraryToken`), so Superlibrary
 * decides what this person may see. No cookies cross: `credentials: 'omit'`.
 */
import { forgetLibraryToken, libraryToken } from '$lib/hub-token';
import type { EmbedGrant, MountOptions, Scope, ShareInfo } from '$lib/vendor/superlibrary-embed/superlibrary-embed.js';

export const LIBRARY_URL = ((import.meta.env.PUBLIC_SUPERLIBRARY_URL as string | undefined) ?? 'https://app.superlibrary.dev').replace(/\/+$/, '');
const ITEM_PATH = /^\/a\/(itm_[0-9a-f]{16})(?:\/v\/([1-9][0-9]*))?\/?$/;

/** The item (and version) a reference names, when it is a link to this deployment's Superlibrary. */
export function libraryRef(url: string): { itemId: string; version?: number } | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.origin !== LIBRARY_URL) return null;
  const m = ITEM_PATH.exec(u.pathname);
  if (!m) return null;
  return m[2] ? { itemId: m[1]!, version: Number(m[2]) } : { itemId: m[1]! };
}

export class LibraryError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}

export async function libraryFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await libraryToken();
  if (!token) throw new LibraryError(0, 'no_token');
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body !== undefined) headers.set('content-type', 'application/json');
  const res = await fetch(`${LIBRARY_URL}${path}`, { ...init, headers, credentials: 'omit' });
  if (res.status === 401) forgetLibraryToken();
  return res;
}

async function jsonOf<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const b = (await res.json().catch(() => ({}))) as { error?: string };
    throw new LibraryError(res.status, b.error ?? `http_${res.status}`);
  }
  return (await res.json()) as T;
}

interface ItemRead { item: { scope: Scope; title: string; createdBy: string; audience?: string }; versions: Array<{ version: number; revokedAt: string | null }> }

/** The host's callbacks for `mountArtifact` (superlibrary packages/embed README, "The host's duties"). */
export function embedCallbacks(): Pick<MountOptions, 'getEmbedUrl' | 'getVersions' | 'getShareInfo' | 'setScope'> {
  return {
    getEmbedUrl: async ({ itemId, version }) =>
      jsonOf<EmbedGrant>(await libraryFetch(`/api/v1/items/${itemId}/embed`, { method: 'POST', body: JSON.stringify(version ? { version } : {}) })),
    getVersions: async ({ itemId }) =>
      (await jsonOf<ItemRead>(await libraryFetch(`/api/v1/items/${itemId}`))).versions.filter((v) => !v.revokedAt).map((v) => v.version),
    getShareInfo: async ({ itemId }): Promise<ShareInfo> => {
      const [{ item }, me] = await Promise.all([
        libraryFetch(`/api/v1/items/${itemId}`).then((r) => jsonOf<ItemRead>(r)),
        libraryFetch('/api/v1/me').then((r) => jsonOf<{ principalId: string; role: 'owner' | 'member' }>(r)).catch(() => null),
      ]);
      // Superlibrary decides on widening; this only offers it to whom it would allow (its plan D12).
      return { scope: item.scope, title: item.title, boardVisible: item.audience === 'board', canWiden: me !== null && (item.createdBy === me.principalId || me.role === 'owner') };
    },
    setScope: async ({ itemId, scope }) => jsonOf(await libraryFetch(`/api/v1/items/${itemId}/scope`, { method: 'POST', body: JSON.stringify({ scope }) })),
  };
}

const SENTENCES: Record<string, string> = {
  no_token: 'Previews need you signed in through your workspace account.',
  product_not_enabled: 'Superlibrary is not enabled for this workspace.',
  not_found: 'This artifact is not there, or you cannot see it.',
  revoked: 'This artifact was revoked.',
  expired: 'This artifact has expired.',
};
export function sentenceFor(e: unknown): string {
  return (e instanceof LibraryError && SENTENCES[e.code]) || 'The preview could not be loaded. Try again in a moment.';
}
```

```svelte
<!-- apps/web/src/lib/components/card/LibraryArtifact.svelte -->
<script lang="ts">
  import { untrack } from 'svelte';
  import { mountArtifact, type Mounted } from '$lib/vendor/superlibrary-embed/superlibrary-embed.js';
  import { LIBRARY_URL, embedCallbacks, sentenceFor } from '$lib/superlibrary';

  let { itemId, version, title, open: startOpen = false }: { itemId: string; version?: number; title: string; open?: boolean } = $props();
  let open = $state(untrack(() => startOpen));
  let host = $state<HTMLElement | null>(null);
  let failure = $state<string | null>(null);
  const href = $derived(`${LIBRARY_URL}/a/${itemId}${version ? `/v/${version}` : ''}`);
  const frameId = `lib-${Math.random().toString(36).slice(2, 10)}`;

  // The embed renders every kind in a sandboxed frame on Superlibrary's content origin (spec §9).
  $effect(() => {
    const el = host;
    if (!open || !el) return;
    let live = true;
    let mounted: Mounted | null = null;
    failure = null;
    mountArtifact(el, { itemId, ...(version ? { version } : {}), title, appUrl: LIBRARY_URL, height: 360, ...embedCallbacks() })
      .then((m) => { if (live) mounted = m; else m.destroy(); })
      .catch((e: unknown) => { if (live) failure = sentenceFor(e); });
    return () => { live = false; mounted?.destroy(); };
  });
</script>

<div class="border-border rounded-[7px] border p-2">
  <div class="flex flex-wrap items-center gap-2">
    <button type="button" class="border-border hover:border-marigold/50 min-h-[44px] rounded-[5px] border px-2 text-xs" aria-expanded={open} aria-controls={frameId} onclick={() => (open = !open)}>
      {open ? 'Hide preview' : 'Show preview'}
    </button>
    <a {href} target="_blank" rel="noopener noreferrer" class="min-w-0 flex-1 text-xs break-words hover:underline">{title}</a>
  </div>
  {#if open}<div id={frameId} class="mt-2" bind:this={host}></div>{/if}
  {#if failure}<p role="alert" class="text-coral mt-2 text-xs">{failure}</p>{/if}
</div>
```

In `apps/web/src/lib/components/CardDrawer.svelte`:
1. Imports: `import LibraryArtifact from '$lib/components/card/LibraryArtifact.svelte';` and `import { libraryRef } from '$lib/superlibrary';`.
2. After `const refs = $derived(…)`:
   ```ts
   /** Superlibrary links preview in the embedded viewer; the first opens itself (superlibrary decision O6). */
   const libraryRefs = $derived(refs.flatMap((r) => { const l = libraryRef(r.url); return l ? [{ ref: r, ...l }] : []; }));
   const otherRefs = $derived(refs.filter((r) => libraryRef(r.url) === null));
   ```
3. In the references section, replace `{#if refs.length > 0}` and `{#each refs as ref (ref.id)}` with `otherRefs`, and insert before that `{#if}`:
   ```svelte
   {#if libraryRefs.length > 0}
     <div class="mb-2.5 grid gap-2" aria-label="Superlibrary artifacts">
       {#each libraryRefs as l, i (l.ref.id)}
         <LibraryArtifact itemId={l.itemId} version={l.version} title={l.ref.title ?? l.itemId} open={i === 0} />
       {/each}
     </div>
   {/if}
   ```

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @superpipeline/web test && pnpm --filter @superpipeline/web typecheck`
Expected: PASS.

- [ ] **Step 6: Revert-proof**

Edit one character of `superlibrary-embed.js`; expect `every file is exactly the one VENDORED.json pins` to FAIL. Restore with `git checkout -- apps/web/src/lib/vendor`. Change `libraryRef`'s origin check to `u.hostname.endsWith('superlibrary.dev')`; expect `libraryRef reads an item link…` to FAIL. Restore. Drop `credentials: 'omit'`; expect `calls Superlibrary with the person’s own library token, never cookies` to FAIL. Restore.

- [ ] **Step 7: Commit**

```bash
git add scripts/vendor-superlibrary-embed.sh apps/web/src/lib/vendor apps/web/src/lib/superlibrary.ts apps/web/src/lib/superlibrary.test.ts apps/web/src/lib/components/card/LibraryArtifact.svelte apps/web/src/lib/components/card/LibraryArtifact.svelte.test.ts apps/web/src/lib/components/CardDrawer.svelte
git commit -m "feat(web): attached Superlibrary artifacts open in the embedded viewer in the card drawer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---

## Task 23 (superpipeline): The "Related prior work" panel

**Files:**
- Create: `apps/web/src/lib/components/card/RelatedWork.svelte`, `apps/web/src/lib/components/card/RelatedWork.svelte.test.ts`
- Modify: `apps/web/src/lib/superlibrary.ts` (`relatedForCard`), `apps/web/src/lib/components/CardDrawer.svelte`

**Interfaces:**
- Consumes: `libraryFetch`, `libraryRef`, `sentenceFor`, `LIBRARY_URL` (Task 22); Superlibrary `POST /api/v1/related { cardId, limit }` with CORS (Task 8, A5).
- Produces: `relatedForCard(cardId: string): Promise<RelatedLite[]>`, `interface RelatedLite { itemId; title; kind; outcome; snippet; url }`; `<RelatedWork cardId>`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/components/card/RelatedWork.svelte.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';

const related = vi.fn();
vi.mock('$lib/superlibrary', async (orig) => ({ ...(await orig<typeof import('$lib/superlibrary')>()), relatedForCard: (id: string) => related(id) }));
vi.mock('$lib/hub-token', () => ({ libraryToken: vi.fn(async () => 'lib-token'), forgetLibraryToken: vi.fn() }));
import RelatedWork from './RelatedWork.svelte';
import { LibraryError } from '$lib/superlibrary';

afterEach(() => { cleanup(); related.mockReset(); });
const CARD = 'card_00000000000000c1';

describe('Related prior work (superlibrary spec §11)', () => {
  it('RelatedWork lists the card’s related items with their outcomes, and a snippet with markup is shown as text', async () => {
    related.mockResolvedValue([{ itemId: 'itm_0123456789abcdef', title: 'Last spring’s launch', kind: 'work-record', outcome: 'rejected', snippet: 'Too costly <img src=x onerror=alert(1)>', url: 'https://app.superlibrary.dev/a/itm_0123456789abcdef' }]);
    render(RelatedWork, { cardId: CARD });
    const link = await screen.findByRole('link', { name: 'Last spring’s launch' });
    expect(related).toHaveBeenCalledWith(CARD);
    expect(link.getAttribute('href')).toBe('https://app.superlibrary.dev/a/itm_0123456789abcdef');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(screen.getByText('Rejected')).toBeTruthy();
    expect(document.querySelector('img')).toBeNull();
    expect(document.body.textContent).toContain('Too costly <img src=x onerror=alert(1)>');
  });
  it('says when there is nothing, and when Superlibrary is not available, with a retry', async () => {
    related.mockResolvedValueOnce([]);
    render(RelatedWork, { cardId: CARD });
    expect(await screen.findByText('Nothing related in Superlibrary yet.')).toBeTruthy();
    cleanup();
    related.mockRejectedValueOnce(new LibraryError(0, 'no_token')).mockResolvedValueOnce([]);
    render(RelatedWork, { cardId: CARD });
    expect(await screen.findByText(/Previews need you signed in/)).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Nothing related in Superlibrary yet.')).toBeTruthy();
  });
  it('a result whose link is not on the library is shown without a link', async () => {
    related.mockResolvedValue([{ itemId: 'itm_0123456789abcdef', title: 'Odd', kind: 'artifact', outcome: 'completed', snippet: '', url: 'https://evil.test/a/itm_0123456789abcdef' }]);
    render(RelatedWork, { cardId: CARD });
    expect(await screen.findByText('Odd')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Odd' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @superpipeline/web test -- src/lib/components/card/RelatedWork.svelte.test.ts`
Expected: FAIL (`RelatedWork.svelte` missing).

- [ ] **Step 3: Write the call, the panel, and put it in the drawer**

Append to `apps/web/src/lib/superlibrary.ts`:

```ts
export interface RelatedLite { itemId: string; title: string; kind: 'artifact' | 'work-record'; outcome: string; snippet: string; url: string }

/** Items related to this card, as Superlibrary sees them for this person (its visibility rule, spec §4). */
export async function relatedForCard(cardId: string): Promise<RelatedLite[]> {
  const body = await jsonOf<{ items: RelatedLite[] }>(await libraryFetch('/api/v1/related', { method: 'POST', body: JSON.stringify({ cardId, limit: 5 }) }));
  return body.items;
}

const OUTCOME_WORDS: Record<string, string> = {
  approved: 'Approved', completed: 'Completed', 'in-progress': 'In progress', superseded: 'Superseded', rejected: 'Rejected', failed: 'Failed', abandoned: 'Abandoned',
};
export const outcomeWord = (o: string) => OUTCOME_WORDS[o] ?? o;
```

```svelte
<!-- apps/web/src/lib/components/card/RelatedWork.svelte -->
<script lang="ts">
  import { libraryRef, outcomeWord, relatedForCard, sentenceFor, type RelatedLite } from '$lib/superlibrary';

  let { cardId }: { cardId: string } = $props();
  let items = $state<RelatedLite[]>([]);
  let phase = $state<'loading' | 'ok' | 'unavailable'>('loading');
  let why = $state('');
  let attempt = $state(0);

  $effect(() => {
    const id = cardId;
    void attempt;
    let live = true;
    phase = 'loading';
    relatedForCard(id)
      .then((r) => { if (live) { items = r; phase = 'ok'; } })
      .catch((e: unknown) => { if (live) { why = sentenceFor(e); phase = 'unavailable'; } });
    return () => { live = false; };
  });
</script>

<!-- Text from other people's and agents' work: rendered as text, never as markup. -->
<section class="sec" aria-labelledby="related-work-h">
  <div id="related-work-h" class="sec-h eyebrow">related prior work</div>
  {#if phase === 'loading'}
    <p class="text-muted-foreground text-xs" role="status">Looking in Superlibrary…</p>
  {:else if phase === 'unavailable'}
    <p class="text-muted-foreground text-xs">Related prior work is not available. {why}</p>
    <button type="button" class="border-border min-h-[44px] rounded-[5px] border px-2 text-xs" onclick={() => attempt++}>Try again</button>
  {:else if items.length === 0}
    <p class="text-muted-foreground text-xs">Nothing related in Superlibrary yet.</p>
  {:else}
    <ul class="grid gap-2">
      {#each items as r (r.itemId)}
        <li class="border-border rounded-[6px] border px-2 py-1.5">
          <div class="flex flex-wrap items-baseline gap-2">
            <span class="mono text-[10px] uppercase tracking-wide">{outcomeWord(r.outcome)}</span>
            {#if libraryRef(r.url)}
              <a href={r.url} target="_blank" rel="noopener noreferrer" class="min-w-0 flex-1 text-xs font-medium break-words hover:underline">{r.title}</a>
            {:else}
              <span class="min-w-0 flex-1 text-xs font-medium break-words">{r.title}</span>
            {/if}
          </div>
          {#if r.snippet}<p class="text-muted-foreground mt-1 line-clamp-3 text-xs break-words">{r.snippet}</p>{/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>
```

In `apps/web/src/lib/components/CardDrawer.svelte`: `import RelatedWork from '$lib/components/card/RelatedWork.svelte';` and, immediately before the `<!-- references -->` section, add `{#if cardId}<RelatedWork {cardId} />{/if}`.

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @superpipeline/web test && pnpm --filter @superpipeline/web typecheck && pnpm -r test`
Expected: PASS.

- [ ] **Step 5: Revert-proof**

Render the title link without the `libraryRef(r.url)` check; expect `a result whose link is not on the library…` to FAIL. Restore. Render `{@html r.snippet}`; expect `…a snippet with markup is shown as text` to FAIL. Restore.

- [ ] **Step 6: Commit, push and open P4-SP (stop at green CI)**

```bash
git add apps/web/src/lib/superlibrary.ts apps/web/src/lib/components/card/RelatedWork.svelte apps/web/src/lib/components/card/RelatedWork.svelte.test.ts apps/web/src/lib/components/CardDrawer.svelte
git commit -m "feat(web): related prior work from Superlibrary in the card drawer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
git push -u origin feat/superlibrary-drawer
gh pr create --repo SuperJackfruitLabs/superpipeline --title "Card drawer: Superlibrary artifacts in the embedded viewer, and related prior work" --body "$(cat <<'EOF'
Superlibrary phase 4, plan tasks 21-23 (superlibrary docs/superpowers/plans/2026-10-10-superlibrary-phase-4.md):
- the Worker mints a Superlibrary-audience token for the signed-in person on request (/hub/token?library=1), as a third sequential refresh-token grant after the app and hub tokens (Accounts already lists the resource for superpipeline-web);
- attached Superlibrary references open in @superlibrary/embed (vendored, hash-pinned, scripts/vendor-superlibrary-embed.sh), first one open;
- a "Related prior work" panel calls Superlibrary's POST /api/v1/related { cardId } with the person's own token.

The operator merges; it deploys on merge.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
gh pr checks --watch --repo SuperJackfruitLabs/superpipeline
```

Stop here: report the PR URL and its green checks. **Do not merge** (operator rule).

---

## Task 24: Live checks

After P4-API, P4-APP and P4-CLI are deployed by superlibrary CI, and the operator has merged P4-SP (which deploys on merge). Checks needing a person's browser session are listed for the operator; everything else the controller runs.

**Files:**
- Modify: `.superpowers/sdd/2026-10-10-superlibrary-phase-4/progress.md` (the results)

- [ ] **Step 1: API and app are live**

```bash
curl -s https://app.superlibrary.dev/api/health
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://app.superlibrary.dev/api/v1/browse -H 'content-type: application/json' -d '{}'
curl -s -o /dev/null -w '%{http_code}\n' -X OPTIONS https://app.superlibrary.dev/api/v1/related -H 'Origin: https://app.superpipeline.dev' -H 'Access-Control-Request-Method: POST' -D - | grep -i access-control-allow-origin
```
Expected: `{"ok":true,…}`; `401` (no token: the route exists and refuses); `access-control-allow-origin: https://app.superpipeline.dev`.

- [ ] **Step 2: `suli` against production (a person's device credential)**

```bash
cd /Users/rakeshgangwar/SuperJackfruit/superlibrary/packages/cli
bun src/index.ts search launch --outcome rejected,failed --since 2026-10-01
bun src/index.ts collect list
```
Expected: ranked lines with outcomes (or `Nothing matches.`); the collections (or `No collections yet.`). If not signed in, the operator runs `bun src/index.ts login` once.

- [ ] **Step 3: OPERATOR-RUN, in a browser signed in to the workspace (phone first, then desktop)**

1. `https://app.superlibrary.dev/?q=<a word from a recent card>`: results carry outcomes; open Filters, tick **Rejected**; the address keeps it.
2. `https://app.superlibrary.dev/outcomes?outcome=rejected`: the heading reads "Everything rejected this month"; the tab counts add up.
3. Open a work record: the timeline lists attempts, comments and gates; **Open the card in Superpipeline** opens the card.
4. Create a collection, add an artifact from its page, see it in the collection.
5. On an artifact you uploaded: **Mark as superseded** by another item, then **Undo superseded**. Nothing used a browser dialog.
6. On the phone: the header shows the book-spine mark and "Superlibrary", the four nav items, Products and Account; Account holds the theme and Sign out; an artifact's title and meta line take two lines at most before the viewer; the viewer's toolbar shows words, with the rest under **More**. The footer reads "Super Jackfruit Labs" with the hexagon mark (provisional).
7. In Superpipeline, open a card with a `https://app.superlibrary.dev/a/itm_…` reference: the first one previews in the viewer; **Related prior work** lists items with outcomes (or says nothing is related yet).

- [ ] **Step 4: Record and close**

Write each check's result into the phase-4 ledger, then remove the phase-4 worktrees whose PRs merged: `git -C /Users/rakeshgangwar/SuperJackfruit/superlibrary worktree remove /Users/rakeshgangwar/SuperJackfruit/.worktrees/superlibrary-p4-api` (and `-p4-embed`, `-p4-app`, `-p4-cli`; superpipeline's after the operator merges).

---

## Self-review

**1. Spec coverage.**
- §3 Collection → Tasks 1, 2, 5, 17, 20. Outcome on every result → Tasks 12 (badge), 14, 15, 18, 23.
- §4 visibility before ranking, invisible = 404, never a snippet → Tasks 3 (browse, facets, both search paths), 4 (record artifacts), 5 (counts and entries), 6 (the replacement must be visible), 23 (Superlibrary decides). Widening to workspace, a person's act, audited → phase-1 route surfaced in Tasks 16 (records), 20 (`suli scope`), 22 (drawer Share with `canWiden`); kept across re-sync in Task 7.
- §9 Embedding: one renderer and its toolbar (version, Share, full screen, theme, files, view source, download, open in new window) → the app and the drawer mount `@superlibrary/embed` (Tasks 13, 15, 22); every control usable on phones (Task 9); host duties (person's own token, allowed origin) → Tasks 8, 21, 22.
- §11 search with filters → 1, 3, 14, 20; item page with provenance, versions, related → 15 (versions from phase 1); work-record timelines → 4, 15; collections → 5, 17; views by outcome → 3, 18; moderation → 6, 7, 16; in-page confirmations → 12, 16, 17, 19; 44 px and no sideways scroll → 12, 13, 19; `suli` → 20; Superpipeline previews and "Related prior work" → 21–23.
- §12 collection membership keeps an artifact; deletion removes everything → 5, 7.
- §14 phase 4, §15 revert-proof guards (each task's revert step), §16 decisions (no public links; agents never moderate; signed embedding).
- Operator direction (working, 2026-10-09): one token source in the suite's shape with a product `--accent-*` layer and the provisional "Ink" parent → 11; a reusable kit → 12; the suite shell with switcher and footer → 13; phone review fixes → 9, 13, 15; nothing hard-coded outside the token source and the two Mark components → guard in 12; no rollout to other products (none planned).

**2. Placeholder scan.** No "TBD", "add validation" or "similar to Task N". Task 0's table is filled by the executor by design (it records facts that do not exist until Stage 3 ships); every check has its command.

**3. Type consistency.** `BrowseQuery`/`BrowsePage`/`OutcomeCounts`/`Facets`/`Collection*`/`WorkRecordView` (Task 1) are used with the same names in Tasks 3–5, 14, 17, 18, 20. `extraFilterSql(alias, n)` binds `?9` in search and `?8` in browse. `moderatable`/`respond` (Task 6) are reused in Task 7. Kit names (`Button`, `Field`, `Tabs`, `Toolbar`/`ToolbarItem`, `Toast`, `EmptyState`, `OutcomeBadge`, `ConfirmDialog`, `outcomeVar`) come from Task 12 and are imported from `$kit/…` in Tasks 13–18; `themeState`/`applyTheme`/`readTheme` (Task 13, `theme.svelte.ts`) are what `ItemView` uses; `PARENT`/`PRODUCTS` (Task 11, generated) feed the switcher and footer (Task 13). `change(api, path, method, body?)` gains `DELETE` in Task 17, its first `DELETE` caller. `libraryToken`/`forgetLibraryToken` (Task 21) match Task 22. The embed host hooks `--sl-host-*` (Task 9) are the names `kit.css` sets (Task 12), from the `-light`/`-dark` fixed tokens Task 11 generates.

**4. Review Focus.** Each line has its test in its owning task: loops (6), removed record re-synced (7), widened record re-synced (7), markup in agent text (12, 14, 15, 23), local-midnight periods (14). Also covered though not in the five: a forged browse cursor (3), a hidden item's count in a collection (5), a drawer for a workspace without Superlibrary (22), a related result linking off the library (23), a colour that misses its contrast (11), a hard-coded colour or face (12), an icon-only toolbar control on a phone (9, 19).

---

## Execution handoff

Recommended: **subagent-driven** (superpowers:subagent-driven-development). 25 tasks across two repositories, with dense cross-task interfaces (one contract, one route group grown over five tasks, four phases-2–3 files edited, a token layer and kit every page task builds on) and guards whose value depends on an independent reviewer reverting them; a shipped visibility or re-sync mistake would show people or agents what they must not see, or silently undo a person's moderation. Run Task 0 first, then P4-API and P4-EMB in parallel worktrees, then P4-APP (after PR #16) and P4-CLI in parallel, then P4-SP (stopping at green CI for the operator), then Task 24.
