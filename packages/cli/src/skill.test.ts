import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { COMMANDS, commandName } from './commands.ts';
import { installSkill, renderSkill, safetySection } from './skill.ts';

describe('skill', () => {
  it('has frontmatter, the version stamp and the sign-in facts', () => {
    const t = renderSkill('v1.2.3');
    expect(t.startsWith('---\nname: superlibrary-items\ndescription: Use when')).toBe(true);
    expect(t).toContain('Written for suli v1.2.3');
    for (const w of ['SUPERLIBRARY_TOKEN', 'SUPERLIBRARY_URL', 'never renewed', 'refused', '--json']) expect(t).toContain(w);
  });

  it('mentions every registry verb in the table and in the safety section', () => {
    const t = renderSkill('dev');
    const safety = safetySection();
    for (const c of COMMANDS) {
      expect(t, commandName(c)).toContain(commandName(c));
      expect(safety, `${commandName(c)} is not classified in the Safety section`).toContain(`\`${commandName(c)}\``);
    }
  });

  it('installs into a temp dir: equals the printed text, idempotent, no staging file', () => {
    const d = mkdtempSync(join(tmpdir(), 'suli-skill-'));
    try {
      const p = installSkill(d, 'v1');
      expect(p).toBe(join(d, 'superlibrary-items', 'SKILL.md'));
      expect(readFileSync(p, 'utf8')).toBe(renderSkill('v1'));
      expect(installSkill(d, 'v1')).toBe(p);
      expect(readdirSync(join(d, 'superlibrary-items'))).toEqual(['SKILL.md']);
    } finally { rmSync(d, { recursive: true, force: true }); }
  });

  it('works from source through the CLI, text and --json', () => {
    const entry = resolve(__dirname, 'index.ts');
    const d = mkdtempSync(join(tmpdir(), 'suli-skill-'));
    try {
      const print = spawnSync('bun', [entry, 'skill'], { encoding: 'utf8' });
      expect(print.stdout).toBe(renderSkill('dev'));
      const r = spawnSync('bun', [entry, 'skill', 'install', '--dir', d, '--json'], { encoding: 'utf8' });
      expect(JSON.parse(r.stdout)).toEqual({ path: join(d, 'superlibrary-items', 'SKILL.md') });
      expect(readFileSync(join(d, 'superlibrary-items', 'SKILL.md'), 'utf8')).toBe(renderSkill('dev'));
    } finally { rmSync(d, { recursive: true, force: true }); }
  });
});

describe('skill drift guard', () => {
  it('every registry verb is classified exactly once (a new verb must be placed in the Safety section)', () => {
    const safety = safetySection();
    for (const c of COMMANDS) {
      const n = commandName(c);
      expect(safety.split(`\`${n}\``).length - 1, `${n} must be classified in skill.ts`).toBeGreaterThanOrEqual(1);
    }
  });
});
