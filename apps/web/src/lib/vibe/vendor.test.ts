import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HEAD_SCRIPT, VIBES, contrastRatio, phaseAt } from '@superjackfruit/vibekit';

const WEB = join(import.meta.dirname, '..', '..', '..');
const require = createRequire(import.meta.url);

describe('vibekit is vendored', () => {
  it('its exports resolve', () => {
    expect([...VIBES]).toEqual(['daylight', 'paper', 'studio', 'quiet']);
    expect(HEAD_SCRIPT).toContain('vk_appearance');
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 0);
    expect(phaseAt(new Date(2026, 9, 11, 12, 0))).toBe('noon');
  });

  it('the tarball is the one whose checksum is recorded', () => {
    const tgz = readFileSync(join(WEB, 'vendor', 'vibekit-0.0.12.tgz'));
    const recorded = readFileSync(join(WEB, 'vendor', 'vibekit-0.0.12.tgz.sha256'), 'utf8').trim().split(/\s+/)[0];
    expect(createHash('sha256').update(tgz).digest('hex')).toBe(recorded);
  });

  it('is 0.0.12: the motion module and the skeleton tokens the app uses', async () => {
    const pkg = JSON.parse(readFileSync(join(WEB, 'node_modules', '@superjackfruit', 'vibekit', 'package.json'), 'utf8')) as { version: string };
    expect(pkg.version).toBe('0.0.12');
    const motion = await import('@superjackfruit/vibekit/motion');
    expect(typeof motion.countUp).toBe('function');
  });

  it('ships the stylesheets the app imports', () => {
    for (const f of ['vibekit.css', 'fonts.css', 'tokens.css']) expect(existsSync(require.resolve(`@superjackfruit/vibekit/${f}`)), f).toBe(true);
  });

  it('the retired fonts are gone', () => {
    const pkg = JSON.parse(readFileSync(join(WEB, 'package.json'), 'utf8')) as { dependencies: Record<string, string> };
    expect(pkg.dependencies['@superjackfruit/vibekit']).toBe('file:./vendor/vibekit-0.0.12.tgz');
    expect(Object.keys(pkg.dependencies).filter((d) => d.includes('ibm-plex'))).toEqual([]);
  });
});
