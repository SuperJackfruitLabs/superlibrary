/**
 * Spec §8 secret scan. Line-based, so a refusal can name the file and line; never returns what
 * matched. PEM: private-key blocks only — a certificate or a public key is not a secret.
 */
export type SecretRule =
  | 'aws-access-key' | 'aws-secret-key' | 'github-token' | 'slack-token' | 'slack-webhook'
  | 'openai-key' | 'anthropic-key' | 'jwt' | 'pem-private-key' | 'high-entropy-assignment';
export interface Finding { line: number; rule: SecretRule }

const RULES: Array<[SecretRule, RegExp]> = [
  ['aws-access-key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['aws-secret-key', /aws_?secret_?access_?key["']?\s*[:=]\s*["']?[A-Za-z0-9/+=]{40}(?![A-Za-z0-9/+=])/i],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/],
  ['slack-token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ['slack-webhook', /https:\/\/hooks\.slack\.com\/services\/[A-Z0-9]+\/[A-Z0-9]+\/[A-Za-z0-9]+/],
  ['anthropic-key', /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ['openai-key', /\bsk-(?!ant-)(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}/],
  ['jwt', /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{16,}/],
  ['pem-private-key', /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/],
];

const ASSIGNMENT = /\b[A-Za-z0-9_]*(?:secret|token|passw(?:or)?d|api_?key|apikey|access_?key|private_?key|client_?secret)[A-Za-z0-9_]*["']?\s*[:=]\s*["']?([A-Za-z0-9+/_=.-]{20,})/gi;

/** Shannon entropy in bits per character. */
function entropy(s: string): number {
  const counts = new Map<string, number>();
  for (const c of s) counts.set(c, (counts.get(c) ?? 0) + 1);
  let h = 0;
  for (const n of counts.values()) h -= (n / s.length) * Math.log2(n / s.length);
  return h;
}

function highEntropyAssignment(line: string): boolean {
  for (const m of line.matchAll(ASSIGNMENT)) {
    const value = m[1]!;
    // A word-only value with dashes ("your-api-key-here") is a placeholder, not a secret.
    if (/^[a-z-]+$/i.test(value)) continue;
    if (entropy(value) >= 3.5) return true;
  }
  return false;
}

export function scanText(text: string): Finding[] {
  const out: Finding[] = [];
  text.split(/\r\n|\r|\n/).forEach((line, i) => {
    for (const [rule, re] of RULES) if (re.test(line)) out.push({ line: i + 1, rule });
    const named = out.some((f) => f.line === i + 1);
    if (!named && highEntropyAssignment(line)) out.push({ line: i + 1, rule: 'high-entropy-assignment' });
  });
  return out;
}
