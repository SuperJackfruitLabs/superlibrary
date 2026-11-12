#!/bin/sh
# Sourced by the release scripts: pnpm at the version package.json's packageManager names, and
# the workspace's dependencies from the lockfile.
command -v pnpm >/dev/null 2>&1 ||
  npm install --global --ignore-scripts "pnpm@$(node -p "require('./package.json').packageManager.split('@')[1].split('+')[0]")"
pnpm install --frozen-lockfile
