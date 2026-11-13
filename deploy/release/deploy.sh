#!/bin/sh
# The release's production deploy (`deploy` in .github/release-config.json), at the tag, in the
# order the app needs: the remote D1 migrations, then the API Worker that expects them, the
# content Worker, then the web app (Pages project superlibrary-web) that calls the API.
# CLOUDFLARE_API_TOKEN is the repository's secret, exported by the workflow (`secrets`).
set -eu
: "${CLOUDFLARE_API_TOKEN:?the workflow exports CLOUDFLARE_API_TOKEN}"
# Not a secret: it is in every dashboard URL, and naming it spares wrangler a lookup.
export CLOUDFLARE_ACCOUNT_ID=88acd85618f099112eadc9374996b9f7
export WRANGLER_SEND_METRICS=false
. deploy/release/pnpm.sh
pnpm --filter @superlibrary/api db:migrate
pnpm --filter @superlibrary/api run deploy
pnpm --filter @superlibrary/content run deploy
env -u CLOUDFLARE_API_TOKEN -u GH_TOKEN pnpm --filter @superlibrary/web build
# wrangler runs from a neutral directory with an absolute path (project detection rewrites a
# checkout), and is the lockfile's (installed under apps/api), not an unpinned download.
root=$PWD
cwd=$(mktemp -d)
(cd "$cwd" && "$root/apps/api/node_modules/.bin/wrangler" pages deploy "$root/apps/web/build" \
  --project-name=superlibrary-web --branch=main)
