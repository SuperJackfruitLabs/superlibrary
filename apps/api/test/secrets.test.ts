import { describe, expect, it } from 'vitest';
import { scanText } from '../src/guard/secrets';

const r = (n: number, c = 'A') => c.repeat(n);
const mixed = (n: number) => Array.from({ length: n }, (_, i) => 'aB3xQ9zK7mP2wR5t'[i % 16]).join('');

describe('scanText (spec §8)', () => {
  it.each([
    ['aws-access-key', 'AK' + 'IA' + 'Q3EGWX5ZJ7KPLM2N'],
    ['aws-secret-key', 'aws_secret_access_key = ' + mixed(40)],
    ['github-token', 'gh' + 'p_' + mixed(36)],
    ['github-token', 'github' + '_pat_' + mixed(70)],
    ['slack-token', 'xo' + 'xb-' + '1234567890-' + mixed(24)],
    ['slack-webhook', 'https://hooks.slack.com/services/' + 'T0123ABCD/B0123ABCD/' + mixed(24)],
    ['anthropic-key', 'sk-' + 'ant-api03-' + mixed(40)],
    ['openai-key', 'sk-' + 'proj-' + mixed(40)],
    ['jwt', 'eyJ' + 'hbGciOiJIUzI1NiJ9' + '.eyJ' + 'zdWIiOiIxMjM0NTY3ODkwIn0' + '.' + mixed(43)],
    ['pem-private-key', '-----BEGIN ' + 'OPENSSH PRIVATE KEY-----'],
    ['pem-private-key', '-----BEGIN ' + 'RSA PRIVATE KEY-----'],
    ['high-entropy-assignment', 'API_TOKEN="' + mixed(32) + '"'],
  ])('%s', (rule, secret) => {
    expect(scanText(`first line\nconst x = 1;\n${secret}\n`)).toContainEqual({ line: 3, rule });
  });

  it('an Anthropic key is reported as Anthropic, not also as OpenAI', () => {
    const f = scanText('sk-' + 'ant-api03-' + mixed(40));
    expect(f.map((x) => x.rule)).toEqual(['anthropic-key']);
  });

  it('counts lines across CRLF, CR and LF, and reports a one-line minified file as line 1', () => {
    expect(scanText('a\r\nb\rc\n' + 'gh' + 'p_' + mixed(36))).toEqual([{ line: 4, rule: 'github-token' }]);
    expect(scanText(r(5000, 'x') + ' ' + 'gh' + 'p_' + mixed(36) + ' ' + r(5000, 'y'))).toEqual([{ line: 1, rule: 'github-token' }]);
  });

  it('does not flag ordinary text, placeholders or public material', () => {
    for (const s of [
      'password = "changeme"',
      'token: ${GITHUB_TOKEN}',
      'API_KEY=your-api-key-here-please',
      'We use sk-ant keys for the model.',
      '-----BEGIN CERTIFICATE-----',
      '-----BEGIN PUBLIC KEY-----',
      'eyJhbGciOiJub25lIn0.eyJzdWIiOiIxIn0.',
      'sha256: ' + 'ab'.repeat(32),
    ]) {
      expect(scanText(s), s).toEqual([]);
    }
  });

  it('never returns the secret itself', () => {
    const secret = 'gh' + 'p_' + mixed(36);
    expect(JSON.stringify(scanText(secret))).not.toContain(secret.slice(4));
  });
});
