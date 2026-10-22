#!/usr/bin/env bash
# Smoke the staging content Worker on Cloudflare, as root on workbench (deploy.sh runs it): put a
# fixed probe item into superlibrary-blobs-staging and open its signed URL on the public `-stg` host.
set -euo pipefail
cd /opt/suite-staging/superlibrary
docker compose -f deploy/staging/compose.yml run --rm -T --entrypoint sh superlibrary -c '
  set -e; cd /app/apps/api; w=node_modules/.bin/wrangler; t=$(mktemp -d)
  set -- $(node ../../deploy/staging/content-smoke.mjs seed "$t")
  $w r2 object put "superlibrary-blobs-staging/$1" --file "$t/blob" --remote >/dev/null
  $w r2 object put "superlibrary-blobs-staging/$2" --file "$t/manifest.json" --content-type application/json --remote >/dev/null
  set -a; . /run/secrets/api.env; set +a
  node ../../deploy/staging/content-smoke.mjs check'
