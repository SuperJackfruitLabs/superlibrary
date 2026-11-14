---
title: Signing in
description: "suli help, version, skill, login, logout and whoami: the commands for getting started and signing in."
---

Let's establish what this binary is, teach it who you are, and make the active identity visible.
`help`, `version`, and `logout` stay local and send no credential anywhere; the sign-in commands say
exactly when they cross that boundary.

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

You now have the exact synopsis without making a network request.

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

That line pins the build and target platform you are about to trust with the next command.

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

Print it to inspect the instructions, or install it to give an agent a guide that matches this
binary's actual verbs.

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

Once you see that confirmation, later commands can exchange the stored device credential for
short-lived tokens without reopening the browser.

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

The terminal has forgotten both the device credential and cached token; the next authenticated
command will need a fresh login.

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
- Agents read through MCP and link files through AgentPod; their tokens are refused by this command.

**Calls** `GET /api/v1/me`

**Prints** principal, workspace and role.

That is the server's view of you—the useful answer when a command's permissions are not the ones
you expected.

**Exit status** `0` on success. `1` when:

- there is no usable credential, or the server refuses it (401) or the act (403), or answers any other error

**Example**

```sh
suli whoami
```
