# Code quality checks

Two checks hold the shape of the code. Each records how the code looks now and fails if it gets
worse. Each also fails if it gets **better** and the record is not lowered in the same change, so
a stale record cannot let the next regression through. CI runs both in the `test` job.

## Lint: `pnpm lint`

[oxlint](https://oxc.rs) `1.88.0` with `oxlint-tsgolint` `7.0.2004`, both pinned exactly in the
root `package.json`. tsgolint type-checks with its own TypeScript-Go, so it does not depend on the
repo's TypeScript version. Configuration: [`.oxlintrc.json`](../.oxlintrc.json). Script:
[`scripts/lint.mjs`](../scripts/lint.mjs).

- **Covers** `apps/*`, `packages/*` and `scripts/`: `.ts`, `.js`, `.mjs`, and the script blocks of
  `.svelte` files (the typed rules see `.ts` only). Left out: build output, the vendored vibekit,
  static assets, build and test-runner config files, the landing site and the docs site.
- **Rules:** the `correctness` and `suspicious` categories, plus floating and misused promises,
  `await` of a non-promise, exhaustive `switch` (a `default` counts), type-only imports, no
  `any`, no `!` non-null assertion, no empty block (an empty `catch` included), and no `console`
  outside scripts, tests and the CLI (whose output is the console).
- **The ratchet.** Findings are counted per rule in
  [`scripts/lint-baseline.json`](../scripts/lint-baseline.json). A count may fall but never rise,
  and a rule not in the baseline must be clean. After a cleanup, `pnpm lint --update` writes the
  lower counts (it refuses to raise one); lint fails until you do.
- **Shipped source stays clean** of the rules in `SRC_CLEAN` in `scripts/lint.mjs`, whatever the
  baseline allows in tests and scripts. Shipped means under a `src/` folder, or the content
  Worker's `viewer/`, and not a test. There are 16 such rules, among them `any`, unused code, empty
  blocks, type-only imports written as values, and `await` of a non-promise.
- **Before running it:** `pnpm install --frozen-lockfile`. The script runs `svelte-kit sync` in
  `apps/web` itself, because the web app's tsconfig extends the generated one.

Most of the baseline is `!` assertions and unchecked type assertions, and most of those are in
tests. They are held, not cleared: rewriting them wholesale risks changing behaviour. Lower them
in code you touch.

A finding is fixed, not hidden. Where a rule is wrong about a line, disable it for that line only,
with the reason: `// oxlint-disable-next-line <rule> -- <why>`.

## Architecture: `node --test scripts/architecture.test.mjs`

[`scripts/architecture.test.mjs`](../scripts/architecture.test.mjs) reads `apps/*` and
`packages/*` as text, with no dependencies. It holds:

- **The direction between projects** (`PROJECT_EDGES`). Shipped code points down: the API, the
  content Worker, the web app, the embed and the CLI import `@superlibrary/contract`; the web app
  imports `@superlibrary/embed`. The contract imports no other project. The packages never import
  an app, and no app's code imports another app; two API tests run the content Worker beside the
  API to check a signed URL end to end, and that edge is listed as tests only. Any other edge
  fails, and so does a listed edge nothing uses any more.
- **No runtime import cycle** between files (`LARGEST_CYCLE`, 0). Type-only imports do not count.
- **No file over 1,000 lines** (`OVERSIZE`, empty).
- That every relative, `$lib`, `$kit` and `@superlibrary/*` import resolves, and that its list of
  the web app's aliases matches `apps/web/svelte.config.js`.

When a number falls, the test names it; lower the recorded value in the same change. Never raise
one to make a change fit: split the file or break the edge instead. A cycle is broken by moving the
shared piece down into its own file, as indexing did: `indexing/index-item.ts` indexes one item,
and both the queue consumer and the re-index pages import it.

## Practices

- **Characterize before restructuring.** Before code moves, pin what it does that no test pins (its
  exports, what it does end to end), commit the pin on its own against the old code, and see each
  new test fail against a change planted in the old code. A test that cannot fail proves nothing.
- **Move, then fix.** A move copies code verbatim and exports only what crosses the new boundary.
  Behaviour changes go in their own change.
- **Tests hold in a bare environment and on Linux.** Run them with
  `env -i PATH="$PATH" HOME="$HOME" CI=true` before pushing.
