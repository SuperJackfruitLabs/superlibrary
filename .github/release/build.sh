#!/bin/sh
# Release hook (build): builds the suli CLI binaries at the tag (main CI uploads no build to ship).
# The shared release workflow runs this file, at a fixed path, when it exists.
set -eu
sh deploy/release/build.sh
