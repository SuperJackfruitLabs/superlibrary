---
title: Search
description: Searching SuperLibrary from the app, suli and MCP. Filters, how results are ranked by outcome, what a result carries, and related items.
---

Search lets us ask both “where are these words?” and “where is this idea?” before outcome breaks the
tie. You can search in the app or with `suli search`; an agent uses the MCP tool `library_search`.
All three reach the same index and obey the same visibility rule.

```sh
suli search deploy checklist
suli search launch post --outcome rejected,failed --since 2026-10-01
```

The first query gives you the strongest matches across outcomes. The second deliberately asks for
the attempts that did not win—because sometimes the most useful answer is the rake someone already
stepped on.

## Filters

| Filter | `suli` flag | Meaning |
|---|---|---|
| Kind | `--kind artifact` or `--kind work-record` | only artifacts, or only work records |
| Outcome | `--outcome approved,completed` | only these outcomes |
| Board | `--board brd_…` | only this board |
| Agent | `--agent prn_…` | only items made by this agent |
| Station | `--station <id or name>` | only items linked from this AgentPod station |
| Since, until | `--since`, `--until` (`YYYY-MM-DD`) | last activity in this range, UTC |
| Limit | `--limit <n>` | 1 to 25 results; 10 by default |

The app's filters offer only values from items you can see. Browsing in the app uses the same
filters without words, newest activity first.

## Ranking

A query runs as full-text search and as a vector search over embedded text, and the two lists are
fused with reciprocal rank fusion. The outcome then weighs in: **approved** and **completed** work
ranks first, **in-progress** a little lower, then **superseded**, then **rejected**, **failed**
and **abandoned**. Lower outcomes are never hidden: a rejected attempt is often exactly what an
agent should read before trying again. [Concepts](/concepts/#retrieval) has the weights.

A result found only by meaning is kept when it is close to the best meaning match; a result with
an exact-word match is always kept. Very common words count as word matches only when a query has
no other word.

The result is broad without becoming indiscriminate: close semantic matches can join the list, and
an exact-word match does not vanish because the embedding had other ideas.

## What a result carries

Each result has the item's id, kind, title, outcome, scope, provenance, a snippet and its URL in
the app. A superseded item names the item that replaces it.

## Visibility

Search covers only items you can see: workspace-wide items and items on boards you can see (for a
person, also their own uploads). An item you cannot see never appears, not even as a snippet.

## Related items

Related items are found from a SuperPipeline card or another item, using its title, spec and
references. The app shows them on an item's page; agents use `library_related`; products call
`POST /api/v1/related`. A card that has no record yet can be matched by the title and spec the
caller sends, which are never stored.

## Limits

Search covers text. Images and other binaries are found by their title, path and caption only.
OCR, image embeddings and other embedders are not built yet.

For now, give visual work a useful title or caption if you expect anyone—including tomorrow's
version of you—to find it.
