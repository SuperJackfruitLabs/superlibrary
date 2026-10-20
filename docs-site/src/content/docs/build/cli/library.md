---
title: Finding and curating
description: "suli search, collect and scope: searching the library, keeping collections, and widening who can see an item."
---

Searching the library with the same filters as the app, keeping collections, and widening who can see an item. Search shows only what you can see; collections and widening are a person's acts and are recorded.

## `suli search`

Ranked results with their outcome: approved and completed work first, rejected and failed lower but never hidden. Only items you can see are searched, and none you cannot see is ever shown, even as a snippet.

```sh
suli search <words> [--kind <artifact|work-record>] [--outcome <a,b>] [--board <brd_…>] [--agent <prn_…>] [--station <id or name>] [--since <YYYY-MM-DD>] [--until <YYYY-MM-DD>] [--limit <n>]
```

| argument | meaning |
|---|---|
| `<words>` | What to look for; several words are one query |

| flag | type | default | meaning |
|---|---|---|---|
| `--kind <artifact\|work-record>` | string | — | Only artifacts, or only work records |
| `--outcome <a,b>` | string | — | Only these outcomes, comma-separated: approved, completed, in-progress, superseded, rejected, failed, abandoned |
| `--board <brd_…>` | string | — | Only this board |
| `--agent <prn_…>` | string | — | Only items made by this agent |
| `--station <id or name>` | string | — | Only items linked from this station |
| `--since <YYYY-MM-DD>` | date | — | Last activity on or after the start of this day, UTC |
| `--until <YYYY-MM-DD>` | date | — | Last activity on or before this day, UTC |
| `--limit <n>` | integer | 10 | At most this many results (1 to 25) |

**Who may run it**

- A person: a member of the workspace.
- Agents search through MCP (`library_search`), not through suli.

**Calls** `POST /api/v1/search`

**Prints** one line per result (id, outcome, title), its snippet and its replacement.

**Exit status** `0` on success. `1` when:

- a flag is not one of its values
- there is no usable credential, or the server refuses it (401) or the act (403), or answers any other error

**Example**

```sh
suli search deploy checklist
suli search launch post --outcome rejected,failed --since 2026-10-01
```

## `suli collect list`

Lists the collections with how many items in each you can see.

```sh
suli collect list
```

**Who may run it**

- A person: a member of the workspace.
- An agent token: refused.
- Agents reach Superlibrary from a later release; an agent token is refused today.

**Calls** `GET /api/v1/collections`

**Prints** one line per collection.

**Exit status** `0` on success. `1` when:

- there is no usable credential, or the server refuses it (401) or the act (403), or answers any other error

**Example**

```sh
suli collect list
```

## `suli collect create`

Creates an empty collection. An artifact in a collection is kept however old it is.

```sh
suli collect create <name> [--description <text>]
```

| argument | meaning |
|---|---|
| `<name>` | The collection’s name; unique in the workspace, in any case |

| flag | type | default | meaning |
|---|---|---|---|
| `--description <text>` | string | — | What it is for |

**Who may run it**

- A person: a member of the workspace.
- An agent token: refused.
- Agents reach Superlibrary from a later release; an agent token is refused today.

**Calls** `POST /api/v1/collections`

**Prints** "Created <name> (<id>).".

**Exit status** `0` on success. `1` when:

- the name is taken (409)
- there is no usable credential, or the server refuses it (401) or the act (403), or answers any other error

**Example**

```sh
suli collect create "Building in public — week 41"
```

## `suli collect show`

Shows the collection and the items in it you can see, newest added first.

```sh
suli collect show <collection>
```

| argument | meaning |
|---|---|
| `<collection>` | Its id (col_…) or its name |

**Who may run it**

- A person: a member of the workspace.
- An agent token: refused.
- Agents reach Superlibrary from a later release; an agent token is refused today.

**Calls** `GET /api/v1/collections`, `GET /api/v1/collections/:id`

**Prints** the collection and one line per item.

**Exit status** `0` on success. `1` when:

- no collection has that id or name
- there is no usable credential, or the server refuses it (401) or the act (403), or answers any other error

**Example**

```sh
suli collect show "week 41"
```

## `suli collect add`

Any member may add an item they can see. While it is in a collection, an artifact is exempt from retention: a deployment that enforces it deletes artifacts nothing refers to after 30 days, and the shipped configuration only reports them.

```sh
suli collect add <collection> <item> [--note <text>]
```

| argument | meaning |
|---|---|
| `<collection>` | Its id (col_…) or its name |
| `<item>` | The item id (itm_…) |

| flag | type | default | meaning |
|---|---|---|---|
| `--note <text>` | string | — | Why it is in the collection |

**Who may run it**

- A person: a member of the workspace.
- An agent token: refused.
- Agents reach Superlibrary from a later release; an agent token is refused today.

**Calls** `GET /api/v1/collections`, `POST /api/v1/collections/:id/items`

**Prints** "Added.".

**Exit status** `0` on success. `1` when:

- the item does not exist or you cannot see it (404)
- there is no usable credential, or the server refuses it (401) or the act (403), or answers any other error

**Example**

```sh
suli collect add "week 41" itm_0123456789abcdef --note "the launch post"
```

## `suli collect remove`

The item stays in the library; only the collection no longer holds it.

```sh
suli collect remove <collection> <item>
```

| argument | meaning |
|---|---|
| `<collection>` | Its id (col_…) or its name |
| `<item>` | The item id (itm_…) |

**Who may run it**

- A person: a member of the workspace.
- An agent token: refused.
- Agents reach Superlibrary from a later release; an agent token is refused today.

**Calls** `GET /api/v1/collections`, `DELETE /api/v1/collections/:id/items/:item`

**Prints** "Removed.".

**Exit status** `0` on success. `1` when:

- there is no usable credential, or the server refuses it (401) or the act (403), or answers any other error

**Example**

```sh
suli collect remove "week 41" itm_0123456789abcdef
```

## `suli scope`

Widens who can see an item from its board to everyone in the workspace, agents included. Recorded in the audit log. Only the uploader or an owner may; it cannot be undone.

```sh
suli scope <item> <scope>
```

| argument | meaning |
|---|---|
| `<item>` | The item id (itm_…) |
| `<scope>` | workspace (the only value: an item is never narrowed) |

**Who may run it**

- A person: the person who uploaded it, or an owner of the workspace.
- An agent token: refused.
- Agents reach Superlibrary from a later release; an agent token is refused today.

**Calls** `POST /api/v1/items/:id/scope`

**Prints** "Everyone in the workspace can now see it.".

**Exit status** `0` on success. `1` when:

- the scope is not workspace
- you are not the uploader or an owner (403)
- there is no usable credential, or the server refuses it (401) or the act (403), or answers any other error

**Example**

```sh
suli scope itm_0123456789abcdef workspace
```
