#!/bin/sh
# Smoke a SuperLibrary staging copy: `sh deploy/staging/smoke.sh <base-url>`.
set -eu
base=${1:-https://staging-app.superlibrary.dev}
accounts=https://staging-accounts.superjackfruit.com
fail() { echo "smoke: $*" >&2; exit 1; }
curl -fsS "$base/api/health" | grep '"ok":true' >/dev/null || fail "/api/health"
code=$(curl -s -o /dev/null -w '%{http_code}' "$base/api/v1/me")
[ "$code" = 401 ] || fail "/api/v1/me unauthenticated answered $code, not 401"
curl -fsS "$base/" | grep -i '<html' >/dev/null || fail "/ serves no web app"
# Sign-in is the SPA's (PKCE in the browser): it learns the plane from this discovery document,
# then sends the person to the plane's /authorize as client superlibrary-web.
meta=$(curl -fsS "$base/.well-known/oauth-protected-resource")
echo "$meta" | grep -q "\"$accounts\"" || fail "protected-resource metadata names no staging-accounts: $meta"
echo "$meta" | grep -q '"resource":"https://staging-app.superlibrary.dev"' || fail "resource is not the staging audience: $meta"
auth="$accounts/api/auth/oauth2/authorize?response_type=code&client_id=superlibrary-web&redirect_uri=https%3A%2F%2Fstaging-app.superlibrary.dev%2Fauth%2Fcallback&scope=openid&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256&state=smoke&resource=https%3A%2F%2Fstaging-app.superlibrary.dev"
loc=$(curl -s -o /dev/null -w '%{redirect_url}' "$auth")
case "$loc" in
  "$accounts"/sign-in*client_id=superlibrary-web*) ;;
  *) fail "staging-accounts /authorize for superlibrary-web redirects to '$loc', not its login" ;;
esac
case "$base" in
  http://127.0.0.1:*) # The cron door is the Worker's, not the SPA's (only reachable on the box).
    curl -fsS "$base/__scheduled?cron=0+*+*+*+*" | grep -qi '<html' && fail "/__scheduled answered by the SPA" ;;
esac
echo "smoke: ok ($base)"
