// The deploy shape is a gate decision: main deploys staging only, a v* tag deploys production, and
// production waits on main's own CI (test + e2e) for the tagged commit. Text-level checks, no deps.
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
const release = jobs(rel);

test('main deploys staging only, never production', () => {
  for (const name of ['deploy-api', 'deploy-content', 'deploy-web']) assert.equal(ci[name], undefined, `${name} is back in ci.yml`);
  assert.doesNotMatch(read('ci.yml'), /CLOUDFLARE_API_TOKEN|environment: \{ name: (production|content|web)\b/);
  assert.match(ci['deploy-staging'], /needs: \[test\]/);
  assert.match(ci['deploy-staging'], /github\.ref == 'refs\/heads\/main'/);
});

test('the job names production gates on still exist in ci.yml', () => {
  assert.ok(ci.test && ci.e2e);
});

test('a v* tag deploys production behind the main-CI gate', () => {
  assert.match(rel, /tags:\s*\n\s*- 'v\*'/);
  const gate = release['production-gate'];
  assert.match(gate, /merge-base --is-ancestor "\$sha" origin\/main/);
  assert.match(gate, /workflows\/ci\.yml\/runs\?event=push&branch=main&head_sha=\$SHA/);
  assert.match(gate, /\.name == "test" or \.name == "e2e"/);
  assert.match(gate, /"\$ok" = 2/);
  assert.match(gate, /actions: read/);
});

test('deploys keep the old order, environments, concurrency and migrations', () => {
  const d = (n) => release[n];
  assert.match(d('deploy-api'), /needs: \[production-gate\]/);
  assert.match(d('deploy-content'), /needs: \[production-gate\]/);
  assert.match(d('deploy-web'), /needs: \[production-gate, deploy-api\]/);
  assert.match(d('smoke-production'), /needs: \[deploy-api, deploy-content, deploy-web\]/);
  assert.match(d('deploy-api'), /environment: \{ name: production,/);
  assert.match(d('deploy-content'), /environment: \{ name: content \}/);
  assert.match(d('deploy-web'), /environment: \{ name: web,/);
  for (const n of ['deploy-api', 'deploy-content', 'deploy-web']) {
    assert.match(d(n), new RegExp(`concurrency: \\{ group: ${n}, cancel-in-progress: false \\}`));
    assert.match(d(n), /ref: '\$\{\{ needs\.production-gate\.outputs\.sha \}\}'/);
  }
  const api = d('deploy-api');
  assert.ok(api.indexOf('db:migrate') > 0 && api.indexOf('db:migrate') < api.indexOf('run deploy'), 'migrations precede the API deploy');
});

test('the CLI release and the app deploy are independent', () => {
  assert.doesNotMatch(release.release, /needs:/);
  assert.doesNotMatch(release['production-gate'], /needs:/);
});

test('production smoke covers health, auth, html and discovery', () => {
  const s = release['smoke-production'];
  for (const p of ['/api/health', '/api/v1/me', '= 401', '<html', '/.well-known/oauth-protected-resource', 'https://accounts.superjackfruit.com'])
    assert.ok(s.includes(p), `smoke lacks ${p}`);
});
