---
title: Collections
description: Named, hand-picked sets of items in a workspace. Creating them, adding and removing items, who may rename or delete them, and how they keep artifacts.
---

A collection is how you turn a useful search result into a shelf you can return to: a week's launch
work, a project's references, or the examples worth keeping. We pick collections by hand;
collections are a person's tool, so agent tokens are refused.

## From the command line

```sh
suli collect create "Building in public — week 41" --description "what we shipped"
suli collect add "week 41" itm_0123456789abcdef --note "the launch post"
suli collect show "week 41"
suli collect list
suli collect remove "week 41" itm_0123456789abcdef
```

Run that sequence and you have a named collection, one annotated item inside it, a readable listing,
and finally the same item removed without deleting it from the library. The shelf changes; the book
does not fall into a trapdoor.

A collection is named by its id (`col_…`) or its name. Names are unique in the workspace, in any
case. The full reference is in [the CLI reference](/build/cli/library/).

In the app, collections are at `/collections`, and an item's page offers to add it to one.

Choose either route and the result is the same shared collection, ready for any member who can see
the items inside it.

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

Add an artifact when “old” should not mean “unreferenced”; collection membership gives retention a
plain reason to keep it.

Retention of unreferenced artifacts is reported, not enforced, in the shipped configuration. See
[Retention and operations](/use/retention-and-operations/#retention).
