import { mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { configDir, loadDevice, saveDevice, tokenSource } from './credential.ts';

describe('configDir', () => {
  it('follows the configuration directory rules of each platform', () => {
    expect(configDir('darwin')).toMatch(/Library\/Application Support\/superlibrary$/);
    expect(configDir('linux')).toMatch(/superlibrary$/);
  });
});

describe('tokenSource', () => {
  const dir = () => mkdtempSync(join(tmpdir(), 'suli-'));
  it('an environment token is used as supplied and never renewed', async () => {
    const exchange = vi.fn();
    const src = tokenSource({ env: { SUPERLIBRARY_TOKEN: 'env-token' }, dir: dir(), exchange, now: () => 0 });
    expect(src.kind).toBe('env');
    expect(await src.token()).toBe('env-token');
    expect(exchange).not.toHaveBeenCalled();
  });
  it('a device credential is exchanged, cached, and exchanged again when the cached token is under 30 s from expiry', async () => {
    let t = 0;
    let n = 0;
    const exchange = vi.fn(async () => ({ token: `tok${++n}`, expiresIn: 300 }));
    const d = dir();
    const src = tokenSource({ env: {}, base: 'https://app.test', dir: d, exchange, now: () => t, device: { credential: 'dev_00000000000000000000:' + 'a'.repeat(43), plane: 'https://accounts.test', audience: 'https://app.test' } });
    expect(src.kind).toBe('device');
    expect(await src.token()).toBe('tok1');
    t = 200_000;
    expect(await src.token()).toBe('tok1');
    t = 280_000;
    expect(await src.token()).toBe('tok2');
    expect(exchange).toHaveBeenCalledTimes(2);
  });
  it('with nothing, there is no token', async () => {
    expect(await tokenSource({ env: {}, dir: dir(), exchange: vi.fn(), now: () => 0 }).token()).toBeNull();
  });
  const device = { credential: 'dev_00000000000000000000:' + 'a'.repeat(43), plane: 'https://accounts.test', audience: 'https://app.test' };
  it('signing in again drops the cached token, so the next call exchanges the new credential', async () => {
    let n = 0;
    const exchange = vi.fn(async () => ({ token: `tok${++n}`, expiresIn: 300 }));
    const d = dir();
    writeFileSync(join(d, 'token.json'), JSON.stringify({ token: 'old', expiresAt: 10 ** 12 }));
    saveDevice(device, d);
    expect(await tokenSource({ env: {}, base: 'https://app.test', dir: d, exchange, now: () => 0 }).token()).toBe('tok1');
    expect(exchange).toHaveBeenCalledTimes(1);
  });
  it('credential files are readable by their owner only (0600)', async () => {
    const d = dir();
    saveDevice(device, d);
    await tokenSource({ env: {}, base: 'https://app.test', dir: d, exchange: async () => ({ token: 't', expiresIn: 300 }), now: () => 0 }).token();
    for (const f of ['device.json', 'token.json']) expect(statSync(join(d, f)).mode & 0o777).toBe(0o600);
  });
  it('a device credential is never sent to a server other than the one it was issued for', async () => {
    const exchange = vi.fn(async () => ({ token: 't', expiresIn: 300 }));
    const src = tokenSource({ env: {}, base: 'https://evil.test', dir: dir(), exchange, now: () => 0, device });
    await expect(src.token()).rejects.toThrow('You are signed in for https://app.test, not https://evil.test. Run suli login.');
    expect(exchange).not.toHaveBeenCalled();
    expect(await tokenSource({ env: { SUPERLIBRARY_TOKEN: 'mine' }, base: 'https://evil.test', dir: dir(), exchange, now: () => 0, device }).token()).toBe('mine');
  });
  it('a malformed device.json is treated as not signed in', () => {
    const d = dir();
    for (const bad of [{ credential: 'x', plane: 'https://a.test', audience: 'https://b.test' }, { credential: device.credential, plane: 'not a url', audience: 'https://b.test' }, { credential: device.credential }, 'str']) {
      writeFileSync(join(d, 'device.json'), JSON.stringify(bad));
      expect(loadDevice(d)).toBeNull();
    }
    saveDevice(device, d);
    expect(loadDevice(d)).toEqual(device);
  });
});
