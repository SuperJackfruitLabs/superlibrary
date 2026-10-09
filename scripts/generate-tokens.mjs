// scripts/generate-tokens.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderSuite, renderTokens } from './tokens.mjs';

const root = join(import.meta.dirname, '..');
const source = readFileSync(join(root, 'design/tokens.toml'), 'utf8');
for (const [file, text] of [['apps/web/src/lib/kit/tokens.css', renderTokens(source)], ['apps/web/src/lib/kit/suite.generated.ts', renderSuite(source)]]) {
  writeFileSync(join(root, file), text);
  console.log(`wrote ${file}`);
}
