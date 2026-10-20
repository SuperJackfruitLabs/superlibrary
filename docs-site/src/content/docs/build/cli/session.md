---
title: Signing in
description: "suli help, version, skill, login, logout and whoami: the commands for getting started and signing in."
---

Signing in through your Super Jackfruit Labs account, and seeing which identity is in force. `help`, `version` and `logout` send no credential anywhere.

## `suli help`

Prints the command summary, or one command in full. Sends nothing.

```sh
suli help [<verb>]
```

| argument | meaning |
|---|---|
| `<verb>` | A command to explain (optional) |

**Who may run it**

- Local: sends no credential to SuperLibrary.

**Prints** help text.

**Exit status** `0` on success. `1` when:

- the verb is unknown

**Example**

```sh
suli help upload
```

## `suli version`

Prints `suli <version> <platform>/<arch>`. A release binary reports its release tag (for example v0.0.1); a build from source reports `dev`. Sends nothing.

```sh
suli version
```

**Who may run it**

- Local: sends no credential to SuperLibrary.

**Prints** one line.

**Exit status** `0` on success. `1` when:

- it cannot write its output (never in normal use)

**Example**

```sh
suli version
```

## `suli skill`

Prints SKILL.md, the guide an agent reads to use suli, stamped with this binary’s version. It is built into the binary, so it always matches the verbs it ships with. `suli skill install` instead writes `<dir>/superlibrary-items/SKILL.md` (staged beside it, then renamed, so a reader never sees half a file); it overwrites only that one file, so it is safe to repeat. Sends nothing.

```sh
suli skill [<install>] [--dir <dir>]
```

| argument | meaning |
|---|---|
| `<install>` | Write the skill into a skills directory instead of printing it (optional) |

| flag | type | default | meaning |
|---|---|---|---|
| `--dir <dir>` | path | ~/.claude/skills | With `install`: the skills directory to write into |

**Who may run it**

- Local: sends no credential to SuperLibrary.

**Prints** the SKILL.md text; with `install`, the path written (with --json, `{ "path": … }`).

**Exit status** `0` on success. `1` when:

- with `install`: the directory cannot be written

**Example**

```sh
suli skill
suli skill install
suli skill install --dir ./.claude/skills
```

## `suli login`

Finds the sign-in service from the server (`/.well-known/oauth-protected-resource`) and runs its device flow: open the printed link, confirm the code, and suli keeps a device credential of its own. Every command after that exchanges it for a token that lives five minutes, without a browser.

```sh
suli login
```

**Who may run it**

- Talks to the sign-in service; sends no credential to SuperLibrary.

**Calls** `GET /.well-known/oauth-protected-resource`

**Prints** the link and code, then "Signed in.".

**Exit status** `0` on success. `1` when:

- the server names no sign-in service
- the code expires or is declined

**Example**

```sh
suli login
```

## `suli logout`

Deletes suli’s device credential and cached token. Sends nothing.

```sh
suli logout
```

**Who may run it**

- Local: sends no credential to SuperLibrary.

**Prints** "Signed out.".

**Exit status** `0` on success. `1` when:

- it cannot write its output (never in normal use)

**Example**

```sh
suli logout
```

## `suli whoami`

Shows the person, workspace and role the server sees for your credential.

```sh
suli whoami
```

**Who may run it**

- A person: a member of the workspace.
- An agent token: refused.
- Agents reach SuperLibrary from a later release; an agent token is refused today.

**Calls** `GET /api/v1/me`

**Prints** principal, workspace and role.

**Exit status** `0` on success. `1` when:

- there is no usable credential, or the server refuses it (401) or the act (403), or answers any other error

**Example**

```sh
suli whoami
```
