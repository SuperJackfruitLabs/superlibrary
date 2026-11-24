# Changelog

Changes people will notice, newest first. Add an entry under `## Unreleased` with each such
change; before a tag, a release-prep PR runs `sh .github/release/prep-release.sh vX.Y.Z`, which
stamps the section `## vX.Y.Z — YYYY-MM-DD`, and the release notes quote it. Releases up to
v0.0.5 predate this file: their notes are on the GitHub releases.

## Unreleased

- Treaty 0.0.20, whose `api.v1` `ItemSummary` describes ingested work records
  (`createdBy: "source:superpipeline"`, `latestVersion: 0`). The API tests' contract hook no
  longer lets anything through: its `ALLOWED_MISMATCHES` is gone.
- The routes other products call (uploads, related work, roster invalidation, `me`, and an
  item's read, embed grant and widening) are checked in the API tests against treaty's
  `superlibrary.api` contract (`api.v1`), refusals and the fields each code carries included.
  Treaty 0.0.19.
- SuperPipeline's board, card, attempt, comment, link and gate reads, and the AgentPod hub's
  roster and station-owner reads, are checked against treaty's `board-read.v1` and
  `capability-catalog.v1`. An answer the contracts refuse is treated as the product being
  unavailable (the card is retried; the roster falls back to its cache, else workspace items only;
  a station link is refused with 502), where before it was read as it came. A roster that lists
  one malformed board id is now refused whole rather than filtered.
- A gate decided `approve_manual` or `approve_automatic` now makes a completed card's outcome
  `approved`, as `approve` does. An `expired` gate reads as closed, and a decision SuperLibrary
  does not know is kept in the work record as recorded and shown as it is, never as an approval.
- The embed bundle is checked against treaty's record of it (`superlibrary-embed.json`): at the
  recorded version it must build to the recorded SHA-256s, so a changed embed needs a new version.
- A SuperPipeline push must carry a valid `x-treaty-signature`: the older
  `X-Superpipeline-Signature` fallback is gone, and a push signed only with it is refused with 401.
  Needs SuperPipeline v0.0.37 or later, which no longer sends the old header.

## v0.0.6 — 2026-11-23

- SuperPipeline's push is read on treaty's delivery contract: `x-treaty-signature` over the
  event's timestamp, id and body is verified, with the older `X-Superpipeline-Signature` as the
  fallback until SuperPipeline stops sending it. Record bodies are checked against treaty's
  `record.v1` (a body that is not, such as one with a non-string card id, is now refused with
  400), and the event list comes from that schema. A push for a board this deployment has not
  mapped yet is answered 503, so SuperPipeline tries again, where it was a 404 that was dropped.
  Treaty 0.0.17.

- Sign-in tokens are checked by the suite's shared verifier (treaty's `verifyAccessToken`), to
  the same rules as every other product. SuperLibrary now refuses a token that lives longer than
  300 s, lacks `mayDispatch` or `mayGrantReach`, carries a `mayDispatch` value that is not a
  principal id, has no `kid`, or carries a conditional claim of the wrong type; and it allows 30 s
  of clock skew on `exp`, `nbf` and `iat` where it allowed none.
- Releases come from the suite's shared release workflow: production deploys only a tag whose
  main CI run passed, the suli binaries come with `SHA256SUMS` and a build-provenance
  attestation, and the release notes carry a summary, this section and the grouped commits.
