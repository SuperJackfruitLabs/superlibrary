import { describe, expect, it } from 'vitest';
import { PATH_REFUSAL_REASONS, checkPath, pathRefusalSentence } from '../src/paths';

describe('checkPath (spec §8 path rules)', () => {
  it('normalises harmless paths', () => {
    expect(checkPath('a.md')).toEqual({ ok: true, path: 'a.md' });
    expect(checkPath('./site//index.html')).toEqual({ ok: true, path: 'site/index.html' });
    expect(checkPath('img/a b#1?.png')).toEqual({ ok: true, path: 'img/a b#1?.png' });
    expect(checkPath('.gitignore')).toEqual({ ok: true, path: '.gitignore' });
    expect(checkPath('docs/.github/workflow.md').ok).toBe(true);
  });

  it('refuses paths that leave the root', () => {
    for (const [p, reason] of [
      ['../x', 'parent'], ['a/../../x', 'parent'], ['a/..', 'parent'],
      ['/etc/passwd', 'absolute'], ['C:/Users/x', 'absolute'], ['a\\b', 'backslash'],
      ['', 'empty'], ['./', 'empty'], ['a\u0000b', 'control_character'], ['x'.repeat(1025), 'too_long'],
    ] as const) {
      expect(checkPath(p)).toMatchObject({ ok: false, reason });
    }
  });

  it('refuses the default denylist wherever it appears in the path', () => {
    for (const p of [
      '.env', '.env.local', 'app/.env.production', '.ssh/id_ed25519', 'home/.ssh/config', '.gnupg/pubring.kbx',
      'certs/server.pem', 'tls/server.KEY', 'keys/id_rsa', 'id_ed25519.pub', '.git/config', 'repo/.git/HEAD',
      '.netrc', '.npmrc', 'pkg/.pypirc', '.aws/credentials', '.azure/accessTokens.json', '.config/gcloud/credentials.db',
      'application_default_credentials.json', '.docker/config.json', '.kube/config', '.git-credentials',
      '.claude/settings.json', '.claude.json', '.codex/auth.json', '.gemini/oauth_creds.json', '.cursor/mcp.json',
      '.config/opencode/auth.json', '.local/share/opencode/auth.json', '.config/goose/config.yaml',
      // Aligned with the AgentPod node's denylist (spec §8)
      '.config/gh/hosts.yml', 'home/.config/gh/hosts.yml', '.bash_history', 'u/.zsh_history', '.python_history', '.node_repl_history',
      '.psql_history', '.mysql_history', 'creds/credentials.json', 'x/auth.json', '.credentials.json',
      '.hermes/config.yaml', 'p/.openclaw/state.json', '.opencode/x', '.pi/agent/auth.json',
    ]) {
      expect(checkPath(p), p).toMatchObject({ ok: false, reason: 'denied' });
    }
  });

  it('still accepts ordinary neighbours of the newly denied names', () => {
    for (const p of ['.config/gh/config.yml', 'docs/history.md', '.config/other/hosts.yml', 'pi/notes.md', 'opencode.md', 'auth.json.md'])
      expect(checkPath(p), p).toMatchObject({ ok: true });
  });

  it('refuses trailing dots and spaces that defeat exact-name and suffix rules', () => {
    // Trailing dots and spaces match secret files on Windows/NTFS
    expect(checkPath('.npmrc.'), '.npmrc.').toMatchObject({ ok: false, reason: 'denied', rule: '.npmrc' });
    expect(checkPath('x.pem '), 'x.pem ').toMatchObject({ ok: false, reason: 'denied', rule: '*.pem' });
    expect(checkPath('.git./config'), '.git./config').toMatchObject({ ok: false, reason: 'denied', rule: '.git/' });
    expect(checkPath('.ssh /k'), '.ssh /k').toMatchObject({ ok: false, reason: 'denied', rule: '.ssh/' });
  });

  it('accepts ordinary names with trailing dots or spaces', () => {
    // Non-secret files are accepted even with trailing dots/spaces
    expect(checkPath('notes.'), 'notes.').toMatchObject({ ok: true });
    expect(checkPath('report .md'), 'report .md').toMatchObject({ ok: true });
  });
});

describe('pathRefusalSentence (one wording for every client: web precheck and suli)', () => {
  it('says why, in a sentence, naming the path as given', () => {
    const say = (p: string) => { const c = checkPath(p); if (c.ok) throw new Error('expected a refusal'); return pathRefusalSentence(c); };
    expect(say('.env')).toBe('.env is not uploaded: it matches the .env* rule.');
    expect(say('../x')).toBe('../x is not uploaded: it leaves the folder.');
    expect(say('/etc/passwd')).toBe('/etc/passwd is not uploaded: it is an absolute path.');
    expect(say('a\\b')).toBe('a\\b is not uploaded: it contains a backslash.');
    expect(say('./')).toBe('./ is not uploaded: it has no name.');
    expect(say('a\u0001b')).toBe('a\u0001b is not uploaded: it contains a control character.');
    expect(say('x'.repeat(1025))).toBe(`${'x'.repeat(1025)} is not uploaded: its path is too long.`);
  });

  it('has a reason for every refusal checkPath can give', () => {
    for (const r of ['empty', 'too_long', 'control_character', 'backslash', 'absolute', 'parent'] as const) expect(PATH_REFUSAL_REASONS[r]).toMatch(/^it/);
  });
});
