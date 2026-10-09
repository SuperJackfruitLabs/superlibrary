/**
 * Where `suli` gets a person's token: $SUPERLIBRARY_TOKEN as supplied, else `suli login`'s cached
 * token while it has 30 s left, else its device credential exchanged at the plane recorded at login
 * (issuer contract §3.2). Files are written atomically, mode 0600.
 */
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DEVICE_CREDENTIAL, exchangeDevice, type PlaneTarget } from './plane-login.ts';

export const ENV_TOKEN = "SUPERLIBRARY_TOKEN";
export const ENV_BASE = "SUPERLIBRARY_URL";
export const DEFAULT_BASE = 'https://app.superlibrary.dev';

export function baseUrl(env: Record<string, string | undefined> = process.env): string {
  return (env[ENV_BASE] || DEFAULT_BASE).replace(/\/+$/, '');
}

export function configDir(platform: NodeJS.Platform = process.platform): string {
  if (platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'superlibrary');
  if (platform === 'win32') {
    if (!process.env.APPDATA) throw new Error('APPDATA is not set; cannot locate suli credentials.');
    return join(process.env.APPDATA, 'superlibrary');
  }
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'superlibrary');
}

export interface Device { credential: string; plane: string; audience: string }

function writePrivate(dir: string, name: string, value: unknown): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const staging = mkdtempSync(join(dir, '.suli-'));
  try {
    const tmp = join(staging, 'f.json');
    writeFileSync(tmp, JSON.stringify(value), { mode: 0o600 });
    renameSync(tmp, join(dir, name));
    chmodSync(join(dir, name), 0o600);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

const readJson = <T>(path: string): T | null => { try { return JSON.parse(readFileSync(path, 'utf8')) as T; } catch { return null; } };

export function saveDevice(d: Device, dir = configDir()): void {
  writePrivate(dir, 'device.json', d);
  rmSync(join(dir, 'token.json'), { force: true });
}
const isUrl = (v: unknown): v is string => { try { return typeof v === 'string' && !!new URL(v); } catch { return false; } };

/** The saved device credential, or null when there is none or the file is not one `suli login` wrote. */
export function loadDevice(dir = configDir()): Device | null {
  const d = readJson<Partial<Device>>(join(dir, 'device.json'));
  return d && typeof d.credential === 'string' && DEVICE_CREDENTIAL.test(d.credential) && isUrl(d.plane) && isUrl(d.audience) ? (d as Device) : null;
}
export function clearCredentials(dir = configDir()): void {
  rmSync(join(dir, 'device.json'), { force: true });
  rmSync(join(dir, 'token.json'), { force: true });
}

export interface TokenDeps {
  env?: Record<string, string | undefined>;
  dir?: string;
  /** The server the token will be sent to; defaults to $SUPERLIBRARY_URL. A device credential is only sent to its own audience. */
  base?: string;
  device?: Device | null;
  now?: () => number;
  exchange?: (t: PlaneTarget, credential: string) => Promise<{ token: string; expiresIn: number }>;
}

export function tokenSource(deps: TokenDeps = {}): { kind: 'env' | 'device' | 'none'; token(): Promise<string | null> } {
  const env = deps.env ?? process.env;
  const fixed = env[ENV_TOKEN];
  if (fixed) return { kind: 'env', token: async () => fixed };
  const dir = deps.dir ?? configDir();
  const device = deps.device === undefined ? loadDevice(dir) : deps.device;
  if (!device) return { kind: 'none', token: async () => null };
  const now = deps.now ?? Date.now;
  const exchange = deps.exchange ?? ((t, c) => exchangeDevice(t, c));
  return {
    kind: 'device',
    async token() {
      const base = deps.base ?? baseUrl(env);
      if (new URL(base).origin !== new URL(device.audience).origin) throw new Error(`You are signed in for ${device.audience}, not ${base}. Run suli login.`);
      const cached = readJson<{ token: string; expiresAt: number }>(join(dir, 'token.json'));
      if (cached && cached.expiresAt - now() > 30_000) return cached.token;
      const { token, expiresIn } = await exchange({ plane: device.plane, audience: device.audience }, device.credential);
      writePrivate(dir, 'token.json', { token, expiresAt: now() + expiresIn * 1000 });
      return token;
    },
  };
}
