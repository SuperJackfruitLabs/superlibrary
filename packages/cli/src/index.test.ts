/** Runs the real entry point under bun, the runtime `suli` ships on. */
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const suli = (...args: string[]) => spawnSync('bun', [new URL('./index.ts', import.meta.url).pathname, ...args], { encoding: 'utf8', env: { ...process.env, SUPERLIBRARY_URL: 'http://127.0.0.1:1' } });

describe('suli', () => {
  it('an unknown command fails with --help as it does without', () => {
    for (const args of [['nope', '--help'], ['help', 'nope']]) {
      const r = suli(...args);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('unknown command: nope');
    }
    expect(suli('upload', '--help').status).toBe(0);
  });
  it('login reports a network failure as itself, not as a server with no sign-in service', () => {
    const r = suli('login');
    expect(r.status).toBe(1);
    expect(r.stderr).not.toContain('names no sign-in service');
    expect(r.stderr.length).toBeGreaterThan('suli: '.length);
  });
});
