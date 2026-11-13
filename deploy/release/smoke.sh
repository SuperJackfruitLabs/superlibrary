#!/bin/sh
# The release's production smoke (`smoke` in .github/release-config.json; the workflow retries
# it): the API is healthy and refuses an unauthenticated caller, the web app is served, and the
# discovery document names production Accounts.
set -u
base=https://app.superlibrary.dev
accounts=https://accounts.superjackfruit.com
curl -fsS "$base/api/health" | grep -q '"ok":true' || { echo "/api/health is not ok"; exit 1; }
code=$(curl -s -o /dev/null -w '%{http_code}' "$base/api/v1/me")
[ "$code" = 401 ] || { echo "/api/v1/me unauthenticated answered $code, not 401"; exit 1; }
curl -fsS "$base/" | grep -qi '<html' || { echo "/ serves no web app"; exit 1; }
meta=$(curl -fsS "$base/.well-known/oauth-protected-resource") || { echo "no discovery document"; exit 1; }
echo "$meta" | grep -q "\"$accounts\"" || { echo "discovery names no $accounts: $meta"; exit 1; }
echo "smoke: ok ($base)"
