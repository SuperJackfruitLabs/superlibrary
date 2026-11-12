# SuperLibrary: notes for agents

Start with [`README.md`](README.md) and [`docs/code-quality.md`](docs/code-quality.md), which hold the layout, the lint ratchet and the architecture tests. This repository is public: no private hosts, credentials or internal links.

## Things agents get wrong

- **Run what CI runs before pushing.** Read `.github/workflows/ci.yml`: `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `node --test scripts/ci-workflow.test.mjs`, `node --test scripts/architecture.test.mjs`, and the e2e job rather than guessing; the commands are there.
- **Snapshots and goldens pass in a bare environment and on Linux.** Run them under `env -i PATH="$PATH" HOME="$HOME" CI=true pnpm test`. Normalise platform strings (OS, arch) and `COLORTERM` in the test instead of recording your machine's.
- **Count lint baselines on a clean install** (`pnpm install --frozen-lockfile`), never on a tree with stray packages or a stale build.
- **No skipped tests.** Never `.skip`, `.only` or delete a red test to get green; fix it, or say in the PR why it is red.
- **Characterization test first.** Before a refactor that touches behaviour, commit a test against the old code and prove it can fail (revert the code, watch it go red).
- **Check the PR is still open before pushing to its branch.** PRs are often merged within minutes, and a push to a merged branch strands the work.
- **Never rerun main-branch CI jobs.** A rerun on `main` re-queues `deploy-staging`. Rerun PR runs only.
- **A `v*` tag deploys production** through the suite's shared release workflow (`.github/workflows/release.yml` and `.github/release/`, synced byte-identical from the suite's release kit: change them there, never here; settings in `.github/release-config.json`, scripts in `deploy/release/`), after it finds main's `ci.yml` run passed for that commit. It builds the suli binaries at the tag, deploys the API (migrations first), content and web, smokes production and publishes the release. Write user-visible changes under `## Unreleased` in `CHANGELOG.md`. Only the operator tags.
- **`pnpm lint` needs `svelte-kit sync`**, which `scripts/lint.mjs` runs first. Run the script, not `oxlint` directly, or the type-aware rules see missing types.
- **The Claude CI files are synced copies.** `.github/claude/claude-ci.mjs` and the `claude-review`/`claude-triage` workflows come from the suite's shared kit; change them there, not here. The advisory PR review follows [`REVIEW.md`](REVIEW.md).

