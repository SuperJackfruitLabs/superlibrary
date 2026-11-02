#!/usr/bin/env node
// Type-aware TypeScript lint with a ratchet (docs/code-quality.md).
//
// oxlint runs with oxlint-tsgolint over apps/*, packages/* and scripts/. Rules with existing
// findings are counted in scripts/lint-baseline.json: a count may fall but never rise, a rule
// missing from the baseline must be clean, and an improvement must be locked in.
// `pnpm lint --update` lowers the baseline after a cleanup and refuses to raise it; a rule that
// reaches zero leaves the baseline and must then stay clean.
// SRC_CLEAN rules must have no findings in shipped source (any `src/` file that is not a test),
// whatever the baseline allows in tests and scripts.
//
// Prerequisite: `pnpm install --frozen-lockfile`. The web app's tsconfig extends the one
// `svelte-kit sync` generates, so this script runs that first; without it the type-aware rules
// cannot load the project and report typescript(tsconfig-error), which the baseline does not allow.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = join(root, 'scripts/lint-baseline.json');
const update = process.argv.includes('--update');
const PATHS = ['apps', 'packages', 'scripts'];

const sync = spawnSync(join(root, 'apps/web/node_modules/.bin/svelte-kit'), ['sync'], { cwd: join(root, 'apps/web'), encoding: 'utf8' });
if (sync.error) throw sync.error;
if (sync.status !== 0) {
  process.stderr.write(sync.stderr || sync.stdout);
  process.exit(2);
}

const run = spawnSync(
  join(root, 'node_modules/.bin/oxlint'),
  ['--type-aware', '--format', 'json', ...PATHS],
  { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
);
if (run.error) throw run.error;
let report;
try {
  report = JSON.parse(run.stdout);
} catch {
  process.stderr.write(run.stderr || run.stdout);
  process.exit(2);
}

const findings = report.diagnostics;
const counts = {};
for (const finding of findings) counts[finding.code] = (counts[finding.code] ?? 0) + 1;
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
const where = (f) => {
  const at = f.labels?.[0]?.span;
  return `${f.filename}${at ? ':' + at.line : ''}`;
};

// Shipped source: under a src/ folder, or the content Worker's viewer, and not a test file.
const isSource = (file) =>
  (/(^|\/)src\//.test(file) || file.startsWith('apps/content/viewer/')) &&
  !/(\.test\.|\.spec\.|(^|\/)(__tests__|test)\/)/.test(file);
// Rules shipped source must stay clean of, whatever the baseline allows elsewhere (tests, scripts).
const SRC_CLEAN = new Set([
  'eslint(no-empty)',
  'eslint(no-unsafe-optional-chaining)',
  'eslint(no-unused-vars)',
  'eslint(no-useless-concat)',
  'typescript(await-thenable)',
  'typescript(consistent-type-imports)',
  'typescript(no-explicit-any)',
  'typescript(no-extraneous-class)',
  'typescript(no-non-null-asserted-optional-chain)',
  'typescript(no-unnecessary-template-expression)',
  'typescript(no-unnecessary-type-arguments)',
  'typescript(require-array-sort-compare)',
  'typescript(restrict-template-expressions)',
  'unicorn(no-array-reverse)',
  'unicorn(no-useless-spread)',
  'unicorn(prefer-string-starts-ends-with)',
]);
const unclean = findings.filter((f) => SRC_CLEAN.has(f.code) && isSource(f.filename));
if (unclean.length) {
  for (const f of unclean.slice(0, 40)) console.error(`${f.code}: ${where(f)}  ${f.message}`);
  console.error(`lint: ${unclean.length} findings in shipped source for rules it must keep clean`);
  process.exit(1);
}

const raised = Object.entries(counts).filter(([rule, n]) => n > (baseline[rule] ?? 0));
if (raised.length) {
  for (const [rule, n] of raised) {
    console.error(`${rule}: ${n} findings, the baseline allows ${baseline[rule] ?? 0}`);
    for (const f of findings.filter((x) => x.code === rule).slice(0, 20))
      console.error(`  ${where(f)}  ${f.message}`);
  }
  process.exit(1);
}

const lowered = Object.keys(baseline).filter((rule) => (counts[rule] ?? 0) < baseline[rule]);
if (update) {
  const next = Object.fromEntries(Object.entries(counts).toSorted(([a], [b]) => a.localeCompare(b)));
  writeFileSync(baselinePath, JSON.stringify(next, null, 2) + '\n');
  console.log(`lint baseline: ${findings.length} findings across ${Object.keys(next).length} rules`);
} else if (lowered.length) {
  // A stale baseline would let the count creep back up unnoticed.
  console.error(`lint: ${lowered.join(', ')} improved; run pnpm lint --update to lock it in`);
  process.exit(1);
} else {
  console.log(`lint: ok (${findings.length} findings held by the baseline)`);
}
