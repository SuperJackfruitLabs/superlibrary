---
title: HTTP API
description: Superlibrary's REST API under /api/v1. Authentication, and every route by group, with who may call it.
---

The API is served at `/api/v1` on the app's address (`https://app.superlibrary.dev/api/v1` on the
hosted service; `http://localhost:8787` in [local development](/install/#local-development)).
Requests and answers are JSON unless noted.

## Authentication

Send a bearer token from the organization's sign-in:

```
Authorization: Bearer <token>
```

Tokens are verified against the account service as issuer and key set, for the audience of the
Superlibrary app. `GET /.well-known/oauth-protected-resource` names the sign-in service; it is
how `suli login` finds it.

Routes say who may call them:

- **person**: a signed-in member of the workspace. Agent tokens are refused.
- **viewer**: a person or an agent. Agents see `workspace` items and the boards on their roster.
- **operator**: a person listed in `OPERATORS`.
- **service**: a signed service call (Superpipeline's push, the AgentPod hub).

An item the caller cannot see answers 404, never 403. Errors are `{"error": "<code>", ...}`.

## Identity

| Route | Who | |
|---|---|---|
| `GET /api/v1/whoami` | viewer | `{kind, principalId}` |
| `GET /api/v1/me` | person | `{kind, principalId, org, workspaceId, role}`; callable from embedding hosts |
| `GET /api/health` | anyone | `{"ok": true, "service": "superlibrary-api"}` |

## Uploads

An upload is declared, filled, and committed. Nothing is in the library until the commit.

| Route | Who | |
|---|---|---|
| `POST /api/v1/uploads` | person, or the hub for an agent | Declare: `title`, `scope` (default `workspace`), optional `item` for a new version, `entry`, `expiresAt`, and `files` (each `path`, `bytes`, `sha256`). Path rules and size limits are checked here. |
| `PUT /api/v1/uploads/{upl}/files?path=<path>` | the uploader | Send one file's bytes |
| `POST /api/v1/uploads/{upl}/batch` | the uploader | Send up to 50 files and 8 MB in one multipart request |
| `POST /api/v1/uploads/{upl}/override` | a person | `{"reason": "…"}` (1 to 500 characters) to override secret-scan findings; recorded |
| `POST /api/v1/uploads/{upl}/commit` | the uploader | Commit. `422 secret_found` with the findings (file, line, rule) when the scan finds something not overridden. Answers `{itemId, version, url, sha256, mediaType, bytes}`. |

See [Uploading](/use/uploading/) for the limits and the scan.

## Items

| Route | Who | |
|---|---|---|
| `GET /api/v1/items?limit=&before=` | person | Items, newest first; `limit` 1 to 100, default 50 |
| `GET /api/v1/items/{itm}` | person | The item and its versions |
| `POST /api/v1/items/{itm}/embed` | person | Mint a signed viewer URL for a version (`{"version": n}` optional), valid five minutes. Answers an `EmbedGrant`; see [Embed](/build/embed/). |
| `PATCH /api/v1/items/{itm}` | uploader or owner | `{"expiresAt": "<ISO 8601>" \| null}` |
| `POST /api/v1/items/{itm}/revoke` | uploader or owner | Revoke the item, optional `{"reason": "…"}` |
| `POST /api/v1/items/{itm}/versions/{n}/revoke` | uploader or owner | Revoke one version |
| `POST /api/v1/items/{itm}/scope` | uploader or owner | `{"scope": "workspace"}`; widening only, recorded |
| `GET /api/v1/items/{itm}/record` | person | A work record's view: the record and the artifacts it links that the caller can see |

## Search and retrieval

| Route | Who | |
|---|---|---|
| `POST /api/v1/search` | viewer | `{query, kinds?, outcomes?, board?, agent?, station?, since?, until?, limit?}`; `limit` 1 to 25, default 10. Answers `{results}`. |
| `GET /api/v1/library/{itm}?version=` | viewer | An item's full text: `{item, text, wrapped}` |
| `POST /api/v1/related` | viewer | `{cardId, text?}` or `{itemId}`, with optional `limit` (1 to 10) and `maxTokens` (100 to 4,000). Answers `{items}`. |

Search and related answers carry a `Server-Timing` header.

## The library app

These are the app's routes. People only.

| Route | |
|---|---|
| `POST /api/v1/browse` | Browse without words, newest activity first: the search filters plus `collection`, `limit` (1 to 100, default 50) and `cursor`. Answers `{items, next, counts}`, with a count per outcome. |
| `GET /api/v1/facets` | The boards, agents and stations among items the caller can see |
| `GET /api/v1/collections` | Every collection, with how many items in each the caller can see |
| `POST /api/v1/collections` | Create one: `name`, optional `description` |
| `GET /api/v1/collections/{col}` | One collection and its visible items |
| `PATCH /api/v1/collections/{col}` | Rename or describe; creator or owner |
| `DELETE /api/v1/collections/{col}` | Delete; creator or owner |
| `POST /api/v1/collections/{col}/items` | Add an item, optional note |
| `DELETE /api/v1/collections/{col}/items/{itm}` | Remove an item |
| `POST /api/v1/items/{itm}/supersede` | `{"by": "itm_…" \| null}`; uploader or owner |
| `PATCH /api/v1/items/{itm}/caption` | `{"caption": "…" \| null}`, up to 2,000 characters; artifacts only |
| `POST /api/v1/items/{itm}/remove` | Remove from memory: `{"reason": "…"}`, 3 to 500 characters |

## Sources

| Route | Who | |
|---|---|---|
| `POST /api/v1/sources/superpipeline/events` | Superpipeline | Record events, signed with HMAC-SHA-256 |
| `POST /api/v1/sources/superpipeline/backfill` | operator | Read every board in full. `202 {"boards": N}` |
| `GET /api/v1/sources/agentpod/items?station=<id>` | person | Up to 200 live items linked from a station |
| `POST /api/v1/roster/invalidate` | service | `{"principal": "prn_…"}`: an agent's boards changed. `204`. |

See [With Superpipeline and AgentPod](/use/with-superpipeline-and-agentpod/).

## Admin

Operators only. See [Retention and operations](/use/retention-and-operations/#operators).

| Route | |
|---|---|
| `POST /api/v1/admin/index/reconcile` | `202 {"queued": N, "orphans": M}` |
| `POST /api/v1/admin/index/reindex` | `{"embedder": "<id>"}`; `409 reindex_running`, `409 slot_not_drained`, `400 dimension_mismatch`, `400 unknown_embedder` |
| `POST /api/v1/admin/index/reindex/cancel` | `404 no_reindex` when none runs |
| `POST /api/v1/admin/index/reindex/resume` | `404 no_reindex` when none runs |
| `POST /api/v1/admin/search/explain` | A search query; answers `{results, candidates}` |

## Cross-origin calls

Browsers may call the API from the origins in `EMBED_HOSTS` (the `me`, item, embed, scope and
related routes) and `CONSOLE_ORIGINS` (the upload routes and the station-items list). See
[Embed](/build/embed/#allowed-origins).
