---
title: Concepts
description: Items, artifacts and work records, versions, outcomes, sources, collections, how retrieval ranks, and who can see what.
---

The words below are the field names and values Superlibrary returns from its API, CLI and MCP
tools.

## Item

An **item** is one entry in the library. Its id is `itm_` followed by 16 hex digits. Every item
has a `kind`, a `title`, a `scope`, an `outcome`, who created it and when, and its latest
version. An item may also carry an expiry (`expiresAt`), a revocation (`revokedAt`), a caption,
and the id of the item that superseded it.

There are two kinds.

### Artifact

An **artifact** is a file or a folder. Each upload of new bytes to the same item is a new
**version**, numbered from 1. A folder opens on its **entry** file: the one you name, or else the
shallowest `index.html`, then the shallowest `README.md`, then the first path.

Artifacts are shown, never run, on a separate content domain. The viewer renders HTML, Markdown,
images, SVG, PDF, code, plain text, JSON, YAML, TOML, CSV and TSV, notebooks (`.ipynb`), Mermaid,
Graphviz, audio and video. Anything else is offered as a download.

### Work record

A **work record** is one Superpipeline card: its title, spec, stages, gate decisions and result,
flattened to text for search. Superlibrary keeps it current from Superpipeline's signed push
events. You do not upload work records.

## Outcome

Every item has one **outcome**:

| Outcome | For a work record |
|---|---|
| `approved` | the card completed and a gate approved it |
| `completed` | the card completed with no approving gate |
| `in-progress` | anything not yet settled |
| `superseded` | another card is linked as superseding it |
| `rejected` | the card was rejected |
| `failed` | the card failed, or was flagged for repeated failure |
| `abandoned` | the card was canceled or archived |

The rules are applied in that order of precedence: superseded first, then rejected, completed
(approved or not), failed, abandoned, and in-progress last.

A person can also mark an artifact as superseded by another item from the app. See
[The app](/use/the-app/#moderation).

## Source

An item's **source** says where it came from beyond who and when:

| `sourceKind` | Meaning |
|---|---|
| `upload` | a person uploaded it, from the app or `suli` |
| `agentpod` | a file from an AgentPod station, linked by an agent through the hub, or by a person from their own station in the AgentPod console |
| `superpipeline` | a work record |

An AgentPod link records the station, the path on it, and the board, card, stage and run it was
made for, when known. Linking the same station path again on the same board makes the next
version of the same item. See [With Superpipeline and AgentPod](/use/with-superpipeline-and-agentpod/).

## Scope and visibility

An item's **scope** is either `workspace` or one board, `board:brd_<16 hex>`.

- A **person** sees every `workspace` item, items on the workspace's boards, and their own
  uploads.
- An **agent** sees `workspace` items and items on the boards it is on.
- Nobody ever sees an item from another workspace.

Search, browse, get, related and the MCP tools all use the same rule. An item you cannot see
answers 404, never 403, so its existence is not revealed.

Scope only widens. The uploader or a workspace owner can widen a board item to the workspace
(`suli scope <item> workspace`). It is recorded in the audit log and cannot be undone. Nothing is
ever narrowed.

## Collection

A **collection** is a named, hand-picked set of items in a workspace. Its id is `col_` followed by
16 hex digits; its name is unique in the workspace, in any case. Any member can add or remove an
item they can see; renaming and deleting are for the creator or an owner. A collection counts only
items the person reading it can see. See [Collections](/use/collections/).

## Retrieval

Search runs two lists and fuses them:

1. **Full-text**, with SQLite FTS5.
2. **Meaning**, with vector embeddings from Workers AI `@cf/baai/bge-m3` (1024 dimensions).

The lists are combined with reciprocal rank fusion (k = 60). The outcome weight works as a rank
offset on the meaning list:

| Outcome | Weight |
|---|---|
| `approved`, `completed` | 1 |
| `in-progress` | 0.8 |
| `superseded` | 0.5 |
| `rejected`, `failed`, `abandoned` | 0.4 |

So, among comparable matches, lower outcomes rank lower. They are never dropped. A candidate found
only by meaning is kept when it scores close to the best meaning match; one with an exact-word
match is always kept.

Search covers text. Images are found by their title and caption, not their pixels; OCR and image
embeddings are not built yet.

## Principal

A **principal** is a person or an agent, with an id `prn_…`. People sign in through the account
service. Agents reach Superlibrary through MCP with their session token, and through the AgentPod
hub, which is the one service trusted to act for an agent.
