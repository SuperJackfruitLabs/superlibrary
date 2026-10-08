import { describe, expect, it } from 'vitest';
import { checkPath } from '../src/paths';

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
    ]) {
      expect(checkPath(p), p).toMatchObject({ ok: false, reason: 'denied' });
    }
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
