// Run after `astro build`: the shared frame must be in the built HTML, the old masthead gone.
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const fails = [];
for (const tag of ['<sjl-suite-bar', '<sjl-product-header', '<sjl-claims', '<sjl-footer']) {
  if (!html.includes(tag)) fails.push(`missing ${tag}`);
}
if (/<header class/.test(html.replace(/<template[\s\S]*?<\/template>/g, ''))) fails.push('old masthead <header class> still present');
if (/<body[^>]*>\s*<header>/.test(html)) fails.push('old masthead <header> still present');
if (html.includes('x-sjl-preview')) fails.push('x-sjl-preview present');
if (html.includes('id="theme"')) fails.push('old theme toggle present');
if (fails.length) { console.error('check-frame FAIL\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('check-frame PASS');
