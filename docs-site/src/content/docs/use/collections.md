---
title: Collections
description: Named, hand-picked sets of items in a workspace. Creating them, adding and removing items, who may rename or delete them, and how they keep artifacts.
---

A collection is a named set of items that people pick by hand: a week's launch work, a reference
set for a project, the examples worth keeping. Collections are a person's tool; agent tokens are
refused.

## From the command line

```sh
suli collect create "Building in public — week 41" --description "what we shipped"
suli collect add "week 41" itm_0123456789abcdef --note "the launch post"
suli collect show "week 41"
suli collect list
suli collect remove "week 41" itm_0123456789abcdef
```

A collection is named by its id (`col_…`) or its name. Names are unique in the workspace, in any
case. The full reference is in [the CLI reference](/build/cli/library/).

In the app, collections are at `/collections`, and an item's page offers to add it to one.

## Who may do what

| Act | Who |
|---|---|
| Create a collection | any member |
| Add or remove an item | any member, for an item they can see |
| Rename or delete a collection | the person who created it, or a workspace owner |

Removing an item from a collection leaves it in the library.

A collection lists, and counts, only the items the person looking can see. Two people can see
different counts for the same collection.

## Collections and retention

Being in a collection is a reference. While an artifact is in a collection, retention keeps it,
however old it is.

Retention of unreferenced artifacts is reported, not enforced, in the shipped configuration. See
[Retention and operations](/use/retention-and-operations/#retention).
