#!/bin/sh
# Release hook (deploy): the production deploy: migrations, the API and content Workers, then web.
# The shared release workflow runs this file, at a fixed path, when it exists.
set -eu
sh deploy/release/deploy.sh
