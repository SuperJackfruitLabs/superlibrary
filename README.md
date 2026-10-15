# superlibrary

[![CI](https://github.com/SuperJackfruitLabs/superlibrary/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/SuperJackfruitLabs/superlibrary/actions/workflows/ci.yml)

**The memory of the stack.** Superlibrary keeps what agents make and what work has been done — artifacts and Superpipeline work history, labelled with how each turned out — and lets agents consult it before they work and people browse it.

Status: phases 1 (Core), 2 (Sources), 3 (Retrieval) and 4 (the library app) live: upload, view and embed artifacts; Superpipeline work history and AgentPod links arrive as items; agents reach it over MCP once their sessions are given the Superlibrary server, and people through the web app (search and browse with filters, item pages with provenance, versions and related work, collections, views by outcome, moderation) and the API. The web app comes in the four suite vibes (Daylight, Paper, Studio, Quiet) on vibekit 0.0.12. Plans: docs/superpowers/plans/.

Design: [docs/superpowers/specs/2026-10-09-superlibrary-design.md](docs/superpowers/specs/2026-10-09-superlibrary-design.md).

Part of [Super Jackfruit Labs](https://superjackfruit.com). Signs in through
[accounts.superjackfruit.com](https://accounts.superjackfruit.com).

## Install

`suli` (also installed as `superlibrary`) is the command-line client. It installs as one binary,
with no sudo, into `~/.local/bin`:

```bash
curl -fsSL https://github.com/SuperJackfruitLabs/superlibrary/releases/latest/download/install.sh | bash
```

- `VERSION=v0.0.1 bash` pins a release tag; the default is the latest release.
- `BIN_DIR=/some/dir` installs somewhere other than `~/.local/bin`.
- The installer refuses to install a download whose SHA-256 it cannot verify against the release's `SHA256SUMS`.

Then `suli login`: one sign-in, and you approve the code in any browser, so it works over SSH.
It also works in a Claude Code cloud session: run the installer, then `suli login`.

(Releases are built by `.github/workflows/release.yml` when a `v*` tag is pushed.)

## Run it locally

```bash
pnpm install
node scripts/dev-keys.mjs
pnpm --filter @superlibrary/api dev        # API on :8787
pnpm --filter @superlibrary/content dev    # content Worker on :8788
pnpm --filter @superlibrary/web dev        # web app on :5173
```

Open `http://localhost:5173` (dev auth, no sign-in).

### Tests

```bash
pnpm typecheck && pnpm test                # every package; run once more with TZ=UTC
pnpm --filter @superlibrary/web e2e        # the whole e2e suite, Chromium and WebKit
CI=true pnpm --filter @superlibrary/web e2e --project=chromium   # as CI runs it, fresh servers
```

The e2e suite boots the API (:8787), the content Worker (:8788), a loopback proxy (:8799, for
WebKit) and the web dev server (:5173) itself, persisting to `.wrangler-e2e/`. Delete that folder
for a clean store. `e2e/seed.ts` seeds a realistic library once per store (206 items, one with 41
versions, awkward titles: 199 characters, a 120-character word, `{{y}}`, `<script>`, Arabic, a
140-character nested file name; 205 collections); `loading`, `fit` and `motion` specs use it.

## Loading, failure and motion

Every screen has three states, never mixed (`apps/web/src/lib/loading.ts`):

- **Loading** draws the shape of what is coming (`sections/Skeleton.svelte`) with no numbers and no
  "nothing" words, in `aria-busy`, after 150 ms (a fast answer flashes nothing) and for at least
  300 ms. Daylight: soft rounded bars with a gentle shimmer; Paper: hairline-ruled blank lines;
  Studio: grey blocks and "— LOADING"; Quiet: the word "Loading…" alone. The skeleton holds the
  content's space, so nothing jumps when the data lands. Counts show a dash until known, never 0.
  The screen has one polite status line (in the layout) for what is loading.
- **Slow**: at 8 s the screen adds "Still loading — the server is slow."
- **Failed**: every read is aborted at 20 s. A 404 or 403 reads "This doesn't exist or isn't
  shared with you"; a 5xx, a network failure or a timeout "Couldn't load — try again" with Try
  again. Never a raw code. **Empty** is said only after a read that worked came back with nothing.

The boot screen says "Connecting…", the slow line at 8 s and fails with Try again at 20 s. Sign-in
and its callback render without waiting for it. An unknown address is a 404 page in the shell.

Motion comes from vibekit 0.0.12 (`motion.css`, `@superjackfruit/vibekit/motion`): route content
fades and rises, lists rise, menus and dialogs pop, details and Paper enclosures open with a rise,
outcome counts count up (Daylight, Studio; a fade in Paper; none in Quiet), busy buttons carry a
bar. The pack's logo animation plays once on the first boot screen. Reduced motion (the system
setting or `data-motion="reduce"`) is static everywhere; Playwright runs every spec with reduced
motion (`contextOptions.reducedMotion`) except `e2e/motion.spec.ts`.

## Operating

Operators are the people listed in `OPERATORS`; the admin routes answer 403 to anyone else.

- **Reconcile**: `POST /api/v1/admin/index/reconcile` re-queues every live item that was never indexed and clears index state whose item is gone (`202 {"queued":N,"orphans":M}`). It also runs daily from the cron.
- **Backfill**: `POST /api/v1/sources/superpipeline/backfill` subscribes to every board of the workspace and queues each board for a full read, archived cards included (`202 {"boards":N}`). Live events keep records current afterwards.
- **Re-index**: `POST /api/v1/admin/index/reindex {"embedder":"<id>"}` re-embeds every chunk into the idle vector slot and swaps without downtime; `.../reindex/cancel` and `.../reindex/resume` recover a stalled one. See "Moving the embedder".
- **Retention** runs in `report` mode: it records what it would delete as `retention.would_delete` audit events and deletes nothing, until the operator switches `RETENTION_MODE` to `enforce`.

Secrets (set with `wrangler secret put`, never in the repo):

| Secret | What it is for |
| --- | --- |
| `HUB_SERVICE_PRINCIPAL` | The one service principal (the AgentPod hub) trusted to act for an agent and to say where a linked file came from. |
| `SERVICE_CREDENTIALS` | Superlibrary's own service credentials per organization, used to obtain tokens for calling Superpipeline and the hub (roster). |
| `PUSH_SIGNING_KEY` | Signs and verifies the Superpipeline push subscription, so only Superpipeline can post record events. At least 32 characters. |
| `OPERATORS` | Space-separated principal ids (`prn_...`) allowed to use the admin routes and the backfill. |

## Moving the embedder

An operator-run procedure, for example to move embedding to own hardware.

1. Add an `Embedder` for the new service to `embedderFor` (one PR).
2. If its dimensions are not 1024, re-create the idle slot's index at the new dimension (`SELECT * FROM vector_slots` shows which slot is idle):
   - `wrangler vectorize delete superlibrary-chunks-<slot>`
   - `wrangler vectorize create superlibrary-chunks-<slot> --dimensions=<n> --metric=cosine`
   - `wrangler vectorize create-metadata-index superlibrary-chunks-<slot> --property-name=<p> --type=string` for each of `scope`, `kind`, `outcome`, `embedder`
   - set that slot's row in `vector_slots` to the new `dims`, with `embedder_id` and `cursor` NULL
3. `POST /api/v1/admin/index/reindex {"embedder":"<id>"}`.
4. Watch `SELECT * FROM vector_slots` until the swap.

Notes:

- An idle slot whose `dims` is NULL is treated as 1024-d on first use, so an embedder with any other dimension is refused (`400 dimension_mismatch`) until step 2 has recorded the new dims.
- After a swap, the old slot must drain before the next re-index: one daily reconcile removes what it still holds. A re-index started earlier answers `409 slot_not_drained`.

## License

Proprietary until a license is chosen.
