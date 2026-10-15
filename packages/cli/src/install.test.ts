/**
 * scripts/install.sh, run for real against a local server that serves a fake release layout.
 * The binary is a tiny shell script named for this host's platform; what is under test is the
 * installer's guards (verify before install, refuse otherwise, atomic replace), not the binary.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, lstatSync, mkdtempSync, readFileSync, readlinkSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const INSTALLER = resolve(__dirname, '..', '..', '..', 'scripts', 'install.sh');
const os = process.platform === 'darwin' ? 'darwin' : 'linux';
const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
const ASSET = `suli-${os}-${arch}`;

const fake = (v: string, skill = false) =>
  skill
    ? `#!/bin/sh\nif [ "$1" = skill ] && [ "$2" = install ]; then mkdir -p "$4/superlibrary-items"; echo "SKILL ${v}" > "$4/superlibrary-items/SKILL.md"; exit 0; fi\necho "suli ${v} ${os}/${arch}"\n`
    : `#!/bin/sh\nif [ "$1" = skill ]; then echo "suli: unknown command: skill" >&2; exit 1; fi\necho "suli ${v} ${os}/${arch}"\n`;
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

let server: Server;
let files: Record<string, string>;
let base: string;
const dirs: string[] = [];

beforeEach(async () => {
  files = {};
  server = createServer((req, res) => {
    const body = files[(req.url ?? '').slice(1)];
    if (body === undefined) { res.statusCode = 404; res.end('no'); } else res.end(body);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterEach(async () => {
  await new Promise((r) => server.close(r));
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function release(v: string, opts: { sums?: boolean; digest?: string; asset?: boolean; skill?: boolean } = {}) {
  const bin = fake(v, opts.skill);
  if (opts.asset !== false) files[ASSET] = bin;
  if (opts.sums !== false) files['SHA256SUMS'] = `${opts.digest ?? sha(bin)}  ${ASSET}\nffff  suli-other-arch\n`;
}

function binDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'suli-bin-'));
  dirs.push(d);
  return d;
}

// Async: the server lives in this process, so a sync spawn would deadlock the curl inside the script.
function run(bin: string, extra: Record<string, string> = {}): Promise<{ status: number; stdout: string; stderr: string }> {
  return new Promise((done) => {
    const p = spawn(INSTALLER, [], { env: { ...process.env, BIN_DIR: bin, SULI_RELEASE_BASE: base, ...extra } });
    let stdout = '', stderr = '';
    p.stdout.on('data', (c) => (stdout += c));
    p.stderr.on('data', (c) => (stderr += c));
    p.on('close', (status) => done({ status: status ?? -1, stdout, stderr }));
  });
}

describe('install.sh', () => {
  it('installs suli and the superlibrary symlink and prints the version', async () => {
    release('v1.0.0');
    const bin = binDir();
    const r = await run(bin);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(`Installed suli v1.0.0 ${os}/${arch}`);
    expect(r.stdout).toContain('Next: suli login (one sign-in; approve the code in any browser, works over SSH)');
    expect(r.stdout).toContain('PATH');
    expect(lstatSync(join(bin, 'suli')).mode & 0o111).not.toBe(0);
    expect(lstatSync(join(bin, 'superlibrary')).isSymbolicLink()).toBe(true);
    expect(resolve(bin, readlinkSync(join(bin, 'superlibrary')))).toBe(join(bin, 'suli'));
  });

  it('refuses a download whose checksum does not match, and installs nothing', async () => {
    release('v1.0.0', { digest: 'a'.repeat(64) });
    const bin = binDir();
    const r = await run(bin);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('checksum');
    expect(existsSync(join(bin, 'suli'))).toBe(false);
    expect(existsSync(join(bin, 'superlibrary'))).toBe(false);
  });

  it('refuses a release with no SHA256SUMS', async () => {
    release('v1.0.0', { sums: false });
    const bin = binDir();
    const r = await run(bin);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('SHA256SUMS');
    expect(existsSync(join(bin, 'suli'))).toBe(false);
  });

  it('refuses when the release has no asset for this platform', async () => {
    release('v1.0.0', { asset: false });
    const bin = binDir();
    const r = await run(bin);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain(ASSET);
    expect(existsSync(join(bin, 'suli'))).toBe(false);
  });

  it('refuses when SHA256SUMS has no digest for this platform', async () => {
    release('v1.0.0');
    files['SHA256SUMS'] = `${'b'.repeat(64)}  suli-other-arch\n`;
    const bin = binDir();
    const r = await run(bin);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('no digest');
    expect(existsSync(join(bin, 'suli'))).toBe(false);
  });

  it('refuses a different file already at suli, and leaves it alone', async () => {
    release('v1.0.0');
    const bin = binDir();
    writeFileSync(join(bin, 'suli'), "someone else's program");
    const r = await run(bin);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('refusing to overwrite');
    expect(readFileSync(join(bin, 'suli'), 'utf8')).toBe("someone else's program");
    expect(existsSync(join(bin, 'superlibrary'))).toBe(false);
  });

  it('refuses a different file already at superlibrary, installing nothing', async () => {
    release('v1.0.0');
    const bin = binDir();
    writeFileSync(join(bin, 'superlibrary'), "someone else's program");
    const r = await run(bin);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('superlibrary already exists');
    expect(readFileSync(join(bin, 'superlibrary'), 'utf8')).toBe("someone else's program");
    expect(existsSync(join(bin, 'suli'))).toBe(false);
  });

  it('with SKILL_DIR, installs the skill using the fresh binary', async () => {
    release('v1.0.0', { skill: true });
    const bin = binDir(), sk = binDir();
    const r = await run(bin, { SKILL_DIR: sk });
    expect(r.status).toBe(0);
    expect(readFileSync(join(sk, 'superlibrary-items', 'SKILL.md'), 'utf8')).toBe('SKILL v1.0.0\n');
  });

  it('with SKILL_DIR and an old binary without the verb, notes it and still succeeds', async () => {
    release('v1.0.0');
    const bin = binDir(), sk = binDir();
    const r = await run(bin, { SKILL_DIR: sk });
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('no skill verb');
    expect(existsSync(join(sk, 'superlibrary-items'))).toBe(false);
  });

  it('does not touch an existing install when the new download fails verification', async () => {
    release('v1.0.0');
    const bin = binDir();
    await run(bin);
    release('v2.0.0', { digest: 'c'.repeat(64) });
    const r = await run(bin);
    expect(r.status).not.toBe(0);
    expect(readFileSync(join(bin, 'suli'), 'utf8')).toBe(fake('v1.0.0'));
  });

  it('upgrades on re-run, leaving no staging file behind', async () => {
    release('v1.0.0');
    const bin = binDir();
    await run(bin);
    release('v2.0.0');
    const r = await run(bin);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Installed suli v2.0.0');
    expect(readFileSync(join(bin, 'suli'), 'utf8')).toBe(fake('v2.0.0'));
    expect(readFileSync(join(bin, 'superlibrary'), 'utf8')).toBe(fake('v2.0.0'));
    expect(readdirSync(bin).sort()).toEqual(['suli', 'superlibrary']);
  });
});
