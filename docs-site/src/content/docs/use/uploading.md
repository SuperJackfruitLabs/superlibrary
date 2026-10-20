---
title: Uploading
description: How an upload is checked before anything is stored. Path rules, size limits, the secret scan and its override, versions and expiry.
---

You upload from the app's Upload page or with [`suli upload`](/build/cli/artifacts/#suli-upload).
Both go through the same checks, in the same order, and nothing is stored until all of them pass.

```sh
suli upload report.md
suli upload ./site --title "Launch page" --entry index.html
suli upload notes.md --item itm_0123456789abcdef     # a new version
```

Uploading is a person's act. An agent cannot upload with `suli`; an agent's files arrive through
the AgentPod hub instead (see [With SuperPipeline and AgentPod](/use/with-superpipeline-and-agentpod/)).

## Path rules

Every path in a file or folder is checked. Refused: `..`, paths outside the folder, a symbolic
link pointing outside the folder, and anything on the denylist, such as `.env*`, `.ssh/`, keys
and credential files.

## Size limits

| Limit | Value |
|---|---|
| One file | 25 MB |
| One folder | 100 MB in total, and at most 500 files |
| One workspace | 1 GB |

Workspace usage counts each distinct file once, by its SHA-256, so uploading the same bytes again
costs nothing. Bytes in uploads still open count too. A refusal names the limit and ends "Nothing
was added to the library."

An upload not committed within 24 hours is swept. Files still arriving renew it, never past 72
hours from when it was started.

## The secret scan

Every file is scanned line by line for:

- AWS access keys and secret keys
- GitHub tokens
- Slack tokens and webhooks
- OpenAI and Anthropic keys
- JWTs
- PEM private keys (a certificate or a public key is not a secret)
- assignments to names like `secret`, `token`, `password` or `api_key` whose value has high entropy

A finding refuses the upload. The refusal names the file, the line and the kind of secret; it
never repeats what matched.

The scan is pattern matching. It catches the common forms; it is not a guarantee that no secret
gets through.

### Overriding a finding

When a finding is a false alarm, a person can upload anyway and give a reason:

```sh
suli upload notes.md --override "example key from the vendor's docs, not live"
```

The reason, who gave it and exactly which findings it covered are recorded in the audit log. An
override covers the findings it was shown: a new finding needs a new override. Agents cannot
override the scan.

## Versions

`--item <itm_…>` (or uploading from an item's page) adds a new version to an existing item. Each
version keeps its own files, entry and checksum. Revoking one version leaves the others.

## Expiry

`--expires <YYYY-MM-DD>` deletes the item at the start of that day, UTC. Expired items are
deleted by the daily sweep whatever the retention mode; see
[Retention and operations](/use/retention-and-operations/).

## Who sees it

An upload is scoped to the workspace by default. `--board <brd_…>` scopes it to one board; the CLI
notes that it is visible only to you until board access arrives. See
[Concepts](/concepts/#scope-and-visibility).
