/**
 * Every command `suli` has, stated once (Superpipeline's packages/cli/src/commands.ts pattern): the
 * help, the published reference under docs/reference/cli/, and reference.test.ts all read this.
 * The access column is a claim about the SERVER; suli checks no permission itself.
 */
export type FlagType = 'boolean' | 'string' | 'integer' | 'date' | 'path';
export interface FlagSpec { name: string; value?: string; type: FlagType; required?: boolean; default?: string; description: string }
export interface ArgSpec { name: string; description: string; optional?: boolean }
export interface Access { person: 'member' | 'uploader-or-owner' | null; agent: 'refused' | null; note?: string }
export interface Route { method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; path: string }
export type GroupId = 'session' | 'artifacts';
export interface CommandSpec { path: string[]; group: GroupId; args: ArgSpec[]; flags: FlagSpec[]; summary: string; description: string; routes: Route[]; access: Access; output: string; fails: string[]; examples: string[] }
export interface GroupSpec { id: GroupId; title: string; label: string; description: string; intro: string }

export const GROUPS: GroupSpec[] = [
  { id: 'session', title: 'Signing in', label: 'Session', description: 'suli login, logout, whoami, help and version.', intro: 'Signing in through your Super Jackfruit Labs account, and seeing which identity is in force. `help`, `version` and `logout` send no credential anywhere.' },
  { id: 'artifacts', title: 'Artifacts', label: 'Artifacts', description: 'suli upload, get and revoke.', intro: 'Uploading files and folders, reading what is there, and revoking. Every upload passes the path rules, size caps and secret scan before anything is stored.' },
];

const LOCAL: Access = { person: null, agent: null };
const PERSON: Access = { person: 'member', agent: 'refused', note: 'Agents reach Superlibrary from a later release; an agent token is refused today.' };

export const GLOBAL_FLAGS: FlagSpec[] = [
  { name: '--json', type: 'boolean', description: 'Print machine-stable JSON instead of text' },
  { name: '--help', type: 'boolean', description: 'Print this command’s help' },
];

export const COMMANDS: CommandSpec[] = [
  { path: ['help'], group: 'session', args: [{ name: 'verb', description: 'A command to explain', optional: true }], flags: [], summary: 'Every command, or one in full', description: 'Prints the command summary, or one command in full. Sends nothing.', routes: [], access: LOCAL, output: 'help text', fails: ['the verb is unknown'], examples: ['suli help upload'] },
  { path: ['version'], group: 'session', args: [], flags: [], summary: 'The version of suli', description: 'Prints the version, platform and architecture. Sends nothing.', routes: [], access: LOCAL, output: 'one line', fails: [], examples: ['suli version'] },
  { path: ['login'], group: 'session', args: [], flags: [], summary: 'Sign in from this terminal', description: 'Finds the sign-in service from the server (`/.well-known/oauth-protected-resource`) and runs its device flow: open the printed link, confirm the code, and suli keeps a device credential of its own. Every command after that exchanges it for a token that lives five minutes, without a browser.', routes: [{ method: 'GET', path: '/.well-known/oauth-protected-resource' }], access: { person: null, agent: null, note: 'Talks to the sign-in service; sends no credential to Superlibrary.' }, output: 'the link and code, then "Signed in."', fails: ['the server names no sign-in service', 'the code expires or is declined'], examples: ['suli login'] },
  { path: ['logout'], group: 'session', args: [], flags: [], summary: 'Forget this terminal’s credential', description: 'Deletes suli’s device credential and cached token. Sends nothing.', routes: [], access: LOCAL, output: '"Signed out."', fails: [], examples: ['suli logout'] },
  { path: ['whoami'], group: 'session', args: [], flags: [], summary: 'Who you are signed in as', description: 'Shows the person, workspace and role the server sees for your credential.', routes: [{ method: 'GET', path: '/api/v1/me' }], access: PERSON, output: 'principal, workspace and role', fails: [], examples: ['suli whoami'] },
  {
    path: ['upload'], group: 'artifacts', args: [{ name: 'path', description: 'A file or a folder' }],
    flags: [
      { name: '--title', value: '<text>', type: 'string', default: 'the file or folder name', description: 'What the item is called' },
      { name: '--item', value: '<itm_…>', type: 'string', description: 'Upload as a new version of this item' },
      { name: '--board', value: '<brd_…>', type: 'string', description: 'Scope it to a board (visible only to you until board access arrives)' },
      { name: '--entry', value: '<path>', type: 'string', default: 'index.html, then README.md, then the first file', description: 'The file a folder opens on' },
      { name: '--expires', value: '<YYYY-MM-DD>', type: 'date', description: 'Delete it on this date' },
      { name: '--override', value: '<reason>', type: 'string', description: 'Upload despite a secret-scan finding; your reason is recorded' },
    ],
    summary: 'Upload a file or a folder',
    description: 'Checks every path against the rules (no `..`, no paths outside the folder, nothing on the denylist such as `.env*`, `.ssh/`, keys and credential files), checks the sizes (25 MB a file; 100 MB and 500 files a folder), then sends each file and commits. A secret found by the scan refuses the upload, naming the file and line; `--override` uploads it anyway and records your reason.',
    routes: [{ method: 'POST', path: '/api/v1/uploads' }, { method: 'PUT', path: '/api/v1/uploads/:id/files' }, { method: 'POST', path: '/api/v1/uploads/:id/override' }, { method: 'POST', path: '/api/v1/uploads/:id/commit' }],
    access: PERSON, output: 'the item URL (and with --json the item id, version, SHA-256, type and size)',
    fails: ['a path is refused or a size is over its cap', 'the secret scan finds something and --override is not given', 'a symbolic link points outside the folder'],
    examples: ['suli upload report.md', 'suli upload ./site --title "Launch page" --entry index.html', 'suli upload notes.md --item itm_0123456789abcdef'],
  },
  {
    path: ['get'], group: 'artifacts', args: [{ name: 'item', description: 'The item id (itm_…)' }],
    flags: [{ name: '--embed', type: 'boolean', description: 'Also mint a 5-minute signed viewer URL' }, { name: '--version', value: '<n>', type: 'integer', description: 'The version for --embed' }],
    summary: 'Show an item and its versions', description: 'Shows the item, its provenance and its versions. With `--embed`, also mints a signed viewer URL for one version, which works for five minutes (and is recorded as a view).',
    routes: [{ method: 'GET', path: '/api/v1/items/:id' }, { method: 'POST', path: '/api/v1/items/:id/embed' }],
    access: PERSON, output: 'the item and its versions', fails: ['the item does not exist or you cannot see it (404)', 'it is revoked or expired (410)'], examples: ['suli get itm_0123456789abcdef', 'suli get itm_0123456789abcdef --embed --version 2'],
  },
  {
    path: ['revoke'], group: 'artifacts', args: [{ name: 'item', description: 'The item id (itm_…)' }],
    flags: [{ name: '--version', value: '<n>', type: 'integer', description: 'Revoke only this version' }, { name: '--reason', value: '<text>', type: 'string', description: 'Why; recorded' }],
    summary: 'Revoke an item or one version', description: 'Revokes at once: a viewer URL already handed out stops working immediately. Only the uploader or an owner of the workspace may.',
    routes: [{ method: 'POST', path: '/api/v1/items/:id/revoke' }, { method: 'POST', path: '/api/v1/items/:id/versions/:n/revoke' }],
    access: { ...PERSON, person: 'uploader-or-owner' }, output: '"Revoked."', fails: ['you are not the uploader or an owner (403)'], examples: ['suli revoke itm_0123456789abcdef --reason "posted by mistake"', 'suli revoke itm_0123456789abcdef --version 2'],
  },
];

export const ENV_VARS: Array<{ name: string; description: string }> = [
  { name: 'SUPERLIBRARY_TOKEN', description: 'a person’s token, used exactly as supplied and never renewed' },
  { name: 'SUPERLIBRARY_URL', description: 'the server (default https://app.superlibrary.dev)' },
  { name: 'XDG_CONFIG_HOME', description: 'Linux: the config directory credentials live under' },
  { name: 'APPDATA', description: 'Windows: the config directory credentials live under' },
];

export const commandName = (c: CommandSpec) => `suli ${c.path.join(' ')}`;

export function synopsis(c: CommandSpec): string {
  const args = c.args.map((a) => (a.optional ? `[<${a.name}>]` : `<${a.name}>`));
  const flags = c.flags.map((f) => { const body = f.value ? `${f.name} ${f.value}` : f.name; return f.required ? body : `[${body}]`; });
  return [commandName(c), ...args, ...flags].join(' ');
}

export function findCommands(words: string[]): CommandSpec[] {
  return COMMANDS.filter((c) => c.path[0] === words[0]);
}

const plain = (s: string) => s.replace(/`/g, '');
const ACCESS_TEXT = { member: 'a member of the workspace', 'uploader-or-owner': 'the person who uploaded it, or an owner of the workspace' } as const;

export function accessLines(a: Access): string[] {
  if (a.person === null && a.agent === null) return [a.note ?? 'Local: sends no credential to Superlibrary.'];
  const out: string[] = [];
  if (a.person) out.push(`A person: ${ACCESS_TEXT[a.person]}.`);
  if (a.agent === 'refused') out.push('An agent token: refused.');
  if (a.note) out.push(a.note);
  return out;
}

export function renderUsage(): string {
  const lines = ['suli — Superlibrary from a terminal', ''];
  for (const g of GROUPS) {
    lines.push(`${g.title}:`);
    for (const c of COMMANDS.filter((x) => x.group === g.id)) lines.push(`  ${commandName(c).padEnd(16)} ${plain(c.summary)}`);
    lines.push('');
  }
  lines.push('  --json              machine-stable output, on any command', '  suli help <verb>    one command in full (or: suli <verb> --help)', '', `Credential, first found wins: $SUPERLIBRARY_TOKEN, then suli login's cached token, then its device credential.`, 'Exit status: 0 on success, 1 otherwise.');
  return lines.join('\n');
}

export function renderCommandHelp(c: CommandSpec): string {
  const lines = [plain(synopsis(c)), '', plain(c.description), ''];
  if (c.args.length) { lines.push('Arguments:'); for (const a of c.args) lines.push(`  <${a.name}>`.padEnd(20) + plain(a.description)); lines.push(''); }
  if (c.flags.length) { lines.push('Flags:'); for (const f of c.flags) lines.push(`  ${f.value ? `${f.name} ${f.value}` : f.name}`.padEnd(30) + plain(f.description) + (f.default ? `. Default: ${plain(f.default)}.` : '')); lines.push(''); }
  lines.push('Who may run it:', ...accessLines(c.access).map((l) => `  ${plain(l)}`), '', 'Examples:', ...c.examples.map((e) => `  ${e}`));
  return lines.join('\n');
}
