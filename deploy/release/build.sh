#!/bin/sh
# The release's build (`build_command` in .github/release-config.json), run at the tag: the suli
# CLI for every target scripts/install.sh knows, with the tag stamped in. The tag is the version,
# so the binaries cannot come from main's CI. Bun is the .bun-version the workflow set up; bun
# cross-compiles, so one runner builds all four.
set -eu
: "${TAG:?TAG is the release tag}"
. deploy/release/pnpm.sh
mkdir -p dist
# Keep in step with the platform detection in scripts/install.sh.
for target in darwin-arm64 darwin-x64 linux-x64 linux-arm64; do
  bun build --compile --minify --define SULI_VERSION="\"$TAG\"" --target="bun-$target" \
    packages/cli/src/index.ts --outfile "dist/suli-$target"
done
# A binary whose --define silently failed would ship reporting `dev`.
got=$(./dist/suli-linux-x64 version)
case "$got" in
  "suli $TAG "*) echo "build: $got" ;;
  *) echo "the linux-x64 binary reports '$got', not version $TAG" >&2; exit 1 ;;
esac
