/**
 * The agent skill, built into the binary: the text is generated from the command registry
 * (commands.ts), so it is the verbs this binary actually has, in a form that works from source and
 * inside `bun build --compile` alike (no file to bundle or to go missing).
 */
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { COMMANDS, GLOBAL_FLAGS, commandName, type CommandSpec } from './commands.ts';

export const SKILL_NAME = 'superlibrary-items';

const READ_ONLY = new Set(['help', 'version', 'whoami', 'get', 'search', 'collect list', 'collect show']);
const LOCAL_ONLY = new Set(['login', 'logout']);
const SHARED = new Set(['upload', 'revoke', 'collect create', 'collect add', 'collect remove', 'scope']);

const flagText = (c: CommandSpec) => c.flags.map((f) => (f.value ? `${f.name} ${f.value}` : f.name)).join(', ') || '-';
const argText = (c: CommandSpec) => c.args.map((a) => (a.optional ? `[${a.name}]` : `<${a.name}>`)).join(' ');

/** One line per verb, by what it can change. Every registry verb must appear here (skill.test.ts). */
export function safetySection(): string {
  const key = (c: CommandSpec) => c.path.join(' ');
  const names = (pred: (k: string) => boolean) => COMMANDS.filter((c) => pred(key(c))).map(commandName);
  const read = names((k) => READ_ONLY.has(k));
  const local = names((k) => LOCAL_ONLY.has(k));
  const skillLine = '`suli skill` prints this skill and changes nothing; `suli skill install` writes one file under the skills directory.';
  const shared = names((k) => SHARED.has(k));
  return [
    '## Safety',
    '',
    `- Read-only (change nothing, safe to run freely): ${read.map((n) => `\`${n}\``).join(', ')}.`,
    `- Change only this machine (a credential or a file): ${local.map((n) => `\`${n}\``).join(', ')}.`,
    `- ${skillLine}`,
    `- Change shared state: ${shared.map((n) => `\`${n}\``).join(', ')}. \`suli upload\` creates an item other people in the workspace can see; \`suli revoke\` withdraws one at once, and viewer links already handed out stop working.`,
    '',
    'An agent must ask its operator before running any command that changes shared state (above all `suli upload` and `suli revoke`) unless its task explicitly grants it. Never print, log or paste a token.',
  ].join('\n');
}

export function renderSkill(version: string): string {
  const rows = COMMANDS.map((c) => `| \`${commandName(c)}${argText(c) ? ' ' + argText(c) : ''}\` | ${flagText(c)} | ${c.summary} |`);
  return `---
name: ${SKILL_NAME}
description: Use when an agent needs to store, fetch or revoke items (artifacts such as files, reports and sites) in Superlibrary with the suli command line. Covers signing in, uploading, getting and revoking items, and what is safe to run unasked.
---

# Superlibrary items with suli

Written for suli ${version}. If \`suli version\` reports a different version, run \`suli skill\` for the text that matches it.

\`suli\` (also installed as \`superlibrary\`) stores, fetches and revokes items in Superlibrary, Super Jackfruit Labs' library of artifacts.

## Signing in

- \`suli login\` runs the device flow: open the printed link in any browser and confirm the code. It works over SSH.
- \`SUPERLIBRARY_TOKEN\` in the environment is used exactly as given and is never renewed; when it expires, commands fail until it is replaced.
- \`SUPERLIBRARY_URL\` points suli at a different server.
- Agent tokens are refused today. An agent needs its operator's signed-in person credential, so ask the operator to run \`suli login\` (or supply a token) rather than trying to work around the refusal.
- \`suli whoami\` shows which identity is in force. Never print a token.

## Verbs

| Command | Flags | What it does |
| --- | --- | --- |
${rows.join('\n')}

Every verb also takes ${GLOBAL_FLAGS.map((f) => `\`${f.name}\``).join(' and ')}; \`--json\` prints machine-stable JSON, so use it when you parse the output. \`suli help <verb>\` explains one verb in full.

${safetySection()}
`;
}

/** Writes <dir>/superlibrary-items/SKILL.md, staged in the same directory and renamed into place. */
export function installSkill(dir: string | null, version: string): string {
  const root = resolve(dir ?? join(homedir(), '.claude', 'skills'));
  const target = join(root, SKILL_NAME, 'SKILL.md');
  mkdirSync(dirname(target), { recursive: true });
  const staged = `${target}.incoming.${process.pid}`;
  writeFileSync(staged, renderSkill(version));
  renameSync(staged, target);
  return target;
}
