# superlibrary

[![CI](https://github.com/SuperJackfruitLabs/superlibrary/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/SuperJackfruitLabs/superlibrary/actions/workflows/ci.yml)

**The memory of the stack.** Superlibrary keeps what agents make and what work has been done — artifacts and Superpipeline work history, labelled with how each turned out — and lets agents consult it before they work and people browse it.

Status: phases 2 (Sources) and 3 (Retrieval) live, on top of phase 1 (Core): upload, view and embed artifacts; Superpipeline work history and AgentPod links arrive as items; agents reach it over MCP once their sessions are given the Superlibrary server, and people through the web app and the API. Plans: docs/superpowers/plans/.

Design: [docs/superpowers/specs/2026-10-09-superlibrary-design.md](docs/superpowers/specs/2026-10-09-superlibrary-design.md).

Part of [Super Jackfruit Labs](https://superjackfruit.com). Signs in through
[accounts.superjackfruit.com](https://accounts.superjackfruit.com).

## Run it locally

```bash
pnpm install
node scripts/dev-keys.mjs
pnpm --filter @superlibrary/api dev        # API on :8787
pnpm --filter @superlibrary/content dev    # content Worker on :8788
pnpm --filter @superlibrary/web dev        # web app on :5173
```

Open `http://localhost:5173` (dev auth, no sign-in).

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
