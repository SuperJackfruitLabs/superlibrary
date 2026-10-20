---
title: The suli CLI
description: Superlibrary from a terminal. Every suli command by group, the flags every command takes, the environment it reads, and how it signs in.
---

`suli` is Superlibrary from a terminal; `superlibrary` is the same program under its full name.
[Install](/install/#install-suli) has the installer.

```sh
suli <verb> [<arguments>] [--flags] [--json]
suli help <verb>
```

`suli` is for people. An agent token is refused by every command that calls the server; agents
use the [MCP tools](/build/mcp/) instead.

## Signing in

| Command | What it does |
|---|---|
| [`suli help`](/build/cli/session/#suli-help) | Every command, or one in full |
| [`suli version`](/build/cli/session/#suli-version) | The version of suli |
| [`suli skill`](/build/cli/session/#suli-skill) | Print or install the agent skill |
| [`suli login`](/build/cli/session/#suli-login) | Sign in from this terminal |
| [`suli logout`](/build/cli/session/#suli-logout) | Forget this terminal's credential |
| [`suli whoami`](/build/cli/session/#suli-whoami) | Who you are signed in as |

## Artifacts

| Command | What it does |
|---|---|
| [`suli upload`](/build/cli/artifacts/#suli-upload) | Upload a file or a folder |
| [`suli get`](/build/cli/artifacts/#suli-get) | Show an item and its versions |
| [`suli revoke`](/build/cli/artifacts/#suli-revoke) | Revoke an item or one version |

## Finding and curating

| Command | What it does |
|---|---|
| [`suli search`](/build/cli/library/#suli-search) | Search the library |
| [`suli collect list`](/build/cli/library/#suli-collect-list) | Every collection in the workspace |
| [`suli collect create`](/build/cli/library/#suli-collect-create) | Start a collection |
| [`suli collect show`](/build/cli/library/#suli-collect-show) | The items in a collection |
| [`suli collect add`](/build/cli/library/#suli-collect-add) | Add an item to a collection |
| [`suli collect remove`](/build/cli/library/#suli-collect-remove) | Take an item out of a collection |
| [`suli scope`](/build/cli/library/#suli-scope) | Show an item to the whole workspace |

## Flags every command takes

| Flag | Meaning |
|---|---|
| `--json` | Print machine-stable JSON instead of text |
| `--help` | Print this command's help |

Every command exits `0` on success and `1` on any failure. Each command's page lists the reasons.

## Environment

| Variable | Meaning |
|---|---|
| `SUPERLIBRARY_TOKEN` | a person's token, used exactly as supplied and never renewed |
| `SUPERLIBRARY_URL` | the server; default `https://app.superlibrary.dev` |
| `XDG_CONFIG_HOME` | Linux: the config directory credentials live under |
| `APPDATA` | Windows: the config directory credentials live under |

Without `SUPERLIBRARY_URL`, `suli` talks to the hosted service, and `suli login` signs in through
the SuperJackfruit account service.

The command pages are generated from the CLI's own command table, the same source as
`suli help`.
