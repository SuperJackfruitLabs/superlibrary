/**
 * The command table, held to the switch it describes and to the pages generated from it
 * (Superpipeline's packages/cli/src/reference.test.ts): a verb or flag the switch handles with no
 * entry, an entry the switch never reads, or committed pages that differ from what renders today.
 * Regenerate: `pnpm -F @superlibrary/cli reference`.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { COMMANDS, ENV_VARS, GLOBAL_FLAGS, findCommands, renderCommandHelp, renderUsage } from './commands.ts';
import { REFERENCE_DIR, renderReference } from './reference.ts';
import { VALUELESS } from './args.ts';

const SRC = import.meta.dirname;
const REPO = join(SRC, '..', '..', '..');
const source = readFileSync(join(SRC, 'index.ts'), 'utf8');

function arms(): Array<{ verbs: string[]; subs: Set<string>; flags: Set<string> }> {
  const start = source.indexOf('  switch (cmd) {');
  const end = source.indexOf('    default:', start);
  expect(start, "main's switch was not found").toBeGreaterThan(0);
  const body = source.slice(start, end);
  const runs = [...body.matchAll(/((?:^ {4}case [^\n]+:[^\n]*\n)+)/gm)];
  return runs.map((m, i) => {
    const text = body.slice(m.index! + m[0].length, i + 1 < runs.length ? runs[i + 1]!.index : body.length);
    return {
      verbs: [...m[1]!.matchAll(/case "([^"]+)":/g)].map((x) => x[1]!),
      subs: new Set([...text.matchAll(/\bsub [!=]== "([a-z-]+)"/g)].map((x) => x[1]!)),
      flags: new Set([...text.matchAll(/(?:\bflags?\(rest, |rest\.includes\()"(--[a-z-]+)"/g)].map((x) => x[1]!)),
    };
  });
}
const HELP_ALIASES = new Set(['-h', '--help']);

describe('the command table matches the switch', () => {
  it('parses the switch at all — a guard on the guard', () => {
    const verbs = arms().flatMap((a) => a.verbs);
    expect(verbs).toContain('upload');
    expect(arms().find((a) => a.verbs.includes('upload'))!.flags).toContain('--override');
  });
  it('has an entry for every verb the switch dispatches, and no other', () => {
    const dispatched = new Set<string>();
    for (const arm of arms()) for (const verb of arm.verbs) {
      if (HELP_ALIASES.has(verb)) continue;
      if (arm.subs.size === 0) dispatched.add(verb);
      for (const sub of arm.subs) dispatched.add(`${verb} ${sub}`);
    }
    const documented = new Set(COMMANDS.map((c) => c.path.join(' ')));
    expect([...dispatched].filter((v) => !documented.has(v))).toEqual([]);
    expect([...documented].filter((v) => !dispatched.has(v))).toEqual([]);
  });
  it('documents exactly the flags each verb reads', () => {
    const global = new Set(GLOBAL_FLAGS.map((f) => f.name));
    for (const arm of arms()) for (const verb of arm.verbs) {
      if (HELP_ALIASES.has(verb)) continue;
      const read = [...arm.flags].filter((f) => !global.has(f)).sort();
      const documented = [...new Set(COMMANDS.filter((c) => c.path[0] === verb).flatMap((c) => c.flags.map((f) => f.name)))].sort();
      expect(documented, `suli ${verb}`).toEqual(read);
    }
  });
  it('treats every boolean flag as valueless, and nothing else', () => {
    const booleans = new Set([...GLOBAL_FLAGS, ...COMMANDS.flatMap((c) => c.flags)].filter((f) => f.type === 'boolean').map((f) => f.name));
    expect([...VALUELESS].sort()).toEqual([...booleans].sort());
  });
  it('renders help for every command, reachable by its own words', () => {
    for (const c of COMMANDS) {
      expect(c.examples.every((e) => e.startsWith('suli '))).toBe(true);
      expect(findCommands(c.path)).toContain(c);
      expect(renderCommandHelp(c)).toContain(`suli ${c.path.join(' ')}`);
      expect(renderUsage()).toContain(`suli ${c.path.join(' ')}`);
    }
  });
  it('documents every environment variable it reads, and only those', () => {
    const names = new Set<string>();
    for (const f of readdirSync(SRC).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))) {
      const text = readFileSync(join(SRC, f), 'utf8');
      for (const m of text.matchAll(/export const ENV_[A-Z_]+ = "([A-Z_]+)"/g)) names.add(m[1]!);
      for (const m of text.matchAll(/process\.env\.([A-Z_]+)/g)) names.add(m[1]!);
    }
    expect(ENV_VARS.map((e) => e.name).sort()).toEqual([...names].sort());
  });
});

describe('the published reference', () => {
  const pages = renderReference();
  const dir = join(REPO, REFERENCE_DIR);
  if (process.env.UPDATE_REFERENCE === '1') {
    rmSync(dir, { recursive: true, force: true });
    for (const [rel, text] of pages) { mkdirSync(dirname(join(REPO, rel)), { recursive: true }); writeFileSync(join(REPO, rel), text); }
  }
  it('is committed exactly as the generator writes it', () => {
    for (const [rel, text] of pages) {
      expect(existsSync(join(REPO, rel)), `${rel} is missing — run pnpm -F @superlibrary/cli reference`).toBe(true);
      expect(readFileSync(join(REPO, rel), 'utf8'), `${rel} is stale — run pnpm -F @superlibrary/cli reference`).toBe(text);
    }
  });
  it('holds no page the generator does not write', () => {
    expect(readdirSync(dir).map((f) => `${REFERENCE_DIR}/${f}`).filter((f) => !pages.has(f))).toEqual([]);
  });
});
