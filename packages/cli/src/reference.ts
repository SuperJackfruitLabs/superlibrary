/** The published `suli` reference, generated from commands.ts; reference.test.ts fails when it is stale. */
import { COMMANDS, ENV_VARS, GLOBAL_FLAGS, GROUPS, accessLines, commandName, synopsis, type CommandSpec, type FlagSpec } from './commands.ts';

export const REFERENCE_DIR = 'docs/reference/cli';
const GENERATED = '<!-- Generated from packages/cli/src/commands.ts by `pnpm -F @superlibrary/cli reference`. Do not edit by hand: CI fails when this file differs from what the generator writes. -->';
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n+/g, ' ');

function flagTable(flags: FlagSpec[]): string[] {
  return ['| flag | type | default | meaning |', '|---|---|---|---|', ...flags.map((f) => `| \`${cell(f.value ? `${f.name} ${f.value}` : f.name)}\` | ${f.type} | ${cell(f.required ? '**required**' : f.default ?? '—')} | ${cell(f.description)} |`)];
}

function renderCommand(c: CommandSpec): string[] {
  const out = [`## \`${commandName(c)}\``, '', c.description, '', '```sh', synopsis(c), '```', ''];
  if (c.args.length) { out.push('| argument | meaning |', '|---|---|', ...c.args.map((a) => `| \`<${a.name}>\` | ${cell(a.description)}${a.optional ? ' (optional)' : ''} |`), ''); }
  if (c.flags.length) out.push(...flagTable(c.flags), '');
  out.push('**Who may run it**', '', ...accessLines(c.access).map((l) => `- ${l}`), '');
  if (c.routes.length) out.push(`**Calls** ${c.routes.map((r) => `\`${r.method} ${r.path}\``).join(', ')}`, '');
  out.push(`**Prints** ${c.output}.`, '', '**Exit status** `0` on success. `1` when:', '');
  const fails = [...c.fails];
  if (c.routes.some((r) => r.path.startsWith('/api/'))) fails.push('there is no usable credential, or the server refuses it (401) or the act (403), or answers any other error');
  if (fails.length === 0) fails.push('it cannot write its output (never in normal use)');
  out.push(...fails.map((f) => `- ${f}`), '', '**Example**', '', '```sh', ...c.examples, '```', '');
  return out;
}

export function renderReference(): Map<string, string> {
  const pages = new Map<string, string>();
  const index = ['# suli command reference', '', GENERATED, '', '`suli` is Superlibrary from a terminal; `superlibrary` is the same program under its full name.', '', '```sh', 'suli <verb> [<arguments>] [--flags] [--json]', 'suli help <verb>', '```', ''];
  for (const g of GROUPS) {
    index.push(`## ${g.title}`, '', '| command | what it does |', '|---|---|', ...COMMANDS.filter((c) => c.group === g.id).map((c) => `| [\`${commandName(c)}\`](${g.id}.md#${commandName(c).replace(/ /g, '-')}) | ${cell(c.summary)} |`), '');
  }
  index.push('## Flags every command takes', '', ...flagTable(GLOBAL_FLAGS), '', '## Environment', '', '| variable | meaning |', '|---|---|', ...ENV_VARS.map((e) => `| \`${e.name}\` | ${cell(e.description)} |`), '');
  pages.set(`${REFERENCE_DIR}/index.md`, index.join('\n').replace(/\n+$/, '\n'));
  for (const g of GROUPS) {
    const lines = [`# ${g.title}`, '', GENERATED, '', g.intro, ''];
    for (const c of COMMANDS.filter((x) => x.group === g.id)) lines.push(...renderCommand(c));
    pages.set(`${REFERENCE_DIR}/${g.id}.md`, lines.join('\n').replace(/\n+$/, '\n'));
  }
  return pages;
}
