import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { oneLine } from './args.ts';
import { refused } from './artifacts.ts';

describe('what reaches stderr', () => {
  it('a refusal carrying ESC and a newline in body.path comes out as one clean line', async () => {
    const res = Response.json({ error: 'path_refused', path: 'a\x1b[31m\nsuli: forged\x07', rule: 'r' }, { status: 422 });
    const msg = await refused(res, 'the upload').catch((e: Error) => e.message);
    const line = oneLine(msg);
    expect(line).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/);
    expect(line).toContain('a [31m suli: forged');
  });
  it('fail() writes its message through oneLine', () => {
    expect(readFileSync(join(import.meta.dirname, 'index.ts'), 'utf8')).toContain('suli: ${oneLine(message)}');
  });
});
