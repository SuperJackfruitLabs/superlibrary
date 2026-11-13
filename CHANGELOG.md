# Changelog

Changes people will notice, newest first. Add an entry under `## Unreleased` with each such
change; before a tag, a release-prep PR runs `sh .github/release/prep-release.sh vX.Y.Z`, which
stamps the section `## vX.Y.Z — YYYY-MM-DD`, and the release notes quote it. Releases up to
v0.0.5 predate this file: their notes are on the GitHub releases.

## Unreleased

- Releases come from the suite's shared release workflow: production deploys only a tag whose
  main CI run passed, the suli binaries come with `SHA256SUMS` and a build-provenance
  attestation, and the release notes carry a summary, this section and the grouped commits.
