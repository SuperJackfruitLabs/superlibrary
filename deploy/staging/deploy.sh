#!/usr/bin/env bash
# Deploy a commit of SuperLibrary to the staging plane, as root on workbench: run by
# /usr/local/sbin/staging-deploy (`superlibrary <sha>`). Idempotent. Installs the workspace, builds
# the web app (served as the API Worker's assets) and the content viewer for that commit, applies
# D1 migrations to the persisted state, recreates the Workers and runs the smoke.
set -euo pipefail
sha=${1:-$(git -C /opt/suite-staging/superlibrary rev-parse origin/main)}
cd /opt/suite-staging/superlibrary
git fetch -q origin
git checkout -q --detach "$sha"
sha=$(git rev-parse HEAD)

env=/opt/suite-staging/env
for f in superlibrary/api.env superlibrary/content.env cloudflare.env; do
  [ -f "$env/$f" ] || { echo "no $env/$f"; exit 1; }
done

compose="docker compose -f deploy/staging/compose.yml"
docker run --rm -v "$PWD:/app" -w /app -e CI=true node:22.20.0-bookworm sh -c "corepack enable >/dev/null && COREPACK_ENABLE_DOWNLOAD_PROMPT=0 pnpm install --frozen-lockfile >/dev/null && pnpm --filter @superlibrary/web build >/dev/null && pnpm --filter @superlibrary/content build:viewer >/dev/null"
$compose stop superlibrary superlibrary-content cron >/dev/null 2>&1 || true
$compose run --rm migrate
$compose up -d --force-recreate superlibrary superlibrary-content cron
for _ in $(seq 1 90); do curl -sf http://127.0.0.1:8797/api/health >/dev/null && break; sleep 2; done
sh deploy/staging/smoke.sh http://127.0.0.1:8797
git log -1 --format='staged %h %s'
