---
title: Install
description: Install the suli command-line client with the verified installer, sign in, and run SuperLibrary itself locally for development.
---

There are two things to install: the `suli` client, which talks to a SuperLibrary server, and
SuperLibrary itself. Most people only need the first.

## Install `suli`

`suli` (also installed as `superlibrary`) is one binary. Releases are built for macOS on Apple
silicon and Intel (`darwin-arm64`, `darwin-x64`) and Linux (`linux-x64`, `linux-arm64`). The
installer needs no sudo and puts it in `~/.local/bin`:

```sh
curl -fsSL https://github.com/SuperJackfruitLabs/superlibrary/releases/latest/download/install.sh | bash
```

| Variable | Effect |
|---|---|
| `VERSION=v0.0.1` | install this release tag instead of the latest |
| `BIN_DIR=/some/dir` | install somewhere other than `~/.local/bin` |
| `SKILL_DIR=~/.claude/skills` | also install the agent skill there |

Pass a variable to `bash`, for example `... | VERSION=v0.0.1 bash`.

The installer:

- refuses a download whose SHA-256 is not listed in the release's `SHA256SUMS`;
- never overwrites a different program already named `suli` or `superlibrary`.

### Verify

```sh
suli version
```

It prints `suli <version> <platform>/<arch>`. A release binary reports its release tag, for
example `v0.0.1`; a build from source reports `dev`.

### Sign in

```sh
suli login
```

`suli` finds the sign-in service from the server and runs its device flow: open the printed link
in any browser, confirm the code, and `suli` keeps a device credential of its own. It works over
SSH and in a cloud session. Each later command exchanges that credential for a token that lives
five minutes. `suli whoami` shows who you are signed in as.

Without `SUPERLIBRARY_URL`, `suli` talks to the hosted service at `https://app.superlibrary.dev`,
and `suli login` signs in through the SuperJackfruit account service. Set `SUPERLIBRARY_URL` to
point it at another server. See [the CLI](/build/cli/#environment) for every variable.

### The agent skill

`suli skill` prints a `SKILL.md` that teaches an agent to use `suli`; `suli skill install` writes
it to `<dir>/superlibrary-items/SKILL.md`. It is built into the binary, so it always matches the
commands of the `suli` that wrote it.

## Running SuperLibrary itself

SuperLibrary is three Workers: the API, the content Worker that serves artifact bytes, and the web
app. A release contains only the CLI; the server parts are run from source.

### Local development

You need Node.js and pnpm. No Cloudflare account and no sign-in are needed: the local stack runs
on Wrangler's local emulation, with development auth.

```sh
pnpm install
node scripts/dev-keys.mjs
pnpm --filter @superlibrary/api dev        # API on :8787
pnpm --filter @superlibrary/content dev    # content Worker on :8788
pnpm --filter @superlibrary/web dev        # web app on :5173
```

Open `http://localhost:5173`.

To run the tests:

```sh
pnpm typecheck && pnpm test
pnpm --filter @superlibrary/web e2e        # Chromium and WebKit
```

### A deployment

:::caution
There is no self-hosting guide yet, and two dependencies stand in the way.

- **Cloudflare.** Production uses Workers with D1, R2, Workers AI, two Vectorize indexes, three
  Queues and cron triggers.
- **Sign-in.** Tokens are verified against `accounts.superjackfruit.com` as issuer and key set.
  There is no other sign-in provider in this release, only the development auth for local work.

The committed configuration (`apps/api/wrangler.jsonc`, `apps/content/wrangler.jsonc`) names
SuperJackfruit's own domains, D1 database and sister-product URLs. Another operator has to replace
them, and still has no sign-in provider of their own.
:::

The secrets a deployment sets are listed in [Retention and operations](/use/retention-and-operations/#secrets).
