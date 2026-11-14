---
title: Artifacts
description: "suli upload, get and revoke: uploading files and folders, reading items and their versions, and revoking."
---

This is the artifact life cycle from your terminal: upload a file or folder, inspect the item that
arrived, and revoke it when it should stop being shown. We keep the command material literal;
SuperLibrary keeps every upload behind the same path rules, size caps, and secret scan.

## `suli upload`

Checks every path against the rules (no `..`, no paths outside the folder, nothing on the denylist such as `.env*`, `.ssh/`, keys and credential files), checks the sizes (25 MB a file; 100 MB and 500 files a folder), then sends each file and commits. A secret found by the scan refuses the upload, naming the file and line; `--override` uploads it anyway and records your reason.

```sh
suli upload <path> [--title <text>] [--item <itm_…>] [--board <brd_…>] [--entry <path>] [--expires <YYYY-MM-DD>] [--override <reason>]
```

| argument | meaning |
|---|---|
| `<path>` | A file or a folder |

| flag | type | default | meaning |
|---|---|---|---|
| `--title <text>` | string | the file or folder name | What the item is called |
| `--item <itm_…>` | string | — | Upload as a new version of this item |
| `--board <brd_…>` | string | — | Scope it to a board (visible only to you until board access arrives) |
| `--entry <path>` | string | index.html, then README.md, then the first file | The file a folder opens on |
| `--expires <YYYY-MM-DD>` | date | — | Delete it on this date (the start of that day, UTC) |
| `--override <reason>` | string | — | Upload despite a secret-scan finding; your reason is recorded |

**Who may run it**

- A person: a member of the workspace.
- An agent token: refused.
- Agents read through MCP and link files through AgentPod; their tokens are refused by this command.

**Calls** `POST /api/v1/uploads`, `PUT /api/v1/uploads/:id/files`, `POST /api/v1/uploads/:id/override`, `POST /api/v1/uploads/:id/commit`

**Prints** the item URL (and with --json the item id, version, SHA-256, type and size).

That URL is your receipt: the checks passed, the commit completed, and the item is ready to open.

**Exit status** `0` on success. `1` when:

- a path is refused or a size is over its cap
- the secret scan finds something and --override is not given
- a symbolic link points outside the folder
- there is no usable credential, or the server refuses it (401) or the act (403), or answers any other error

**Example**

```sh
suli upload report.md
suli upload ./site --title "Launch page" --entry index.html
suli upload notes.md --item itm_0123456789abcdef
```

## `suli get`

Shows the item, its provenance and its versions. With `--embed`, also mints a signed viewer URL for one version, which works for five minutes (and is recorded as a view).

```sh
suli get <item> [--embed] [--version <n>]
```

| argument | meaning |
|---|---|
| `<item>` | The item id (itm_…) |

| flag | type | default | meaning |
|---|---|---|---|
| `--embed` | boolean | — | Also mint a 5-minute signed viewer URL |
| `--version <n>` | integer | — | The version for --embed |

**Who may run it**

- A person: a member of the workspace.
- An agent token: refused.
- Agents read through MCP and link files through AgentPod; their tokens are refused by this command.

**Calls** `GET /api/v1/items/:id`, `POST /api/v1/items/:id/embed`

**Prints** the item and its versions.

Now you can inspect the provenance and version history before deciding which bytes to open.

**Exit status** `0` on success. `1` when:

- the item does not exist or you cannot see it (404)
- it is revoked or expired (410)
- there is no usable credential, or the server refuses it (401) or the act (403), or answers any other error

**Example**

```sh
suli get itm_0123456789abcdef
suli get itm_0123456789abcdef --embed --version 2
```

## `suli revoke`

Revokes at once: a viewer URL already handed out stops working immediately. Only the uploader or an owner of the workspace may.

```sh
suli revoke <item> [--version <n>] [--reason <text>]
```

| argument | meaning |
|---|---|
| `<item>` | The item id (itm_…) |

| flag | type | default | meaning |
|---|---|---|---|
| `--version <n>` | integer | — | Revoke only this version |
| `--reason <text>` | string | — | Why; recorded when the whole item is revoked, so not allowed with --version |

**Who may run it**

- A person: the person who uploaded it, or an owner of the workspace.
- An agent token: refused.
- Agents read through MCP and link files through AgentPod; their tokens are refused by this command.

**Calls** `POST /api/v1/items/:id/revoke`, `POST /api/v1/items/:id/versions/:n/revoke`

**Prints** "Revoked.".

After that confirmation, the item or selected version can no longer be shown, including through a
viewer URL that was already minted.

**Exit status** `0` on success. `1` when:

- you are not the uploader or an owner (403)
- there is no usable credential, or the server refuses it (401) or the act (403), or answers any other error

**Example**

```sh
suli revoke itm_0123456789abcdef --reason "posted by mistake"
suli revoke itm_0123456789abcdef --version 2
```
