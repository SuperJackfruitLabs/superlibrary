# suli command reference

<!-- Generated from packages/cli/src/commands.ts by `pnpm -F @superlibrary/cli reference`. Do not edit by hand: CI fails when this file differs from what the generator writes. -->

`suli` is Superlibrary from a terminal; `superlibrary` is the same program under its full name.

```sh
suli <verb> [<arguments>] [--flags] [--json]
suli help <verb>
```

## Signing in

| command | what it does |
|---|---|
| [`suli help`](session.md#suli-help) | Every command, or one in full |
| [`suli version`](session.md#suli-version) | The version of suli |
| [`suli login`](session.md#suli-login) | Sign in from this terminal |
| [`suli logout`](session.md#suli-logout) | Forget this terminal’s credential |
| [`suli whoami`](session.md#suli-whoami) | Who you are signed in as |

## Artifacts

| command | what it does |
|---|---|
| [`suli upload`](artifacts.md#suli-upload) | Upload a file or a folder |
| [`suli get`](artifacts.md#suli-get) | Show an item and its versions |
| [`suli revoke`](artifacts.md#suli-revoke) | Revoke an item or one version |

## Flags every command takes

| flag | type | default | meaning |
|---|---|---|---|
| `--json` | boolean | — | Print machine-stable JSON instead of text |
| `--help` | boolean | — | Print this command’s help |

## Environment

| variable | meaning |
|---|---|
| `SUPERLIBRARY_TOKEN` | a person’s token, used exactly as supplied and never renewed |
| `SUPERLIBRARY_URL` | the server (default https://app.superlibrary.dev) |
| `XDG_CONFIG_HOME` | Linux: the config directory credentials live under |
| `APPDATA` | Windows: the config directory credentials live under |
