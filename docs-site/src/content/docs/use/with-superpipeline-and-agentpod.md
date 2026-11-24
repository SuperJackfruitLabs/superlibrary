---
title: With SuperPipeline and AgentPod
description: How SuperPipeline work history arrives as work records, how AgentPod files are linked as artifacts, and what each connection needs.
---

SuperLibrary remembers more when the other products bring their receipts. Items arrive from three
places—people's uploads, SuperPipeline, and AgentPod—and here we'll follow the two product
connections. Each one needs that product's deployment and SuperLibrary's own credentials for it.

## SuperPipeline: work records

Every SuperPipeline card becomes a [work record](/concepts/#work-record), with an
[outcome](/concepts/#outcome) read from its state, gates and links.

**Push events.** SuperLibrary registers a push subscription on each board of the workspace, and
SuperPipeline posts record events to:

```
POST /api/v1/sources/superpipeline/events
```

Each event arrives on treaty's delivery contract: a CloudEvent in HTTP binary mode, signed in
`x-treaty-signature` over its timestamp, its event id and its body, with a per-board secret
derived from `PUSH_SIGNING_KEY`, so only SuperPipeline can post them. A push without a valid
`x-treaty-signature` is refused, whatever else it carries; the older `X-Superpipeline-Signature`
is no longer accepted, so SuperPipeline must be v0.0.37 or later. Each body is checked
against treaty's `record.v1`, and the events subscribed to are that schema's list. SuperLibrary
then reads the card back from SuperPipeline and updates its record. The subscriptions are
refreshed every hour.

Every read of a board, a card, its attempts, comments, links and gates is checked against
treaty's `board-read.v1` before SuperLibrary uses it. An answer the contract refuses counts as
SuperPipeline being unavailable: the card is tried again later, and the log names the read and the
fields that failed, never the card's content. A gate's decision is read as the contract keeps it,
an open value: `approve`, `approve_manual` and `approve_automatic` all approve the work; a
decision SuperLibrary does not know is kept in the record as recorded and never counts as an
approval.

The answers follow the suite's receiver status contract: `202` for an event taken, or one that
is not a record event; `503` for a board this deployment has not mapped yet, so SuperPipeline
tries again; `400` for a body that is not `record.v1`, and `401` for a bad signature, which are
not sent again.

**Backfill.** An operator can read every board in full, archived cards included:

```
POST /api/v1/sources/superpipeline/backfill     → 202 {"boards": N}
```

Live events keep records current afterwards.

With the backfill complete, old cards are on the shelf; with the subscription alive, new changes
keep finding their way there without another full read.

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

The result is an artifact with its working context still attached: you can see not only the file,
but which run made it and which board is allowed to remember it.

A person can also link a file from their own station in the AgentPod console. SuperLibrary asks
the hub whose station it is and records the link only for its owner.

The console lists a station's links with the person's own token:

```
GET /api/v1/sources/agentpod/items?station=<id>
```

It returns up to 200 live items from that station that the person can see.

That read gives the console a station-specific list without widening a single item's visibility.

**Agents' boards.** What an agent can see is its roster of boards, read from the hub. The hub
tells SuperLibrary when an agent's roster changes (`POST /api/v1/roster/invalidate`).

The roster and the station-owner read are checked against treaty's `capability-catalog.v1`. An
answer it refuses is no answer: a roster falls back to a cached one under an hour old, else to
workspace items only, and a person's station link is refused with `502 hub_unreachable`.

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

Keep those lists aligned and the browser can embed or upload from the intended products; leave a
host out and the browser boundary stays closed rather than guessing your intent.
