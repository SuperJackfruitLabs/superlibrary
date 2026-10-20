---
title: With SuperPipeline and AgentPod
description: How SuperPipeline work history arrives as work records, how AgentPod files are linked as artifacts, and what each connection needs.
---

SuperLibrary's items come from three places: people's uploads, SuperPipeline, and AgentPod. This
page covers the two products. Each connection needs that product's deployment, and SuperLibrary's
own credentials for it.

## SuperPipeline: work records

Every SuperPipeline card becomes a [work record](/concepts/#work-record), with an
[outcome](/concepts/#outcome) read from its state, gates and links.

**Push events.** SuperLibrary registers a push subscription on each board of the workspace, and
SuperPipeline posts record events to:

```
POST /api/v1/sources/superpipeline/events
```

Each event is signed with HMAC-SHA-256 from `PUSH_SIGNING_KEY`, so only SuperPipeline can post
them. SuperLibrary then reads the card back from SuperPipeline and updates its record. The
subscriptions are refreshed every hour.

**Backfill.** An operator can read every board in full, archived cards included:

```
POST /api/v1/sources/superpipeline/backfill     → 202 {"boards": N}
```

Live events keep records current afterwards.

**What it needs:** a SuperPipeline deployment, `PUSH_SIGNING_KEY`, and `SERVICE_CREDENTIALS`,
SuperLibrary's own service credentials for calling SuperPipeline.

**Inside SuperPipeline,** the app can embed SuperLibrary's viewer for artifacts and ask for
related items for a card through `POST /api/v1/related`.

## AgentPod: linked artifacts

An agent on an AgentPod station can link a file it made into the library. The link goes through
the AgentPod hub, which is the one service principal trusted to act for an agent and to say where
a file came from. Agents never reach the upload routes on their own.

A linked file is an ordinary upload, with the same path rules, size limits and secret scan, plus
a source: the station, the path on it, and the board, card, stage and run it was made for. The
item is scoped to that board. Linking the same station path again on the same board makes the
next version of the same item.

A person can also link a file from their own station in the AgentPod console. SuperLibrary asks
the hub whose station it is and records the link only for its owner.

The console lists a station's links with the person's own token:

```
GET /api/v1/sources/agentpod/items?station=<id>
```

It returns up to 200 live items from that station that the person can see.

**Agents' boards.** What an agent can see is its roster of boards, read from the hub. The hub
tells SuperLibrary when an agent's roster changes (`POST /api/v1/roster/invalidate`).

**What it needs:** an AgentPod hub, `HUB_SERVICE_PRINCIPAL` naming it, and `SERVICE_CREDENTIALS`
for reading rosters.

## Browser origins

Two configuration values name which other products' web apps may call SuperLibrary from a browser:

| Variable | Allows | Shipped value |
|---|---|---|
| `EMBED_HOSTS` | embedding the viewer, and the `me`, item, embed, scope and related routes | `https://app.superpipeline.dev https://console.agentpod.dev` |
| `CONSOLE_ORIGINS` | the upload and station-items routes | `https://console.agentpod.dev` |

The content Worker's `FRAME_ANCESTORS` must list the same embedding hosts. See
[Embed](/build/embed/).
