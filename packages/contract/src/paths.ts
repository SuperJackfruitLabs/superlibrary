/**
 * Spec §8 path rules, one implementation for every client and the server. The server is the
 * authority (it checks every declared path); clients call this to refuse early with the same words.
 * A zip is expanded client-side (plan D16), so its entries reach here as ordinary paths; a symlink
 * entry is refused by the client before it is ever declared.
 */
export type PathRefusal = 'empty' | 'too_long' | 'control_character' | 'backslash' | 'absolute' | 'parent' | 'denied';
export type PathCheck = { ok: true; path: string } | { ok: false; path: string; reason: PathRefusal; rule?: string };

const lower = (s: string) => s.toLowerCase().replace(/[. ]+$/, '');
const anySeg = (pred: (s: string) => boolean) => (segs: string[]) => segs.some((s) => pred(lower(s)));
const dirSeg = (name: string) => (segs: string[]) => segs.slice(0, -1).some((s) => lower(s) === name);
const base = (pred: (s: string) => boolean) => (segs: string[]) => pred(lower(segs[segs.length - 1]!));
const sub = (...parts: string[]) => (segs: string[]) => {
  const l = segs.map(lower);
  for (let i = 0; i + parts.length <= l.length; i++) if (parts.every((p, j) => l[i + j] === p)) return true;
  return false;
};

/** Each harness's own config, session and token files. Aligned with the AgentPod node's list (apps/node-agent descriptor/artifact.go); keep the two in step, stricter only. */
const HARNESS = [
  dirSeg('.claude'), base((b) => b === '.claude.json'), dirSeg('.codex'), dirSeg('.gemini'), dirSeg('.cursor'),
  dirSeg('.hermes'), dirSeg('.openclaw'), dirSeg('.opencode'), dirSeg('.pi'), base((b) => b === 'auth.json' || b === '.credentials.json'),
  sub('.config', 'opencode'), sub('.local', 'share', 'opencode'), sub('.config', 'goose'),
];

/** Shell and REPL history, which routinely hold pasted secrets (spec §8; mirrors the AgentPod node's list). */
const SHELL_HISTORY = new Set(['.bash_history', '.zsh_history', '.python_history', '.node_repl_history', '.psql_history', '.mysql_history']);

export const DENIED_RULES: ReadonlyArray<{ rule: string; test: (segments: string[]) => boolean }> = [
  { rule: '.env*', test: anySeg((s) => s.startsWith('.env')) },
  { rule: '.ssh/', test: dirSeg('.ssh') },
  { rule: '.gnupg/', test: dirSeg('.gnupg') },
  { rule: '*.pem', test: base((b) => b.endsWith('.pem')) },
  { rule: '*.key', test: base((b) => b.endsWith('.key')) },
  { rule: 'id_*', test: base((b) => b.startsWith('id_')) },
  { rule: '.git/', test: dirSeg('.git') },
  { rule: '.netrc', test: base((b) => b === '.netrc') },
  { rule: '.npmrc', test: base((b) => b === '.npmrc') },
  { rule: '.pypirc', test: base((b) => b === '.pypirc') },
  { rule: '.config/gh/hosts.yml', test: sub('.config', 'gh', 'hosts.yml') },
  { rule: 'shell history', test: base((b) => SHELL_HISTORY.has(b)) },
  { rule: '.git-credentials', test: base((b) => b === '.git-credentials') },
  { rule: 'cloud credentials', test: (s) => dirSeg('.aws')(s) || dirSeg('.azure')(s) || dirSeg('.kube')(s) || sub('.config', 'gcloud')(s) || sub('.docker', 'config.json')(s) || base((b) => b === 'application_default_credentials.json' || b === 'credentials.json')(s) },
  { rule: 'harness files', test: (s) => HARNESS.some((t) => t(s)) },
];

export function checkPath(raw: string): PathCheck {
  if (raw.length > 1024) return { ok: false, path: raw, reason: 'too_long' };
  if (/[\u0000-\u001f\u007f]/.test(raw)) return { ok: false, path: raw, reason: 'control_character' };
  if (raw.includes('\\')) return { ok: false, path: raw, reason: 'backslash' };
  if (raw.startsWith('/') || /^[A-Za-z]:/.test(raw)) return { ok: false, path: raw, reason: 'absolute' };
  const parts = raw.split('/');
  if (parts.includes('..')) return { ok: false, path: raw, reason: 'parent' };
  const segments = parts.filter((s) => s !== '' && s !== '.');
  if (segments.length === 0) return { ok: false, path: raw, reason: 'empty' };
  const hit = DENIED_RULES.find((r) => r.test(segments));
  if (hit) return { ok: false, path: raw, reason: 'denied', rule: hit.rule };
  return { ok: true, path: segments.join('/') };
}

/** Why a path is refused, for every refusal but `denied` (which names its rule). */
export const PATH_REFUSAL_REASONS: Readonly<Record<Exclude<PathRefusal, 'denied'>, string>> = {
  parent: 'it leaves the folder',
  absolute: 'it is an absolute path',
  backslash: 'it contains a backslash',
  empty: 'it has no name',
  control_character: 'it contains a control character',
  too_long: 'its path is too long',
};

/** The one sentence every client shows for a refused path, so the web app and `suli` say the same. */
export function pathRefusalSentence(c: { path: string; reason: PathRefusal; rule?: string }): string {
  const why = c.reason === 'denied' ? `it matches the ${c.rule} rule` : PATH_REFUSAL_REASONS[c.reason];
  return `${c.path} is not uploaded: ${why}.`;
}
