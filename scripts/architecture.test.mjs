// The shape of the workspace, held by numbers that may only fall and by rules between its projects
// (docs/code-quality.md). No dependencies: it reads the source as text.
//
// - Imports between projects (apps/*, packages/*) follow PROJECT_EDGES and nothing else: the
//   packages never import an app, and no app imports another app's source.
// - No runtime import cycle between files of a project grows past LARGEST_CYCLE.
// - No file grows past SIZE_LIMIT lines, except as OVERSIZE records.
// Each record also fails when it is stale, so an improvement is locked in where it is made.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SIZE_LIMIT = 1000;

/** Files over SIZE_LIMIT and the most lines each may have. Lower these; never raise them. */
const OVERSIZE = {};
/** Files in the largest runtime import cycle inside a project. Lower it; never raise it. */
const LARGEST_CYCLE = 0;

/**
 * Every import from one project into another, as 'from>to', with why it may exist. Shipped code
 * points down: the apps and the embed and CLI packages import the contract, the web app hosts the
 * embed. A test may reach further to run two Workers together; it is listed as such. Any other
 * edge fails, and so does a listed edge nothing uses any more.
 */
const PROJECT_EDGES = {
  'apps/api>packages/contract': 'the wire types and validators',
  'apps/content>packages/contract': 'the wire types and validators',
  'apps/web>packages/contract': 'the wire types and validators',
  'apps/web>packages/embed': 'the web app renders items with the embed',
  'packages/cli>packages/contract': 'the wire types and validators',
  'packages/embed>packages/contract': 'the wire types and validators',
  'apps/api>apps/content (tests only)': 'two tests run the content Worker beside the API to check a signed URL end to end',
};

/** The web app's import aliases: SvelteKit's $lib and the $kit in apps/web/svelte.config.js. */
const ALIASES = [
  ['$kit', 'apps/web/src/lib/kit'],
  ['$lib', 'apps/web/src/lib'],
];
const SKIP_DIRS = new Set(['node_modules', '.svelte-kit', 'dist', 'build', 'viewer-dist', 'test-results', 'vendor', 'static', '.wrangler', '.wrangler-e2e']);
const EXTENSIONS = ['.ts', '.svelte', '.js', '.mjs'];

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return SKIP_DIRS.has(name) ? [] : files(path);
    return EXTENSIONS.some((e) => name.endsWith(e)) && !name.endsWith('.d.ts') ? [path] : [];
  });
}

/** The workspace's projects, by folder, with the package name each publishes. */
export function projects(root = ROOT) {
  return ['apps', 'packages'].flatMap((group) =>
    readdirSync(join(root, group))
      .filter((name) => existsSync(join(root, group, name, 'package.json')))
      .map((name) => {
        const dir = `${group}/${name}`;
        return { dir, name: JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8')).name };
      }),
  );
}

const byText = (a, b) => a.localeCompare(b);
const isTest = (file) => /(\.test\.|\.spec\.)/.test(file) || /(^|\/)(test|e2e)\//.test(file);

/** Resolve an extensionless relative or aliased specifier to a file the way the bundlers do. */
function resolveFile(base) {
  if (existsSync(base) && statSync(base).isFile()) return base;
  for (const e of ['.ts', '.svelte.ts', '.js', '.svelte', '.mjs', '.d.ts']) if (existsSync(base + e)) return base + e;
  for (const e of ['/index.ts', '/index.js']) if (existsSync(base + e)) return base + e;
  if (base.endsWith('.js') && existsSync(base.slice(0, -3) + '.ts')) return base.slice(0, -3) + '.ts';
  return base;
}

/**
 * Every import in apps/* and packages/*: the file it is in, its target (a workspace file, or a
 * workspace package by name), and whether it loads anything at run time (`import type` and
 * `export type` do not; neither does an import whose names are all `type`).
 */
export function imports(root = ROOT) {
  const found = [];
  for (const { dir } of projects(root)) {
    for (const path of files(join(root, dir))) {
      const text = readFileSync(path, 'utf8');
      const from = relative(root, path);
      const add = (raw, value) => {
        const spec = raw.replace(/\?.*$/, ''); // a Vite query such as ?raw
        let to;
        if (spec.startsWith('.')) to = relative(root, resolveFile(resolve(dirname(path), spec)));
        else if (ALIASES.some(([a]) => spec === a || spec.startsWith(a + '/'))) {
          const [alias, target] = ALIASES.find(([a]) => spec === a || spec.startsWith(a + '/'));
          to = relative(root, resolveFile(join(root, target, spec.slice(alias.length))));
        }
        else if (spec.startsWith('@superlibrary/')) to = spec.split('/').slice(0, 2).join('/');
        else return;
        found.push({ from, to, value });
      };
      for (const m of text.matchAll(/^[ \t]*(import|export)\b(\s+type\b)?((?:(?!^[ \t]*(?:import|export)\b)[^;'"])*?)\bfrom\s*['"]([^'"]+)['"]/gm)) {
        const names = (m[3] ?? '').replace(/[{}]/g, '').split(',').map((n) => n.trim()).filter(Boolean);
        add(m[4], !m[2] && (names.length === 0 || names.some((n) => !n.startsWith('type '))));
      }
      for (const m of text.matchAll(/^[ \t]*import\s*['"]([^'"]+)['"]/gm)) add(m[1], true);
      for (const m of text.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) add(m[1], true);
    }
  }
  return found;
}

/** Which project a workspace file or package name belongs to. */
export function projectOf(target, all) {
  const byName = all.find((p) => p.name === target);
  if (byName) return byName.dir;
  return all.find((p) => target.startsWith(p.dir + '/'))?.dir;
}

/** The edges between projects, as PROJECT_EDGES names them: an edge only tests use is marked so. */
export function projectEdges(found, all) {
  const shipped = new Set();
  const tests = new Set();
  for (const i of found) {
    const a = projectOf(i.from, all);
    const b = projectOf(i.to, all);
    if (!a || !b || a === b) continue;
    (isTest(i.from) ? tests : shipped).add(`${a}>${b}`);
  }
  return [...shipped, ...[...tests].filter((e) => !shipped.has(e)).map((e) => `${e} (tests only)`)].toSorted(byText);
}

/** Strongly connected components with more than one file (Tarjan). */
export function cycles(graph) {
  let next = 0;
  const index = new Map(), low = new Map(), stack = [], onStack = new Set(), found = [];
  const visit = (v) => {
    index.set(v, next);
    low.set(v, next++);
    stack.push(v);
    onStack.add(v);
    for (const w of graph.get(v) ?? []) {
      if (!graph.has(w)) continue;
      if (!index.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v), low.get(w)));
      } else if (onStack.has(w)) low.set(v, Math.min(low.get(v), index.get(w)));
    }
    if (low.get(v) !== index.get(v)) return;
    const component = [];
    let w;
    do {
      w = stack.pop();
      onStack.delete(w);
      component.push(w);
    } while (w !== v);
    if (component.length > 1) found.push(component.toSorted(byText));
  };
  for (const v of graph.keys()) if (!index.has(v)) visit(v);
  return found;
}

/** The file graph of run-time imports. */
export function runtimeGraph(found) {
  const graph = new Map();
  for (const i of found) {
    if (!graph.has(i.from)) graph.set(i.from, []);
    if (i.value && i.to.includes('/')) graph.get(i.from).push(i.to);
  }
  return graph;
}

const all = projects();
const found = imports();

test('projects import each other only along PROJECT_EDGES', () => {
  const edges = projectEdges(found, all);
  assert.deepEqual(edges.filter((e) => !(e in PROJECT_EDGES)), [], 'an import between projects that PROJECT_EDGES does not allow');
  assert.deepEqual(Object.keys(PROJECT_EDGES).filter((e) => !edges.includes(e)), [], 'these edges are gone; remove them from PROJECT_EDGES');
});

test('the packages never import an app, and shipped code never imports another app', () => {
  for (const e of Object.keys(PROJECT_EDGES)) {
    const [a, b] = e.replace(' (tests only)', '').split('>');
    assert.ok(!(a.startsWith('packages/') && b.startsWith('apps/')), `${e}: a package imports an app`);
    if (a.startsWith('apps/') && b.startsWith('apps/')) assert.ok(e.endsWith(' (tests only)'), `${e}: an app's code imports another app`);
  }
});

test('every import resolves inside the workspace', () => {
  const missing = found
    .filter((i) => i.to.includes('/') && !i.to.startsWith('@superlibrary/') && !existsSync(join(ROOT, i.to)))
    .map((i) => `${i.from} -> ${i.to}`);
  const unknown = found.filter((i) => i.to.startsWith('@superlibrary/') && !projectOf(i.to, all)).map((i) => `${i.from} -> ${i.to}`);
  assert.deepEqual([...missing, ...unknown], []);
});

test('no runtime import cycle grows past LARGEST_CYCLE', () => {
  const now = cycles(runtimeGraph(found));
  const largest = Math.max(0, ...now.map((c) => c.length));
  assert.ok(largest <= LARGEST_CYCLE, `the largest import cycle grew to ${largest}: ${JSON.stringify(now)}`);
  assert.equal(largest, LARGEST_CYCLE, 'the largest cycle shrank; lower LARGEST_CYCLE to lock it in');
});

test('no file grows past the size limit', () => {
  const sizes = new Map(
    all.flatMap(({ dir }) => files(join(ROOT, dir))).map((f) => [relative(ROOT, f), readFileSync(f, 'utf8').split('\n').length - 1]),
  );
  const over = [...sizes].filter(([f, n]) => n > (OVERSIZE[f] ?? SIZE_LIMIT)).map(([f, n]) => `${f}: ${n} lines, the limit is ${OVERSIZE[f] ?? SIZE_LIMIT}`);
  assert.deepEqual(over, []);
  const stale = Object.keys(OVERSIZE).filter((f) => (sizes.get(f) ?? 0) < OVERSIZE[f]);
  assert.deepEqual(stale, [], 'these files shrank; lower or remove their OVERSIZE entry');
});

const at = (from, to, value = true) => ({ from, to, value });

test('the rules see what they should', () => {
  const ps = [
    { dir: 'apps/a', name: '@x/a' },
    { dir: 'apps/b', name: '@x/b' },
    { dir: 'packages/c', name: '@x/c' },
  ];
  const sample = [
    at('apps/a/src/x.ts', '@x/c'),
    at('apps/a/test/x.test.ts', 'apps/b/src/index.ts'),
    at('packages/c/src/y.ts', 'apps/a/src/x.ts', false),
    at('apps/a/src/x.ts', 'apps/a/src/y.ts'),
    at('apps/a/src/y.ts', 'apps/a/src/x.ts'),
    at('apps/a/src/y.ts', 'apps/a/src/z.ts'),
    at('apps/a/src/z.ts', 'apps/a/src/y.ts', false),
  ];
  assert.deepEqual(projectEdges(sample, ps), ['apps/a>apps/b (tests only)', 'apps/a>packages/c', 'packages/c>apps/a']);
  assert.deepEqual(cycles(runtimeGraph(sample)), [['apps/a/src/x.ts', 'apps/a/src/y.ts']]);
  const graph = new Map([['a', ['b']], ['b', ['c']], ['c', ['a']], ['d', ['a']]]);
  assert.deepEqual(cycles(graph), [['a', 'b', 'c']]);
});

test('the import reader tells run-time imports from type-only ones', () => {
  const kinds = new Map(found.filter((i) => i.from === 'apps/api/src/indexing/index-item.ts').map((i) => [i.to, i.value]));
  assert.equal(kinds.get('apps/api/src/env.ts'), false, "`import type { Env }` loads nothing");
  assert.equal(kinds.get('apps/api/src/indexing/chunk.ts'), true);
  assert.equal(kinds.get('@superlibrary/contract'), true);
});

test('the import reader follows the web app\'s aliases', () => {
  const page = found.filter((i) => i.from === 'apps/web/src/lib/sections/RecordLine.svelte').map((i) => i.to);
  assert.ok(page.includes('apps/web/src/lib/kit/Button.svelte'), '$kit/Button.svelte');
  assert.ok(found.some((i) => i.to.startsWith('apps/web/src/lib/') && !i.to.startsWith('apps/web/src/lib/kit/') && i.from.startsWith('apps/web/src/routes/')), '$lib');
});

test('ALIASES matches the aliases svelte.config.js declares', () => {
  const config = readFileSync(join(ROOT, 'apps/web/svelte.config.js'), 'utf8');
  const declared = [...(/alias:\s*\{([^}]*)\}/.exec(config)?.[1] ?? '').matchAll(/(\$\w+):\s*'([^']+)'/g)].map((m) => [m[1], `apps/web/${m[2]}`]);
  assert.ok(declared.length > 0, 'svelte.config.js names its aliases in kit.alias');
  assert.deepEqual(declared, ALIASES.filter(([a]) => a !== '$lib'));
});
