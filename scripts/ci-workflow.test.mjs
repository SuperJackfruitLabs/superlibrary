// The deploy shape is a gate decision: main deploys staging only, a v* tag deploys production, and
// production waits on main's own CI run for the tagged commit. Text-level checks, no deps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../.github/workflows/${f}`, import.meta.url), 'utf8');
// Top-level job blocks: "  name:" at two-space indent up to the next one.
const jobs = (src) => {
  const body = src.slice(src.indexOf('\njobs:\n'));
  const out = {};
  for (const m of body.matchAll(/^ {2}([a-z][a-z0-9-]*):\n([\s\S]*?)(?=^ {2}[a-z][a-z0-9-]*:\n|(?![\s\S]))/gm)) out[m[1]] = m[2];
  return out;
};
const ci = jobs(read('ci.yml'));
const rel = read('release.yml');

test('main deploys staging only, never production', () => {
  for (const name of ['deploy-api', 'deploy-content', 'deploy-web']) assert.equal(ci[name], undefined, `${name} is back in ci.yml`);
  assert.doesNotMatch(read('ci.yml'), /CLOUDFLARE_API_TOKEN|environment: \{ name: (production|content|web)\b/);
  assert.match(ci['deploy-staging'], /needs: \[test\]/);
  assert.match(ci['deploy-staging'], /github\.ref == 'refs\/heads\/main'/);
});

test('the job names production gates on still exist in ci.yml', () => {
  assert.ok(ci.test && ci.e2e);
});

test('the app jobs skip only on a landing- or docs-only change, as ci.yml plans it', () => {
  const plan = ci.changes;
  assert.ok(plan, 'the changes job is gone');
  assert.match(plan, /dorny\/paths-filter@[0-9a-f]{40}/);
  assert.match(plan, /predicate-quantifier: every/);
  assert.match(plan, /- '\*\*'\n\s+- '!landing\/\*\*'\n\s+- '!docs-site\/\*\*'/);
  // the workflows themselves, and every trigger other than push and pull_request, run it all
  assert.match(plan, /- '\.github\/\*\*'/);
  assert.match(plan, /case "\$EVENT" in push\|pull_request\) ;; \*\) app=true ;; esac/);
  for (const n of ['test', 'e2e']) assert.match(ci[n], /needs: \[changes\]\n\s+if: needs\.changes\.outputs\.app == 'true'/, n);
  assert.match(ci.landing, /if: needs\.changes\.outputs\.landing == 'true'/);
  assert.match(ci.docs, /if: needs\.changes\.outputs\.docs == 'true'/);
});

// A v* tag runs the suite's shared release workflow (synced, byte-identical); what is particular to
// SuperLibrary is .github/release-config.json and the scripts it names in deploy/release/.
const config = JSON.parse(readFileSync(new URL('../.github/release-config.json', import.meta.url), 'utf8'));
const script = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('a v* tag runs the shared release workflow, gated on main CI', () => {
  assert.match(rel, /tags: \['v\*'\]/);
  assert.match(rel, /git merge-base --is-ancestor "\$SHA" origin\/main/);
  assert.match(rel, /actions\/workflows\/\$wf\/runs\?head_sha=\$SHA&branch=main&status=success/);
  // the gate requires ci.yml's whole run; a landing- or docs-only commit's run passes with its app jobs skipped
  assert.equal(config.ci_workflow, 'ci.yml');
  assert.equal(config.product, 'SuperLibrary');
});

test('the CLI binaries are built at the tag, stamped and checked', () => {
  assert.equal(config.build_at_tag, true);
  assert.deepEqual(config.assets, ['dist/suli-*', 'scripts/install.sh']);
  const build = script(config.build_command.replace(/^sh /, ''));
  for (const t of ['darwin-arm64', 'darwin-x64', 'linux-x64', 'linux-arm64']) assert.ok(build.includes(t), `no ${t} build`);
  assert.match(build, /--define SULI_VERSION="\\"\$TAG\\""/);
  assert.match(build, /\.\/dist\/suli-linux-x64 version/);
});

test('production deploys in the old order, with migrations first', () => {
  assert.deepEqual(config.secrets, ['CLOUDFLARE_API_TOKEN']);
  const d = script(config.deploy);
  const at = (needle) => {
    const i = d.indexOf(needle);
    assert.ok(i > 0, `deploy lacks ${needle}`);
    return i;
  };
  const migrate = at('@superlibrary/api db:migrate');
  const api = at('@superlibrary/api run deploy');
  const content = at('@superlibrary/content run deploy');
  const web = at('pages deploy');
  assert.ok(migrate < api && api < web, 'migrations, then the API, then web');
  assert.ok(content > 0);
  assert.match(d, /--project-name=superlibrary-web --branch=main/);
});

test('the test job runs the lint ratchet and the architecture test', () => {
  assert.match(ci.test, /- run: pnpm lint\n/);
  assert.match(ci.test, /- run: node --test scripts\/architecture\.test\.mjs\n/);
});

test('production smoke covers health, auth, html and discovery', () => {
  const s = script(config.smoke.script);
  for (const p of ['/api/health', '/api/v1/me', '= 401', '<html', '/.well-known/oauth-protected-resource', 'https://accounts.superjackfruit.com'])
    assert.ok(s.includes(p), `smoke lacks ${p}`);
});
