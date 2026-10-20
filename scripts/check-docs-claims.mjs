#!/usr/bin/env node
// The docs and the landing page may only name what the code defines.
//
// superwitness learned this the hard way (internal/docsclaims): a docs page that names a
// route, a tool or a setting the code doesn't have is worse than no page, because a reader
// trusts it. This reads apps/api/src for what exists and fails when a page names:
//   - an /api/v1 route no handler matches (literal paths and the handlers' route regexes),
//   - an MCP tool (library_*) the server does not register,
// and when a docs page has no `title` or `description` in its frontmatter.
//
// Placeholders in a cited route (`{itm}`, `:id`, `{n}`) are replaced with a well-formed id
// for the segment they follow, so `/api/v1/items/{itm}/revoke` is tested exactly as a
// request to it would be.
//
//   node scripts/check-docs-claims.mjs        (CI runs it in the docs job)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const walk = (dir, ext, out = []) => {
  for (const f of readdirSync(dir)) {
    if (f === 'node_modules' || f === 'dist' || f.startsWith('.')) continue;
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, ext, out);
    else if (ext.some((e) => p.endsWith(e))) out.push(p);
  }
  return out;
};

// ---------- what the code defines ----------
const src = walk(join(root, 'apps/api/src'), ['.ts']).map((p) => readFileSync(p, 'utf8')).join('\n');
const literals = new Set([...src.matchAll(/['"`](\/api\/v1\/[A-Za-z0-9/_.-]*)['"`]/g)].map((m) => m[1]));
const patterns = [...src.matchAll(/\/(\^\\\/api\\\/v1.*?\$)\//g)].map((m) => new RegExp(m[1]));
const tools = new Set([...src.matchAll(/registerTool\(\s*'([a-z_]+)'/g)].map((m) => m[1]));
if (!literals.size || !patterns.length || !tools.size) {
  console.error('docs-claims: found nothing to check against in apps/api/src — has the routing changed?');
  process.exit(1);
}

// a well-formed id for the segment a placeholder follows
const SAMPLE = { items: 'itm_0123456789abcdef', library: 'itm_0123456789abcdef', uploads: 'upl_0123456789abcdef', collections: 'col_0123456789abcdef', versions: '1' };
const concrete = (path) => {
  const segs = path.replace(/\/+$/, '').split('/');
  return segs
    .map((s, i) => (/^(\{[^}]+\}|:[a-z]+)$/i.test(s) ? SAMPLE[segs[i - 1]] ?? 'x' : s))
    .join('/');
};
const routeExists = (path) => {
  const p = concrete(path);
  return literals.has(p) || patterns.some((re) => re.test(p));
};

// ---------- what the pages say ----------
const pages = [
  ...walk(join(root, 'docs-site/src/content/docs'), ['.md', '.mdx']),
  ...walk(join(root, 'landing/src/pages'), ['.astro']),
];
const problems = [];
for (const file of pages) {
  const text = readFileSync(file, 'utf8');
  const where = relative(root, file);
  if (file.includes('/content/docs/')) {
    const fm = text.match(/^---\n([\s\S]*?)\n---/);
    if (!fm || !/^title:\s*\S/m.test(fm[1])) problems.push(`${where}: no title in frontmatter`);
    if (!fm || !/^description:\s*\S/m.test(fm[1])) problems.push(`${where}: no description in frontmatter`);
  }
  for (const m of text.matchAll(/\/api\/v1\/[A-Za-z0-9/_.:{}-]*[A-Za-z0-9}]/g)) {
    if (!routeExists(m[0])) problems.push(`${where}: names ${m[0]}, which no handler serves`);
  }
  for (const m of text.matchAll(/\blibrary_[a-z_]+\b/g)) {
    if (!tools.has(m[0])) problems.push(`${where}: names MCP tool ${m[0]}, which the server does not register`);
  }
}

if (problems.length) {
  console.error([...new Set(problems)].join('\n'));
  console.error(`\ndocs-claims: ${new Set(problems).size} problem(s).`);
  process.exit(1);
}
console.log(`docs-claims: ${pages.length} pages agree with the code (${literals.size} routes, ${patterns.length} route patterns, ${tools.size} MCP tools).`);
