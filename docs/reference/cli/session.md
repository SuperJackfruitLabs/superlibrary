# Signing in

<!-- Generated from packages/cli/src/commands.ts by `pnpm -F @superlibrary/cli reference`. Do not edit by hand: CI fails when this file differs from what the generator writes. -->

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

- Local: sends no credential to Superlibrary.

**Prints** help text.

**Exit status** `0` on success. `1` when:

- the verb is unknown

**Example**

```sh
suli help upload
```

## `suli version`

Prints the version, platform and architecture. Sends nothing.

```sh
suli version
```

**Who may run it**

- Local: sends no credential to Superlibrary.

**Prints** one line.

**Exit status** `0` on success. `1` when:

- it cannot write its output (never in normal use)

**Example**

```sh
suli version
```

## `suli login`

Finds the sign-in service from the server (`/.well-known/oauth-protected-resource`) and runs its device flow: open the printed link, confirm the code, and suli keeps a device credential of its own. Every command after that exchanges it for a token that lives five minutes, without a browser.

```sh
suli login
```

**Who may run it**

- Talks to the sign-in service; sends no credential to Superlibrary.

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

- Local: sends no credential to Superlibrary.

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
- Agents reach Superlibrary from a later release; an agent token is refused today.

**Calls** `GET /api/v1/me`

**Prints** principal, workspace and role.

**Exit status** `0` on success. `1` when:

- there is no usable credential, or the server refuses it (401) or the act (403), or answers any other error

**Example**

```sh
suli whoami
```
