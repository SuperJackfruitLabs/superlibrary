// Writes vibekit's HEAD_SCRIPT into src/app.html between the vk:head markers.
// Run after vendoring a new vibekit: node apps/web/scripts/sync-head-script.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(web, 'package.json'));
// The package root also exports Svelte components, which Node cannot load; this module is plain JS.
const styles = dirname(require.resolve('@superjackfruit/vibekit/tokens.css'));
const { HEAD_SCRIPT } = await import(pathToFileURL(join(styles, '..', 'appearance', 'appearance.js')).href);
const file = join(web, 'src', 'app.html');
const html = readFileSync(file, 'utf8');
const next = html.replace(/<!-- vk:head -->[\s\S]*?<!-- \/vk:head -->/, `<!-- vk:head --><script>${HEAD_SCRIPT}</script><!-- /vk:head -->`);
if (next === html && !html.includes(`<script>${HEAD_SCRIPT}</script>`)) throw new Error('app.html has no <!-- vk:head --> markers');
writeFileSync(file, next);
console.log('app.html: head script in step with vibekit');
