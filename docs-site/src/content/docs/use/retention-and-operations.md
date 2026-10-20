---
title: Retention and operations
description: What the daily sweep deletes, why retention of unreferenced artifacts is report-only as shipped, the operator routes for indexing and backfill, and the secrets a deployment sets.
---

## Retention

A sweep runs every day at 03:00 UTC. It always deletes:

- items past their expiry date;
- uploads never committed (after 24 hours, or 72 at most while files keep arriving).

It also looks for **unreferenced artifacts** older than 30 days: artifacts nothing refers to, such
as a collection. What happens to them depends on `RETENTION_MODE`:

| `RETENTION_MODE` | Unreferenced artifacts older than 30 days |
|---|---|
| `report` | recorded as `retention.would_delete` audit events; nothing is deleted |
| `enforce` | deleted |

**The shipped configuration sets `report`.** As shipped, retention of unreferenced artifacts is
reported, not enforced. An operator switches the mode to `enforce` to make it delete.

Deleting an item removes its rows, its manifests, and the bytes no other version shares. A blob
shared with another version or an open upload is kept.

## Operators

Operators are the principals listed in `OPERATORS`. The admin routes answer 403 to anyone else.

| Route | What it does |
|---|---|
| `POST /api/v1/admin/index/reconcile` | Re-queues every live item never indexed, and clears index state whose item is gone. Answers `202 {"queued":N,"orphans":M}`. Also runs daily at 03:30 UTC. |
| `POST /api/v1/sources/superpipeline/backfill` | Subscribes to every board and reads each one in full, archived cards included. Answers `202 {"boards":N}`. |
| `POST /api/v1/admin/index/reindex` `{"embedder":"<id>"}` | Re-embeds every chunk into the idle vector slot, then swaps, with no downtime. |
| `POST /api/v1/admin/index/reindex/cancel`, `.../resume` | Recovers a stalled re-index. |
| `POST /api/v1/admin/search/explain` | Runs a search and returns how the relevance floor treated each candidate, for tuning. |

### Moving the embedder

Embeddings live in two vector slots, so one can be rebuilt while the other serves. To move to
another embedder:

1. Add an `Embedder` for the new service to `embedderFor` in the API.
2. If its dimensions are not 1024, re-create the idle slot's Vectorize index at the new dimension
   with its metadata indexes (`scope`, `kind`, `outcome`, `embedder`), and record the new `dims`
   in that slot's `vector_slots` row.
3. `POST /api/v1/admin/index/reindex {"embedder":"<id>"}`.
4. Watch `SELECT * FROM vector_slots` until the swap.

An embedder of another dimension is refused (`400 dimension_mismatch`) until step 2 is done.
After a swap, the old slot must drain before the next re-index; one daily reconcile clears it, and
a re-index started earlier answers `409 slot_not_drained`.

Only the Workers AI embedder exists today. An embedder on your own hardware is not built yet.

## Secrets

Set with `wrangler secret put`, never in the repository.

| Secret | What it is for |
|---|---|
| `HUB_SERVICE_PRINCIPAL` | The one service principal, the AgentPod hub, trusted to act for an agent and to say where a linked file came from. |
| `SERVICE_CREDENTIALS` | SuperLibrary's own service credentials per organization, for calling SuperPipeline and the hub. |
| `PUSH_SIGNING_KEY` | Signs and verifies SuperPipeline's push subscription. At least 32 characters. |
| `OPERATORS` | Space-separated principal ids (`prn_…`) allowed to use the admin routes and the backfill. |

## Health

`GET /api/health` answers `{"ok":true,"service":"superlibrary-api"}`.
