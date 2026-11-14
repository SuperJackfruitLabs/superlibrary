---
title: What SuperLibrary is
description: A library of artifacts and work history, each labelled by outcome, that agents search before they work and people browse.
---

SuperLibrary gives us a memory with receipts. It keeps what agents make and what work has been
done, then labels each item with how it turned out. Before you begin non-trivial work, an agent can
consult that history; when you want the wider view, you can browse it, search it, and collect what
matters.

## What goes in

| Kind | What it is | Where it comes from |
|---|---|---|
| **Artifact** | An uploaded file or folder, versioned | A person's upload (app or `suli`), or a file an agent links through the AgentPod hub |
| **Work record** | One SuperPipeline card: its spec, stages, gate decisions and result | SuperPipeline, by signed push events and an operator backfill |

Work records come only from SuperPipeline in this release. Other sources are on the roadmap.

Every item carries an **outcome**: `approved`, `completed`, `in-progress`, `superseded`,
`rejected`, `failed` or `abandoned`. [Concepts](/concepts/) has the full vocabulary.

So the library keeps both the thing and the verdict. A polished artifact without its failed first
attempt would be tidy, certainly, but not much of a memory.

## What it does with it

- **Guards uploads.** Every file is checked against path rules and size caps, and scanned line by
  line for secrets before anything is stored. See [Uploading](/use/uploading/).
- **Shows artifacts safely.** Bytes are served from a separate content domain, only for a signed
  URL that lives five minutes, in a sandboxed frame. Other products can mount the same viewer with
  [`@superlibrary/embed`](/build/embed/).
- **Ranks by outcome.** Search fuses full-text and vector results, then weights them by outcome:
  approved and completed work ranks first, rejected and failed lower, never hidden. See
  [Search](/use/search/).
- **Respects visibility.** You see items in the workspace and on boards you can see; nothing else
  appears, not even as a snippet.

Together, those rules let you reuse good work without airbrushing the useful failures or peeking
across a boundary you do not belong on.

## Ways in

| For | Use |
|---|---|
| People | The [web app](/use/the-app/) and the [`suli` CLI](/build/cli/) |
| Agents | The [MCP server](/build/mcp/): `library_search`, `library_get`, `library_related`, all read-only |
| Products | The [HTTP API](/build/api/) and the [embed package](/build/embed/) |

## What it needs today

SuperLibrary is built for Cloudflare Workers: D1, R2, Workers AI, Vectorize, Queues and cron
triggers. People and the CLI sign in through the SuperJackfruit account service,
`accounts.superjackfruit.com`. There is no self-hosting guide yet, and no other sign-in provider:
a copy run elsewhere has only the development sign-in meant for local work. See
[Install](/install/#running-superlibrary-itself).

SuperLibrary is MIT licensed. See [Licences](/build/licences/).

## Not built yet

These are on the roadmap, not in this release: more sources (SuperWitness, SuperMessage and
others), OCR and image embeddings, previews of Office documents, and an embedder on your own
hardware. The embedder interface and the re-index procedure exist; no alternative embedder does.

That boundary is deliberate documentation, not a treasure map: if a feature is in this list, plan
without it for now.
