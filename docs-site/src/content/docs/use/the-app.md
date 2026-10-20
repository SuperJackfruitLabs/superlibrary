---
title: The app
description: The SuperLibrary web app. Search and browse with filters, item pages with provenance and versions, collections, outcome views, upload, moderation, and four vibes.
---

The web app is at `https://app.superlibrary.dev` on the hosted service, or
`http://localhost:5173` when you [run it locally](/install/#local-development). Signed-in use
needs the organization sign-in; local development uses development auth and asks for no sign-in.

The app is for people. Agents reach SuperLibrary through [MCP](/build/mcp/).

## Pages

| Page | Address | What it shows |
|---|---|---|
| Library | `/` | Search and browse, with filters for kind, outcome, board, agent, station and dates |
| Outcomes | `/outcomes` | The library by outcome, with a count for each |
| Collections | `/collections` | Every collection, and each one at `/collections/<id>` |
| Upload | `/upload` | Upload a file or a folder |
| Item | `/a/<item>` | One item: its viewer or record, provenance, versions and related work |
| Version | `/a/<item>/v/<n>` | One version of an artifact |

Outcome counts follow the same filters as the list, without the outcome filter, so each tab says
what it would show.

## An item page

An **artifact** opens in the sandboxed viewer, with a toolbar for the version, the files of a
folder, the source of text files, the theme, a download for a single file, full screen, and
sharing. It is the same viewer other products embed; see [Embed](/build/embed/).

A **work record** shows the card's record: its spec, stages and gate decisions, and the artifacts
it links that you can see.

Both show **provenance**: who made it, when, and from where (station, path, board, card, stage and
run, for what is known). They also show related items.

## Moderation

On an item you uploaded, or on any item if you own the workspace, you can:

| Act | What it does |
|---|---|
| **Supersede** | Point the item at its replacement. Its outcome becomes `superseded`; clearing it restores the outcome it had. |
| **Caption** | Add a caption to an artifact, up to 2,000 characters. It is shown and indexed for search. |
| **Remove from memory** | Delete the item, its versions and bytes no other version shares, with a reason of 3 to 500 characters. A removed work record is not recreated by a later sync. |
| **Revoke** | Stop the item, or one version, from being shown. A viewer URL already handed out stops working at once. |
| **Widen** | Show a board item to the whole workspace. It cannot be undone. |

A work record has no uploader, so only owners moderate it. Every act is recorded in the audit
log.

## Vibes

The app comes in four visual vibes: **Daylight**, **Paper**, **Studio** and **Quiet**. They change
how it looks, not what it does.

## Loading and failure

Every screen keeps loading, failure and empty apart:

- **Loading** draws the shape of what is coming, after 150 ms, with no numbers. Counts show a dash
  until known, never 0.
- **Slow**: after 8 seconds the screen adds "Still loading — the server is slow."
- **Failed**: every read gives up at 20 seconds. A missing or unshared item reads "This doesn't
  exist or isn't shared with you"; anything else reads "Couldn't load — try again", with a button
  to try again. Never a raw status code.
- **Empty** is said only after a read that worked came back with nothing.

Reduced motion, from the system setting, makes every screen static.
