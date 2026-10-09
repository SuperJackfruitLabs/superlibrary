import { expect, test } from '@playwright/test';
import { frameOf, uploadViaApi, watchContainment } from './helpers';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR4nGP4z8DwHwyBNAMDACKlBPylyd9TAAAAAElFTkSuQmCC', 'base64');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
function wav(): Buffer {
  const data = Buffer.alloc(800);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(8000, 24);
  h.writeUInt32LE(8000, 28); h.writeUInt16LE(1, 32); h.writeUInt16LE(8, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

type Frame = ReturnType<typeof frameOf>;
/** A drawn diagram with no `javascript:` link anywhere in it (Mermaid runs strict, whatever the file asks). */
async function diagramWithoutScriptLinks(f: Frame) {
  await expect(f.locator('figure.diagram svg')).toBeVisible({ timeout: 15_000 });
  await expect(f.locator('[href^="javascript:" i], [*|href^="javascript:" i]')).toHaveCount(0);
  expect(await f.locator('figure.diagram').evaluate((el) => el.innerHTML.toLowerCase().includes('javascript:'))).toBe(false);
}

const cases: Array<[string, { path: string; body: string | Buffer }[], (f: Frame) => Promise<void>]> = [
  ['Markdown with a table, a task list and a Mermaid block', [{ path: 'r.md', body: '| a | b |\n|---|---|\n| 1 | 2 |\n\n- [x] done\n\n```mermaid\ngraph TD; A-->B;\n```\n' }],
    async (f) => { await expect(f.locator('table')).toBeVisible(); await expect(f.locator('input[type=checkbox]')).toBeVisible(); await expect(f.locator('figure.diagram svg')).toBeVisible({ timeout: 15_000 }); }],
  ['a Mermaid click with a javascript: link, without the link', [{ path: 'click.md', body: '```mermaid\ngraph TD\n  A[Click me] --> B\n  click A href "javascript:alert(1)"\n```\n' }],
    diagramWithoutScriptLinks],
  ['a Mermaid file that asks for securityLevel loose, still strict', [{ path: 'loose.mmd', body: '%%{init: {"securityLevel":"loose"}}%%\ngraph TD\n  A[Click me] --> B\n  click A href "javascript:alert(1)"\n' }],
    diagramWithoutScriptLinks],
  ['code, highlighted', [{ path: 'a.ts', body: 'export const x: number = 1;\n' }], async (f) => { await expect(f.locator('code.hljs .hljs-keyword').first()).toBeVisible(); }],
  ['CSV as a table', [{ path: 'd.csv', body: 'n,name\n1,a\n2,b\n' }], async (f) => { await expect(f.locator('tbody tr')).toHaveCount(2); }],
  ['JSON as a tree', [{ path: 'd.json', body: '{"a":{"b":[1,2]}}' }], async (f) => { await expect(f.locator('.tree')).toBeVisible(); }],
  ['a PNG', [{ path: 'p.png', body: PNG }], async (f) => { await expect.poll(() => f.locator('img.zoomable').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(2); }],
  ['SVG as an image', [{ path: 's.svg', body: '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4"/></svg>' }],
    async (f) => { await expect.poll(() => f.locator('img.zoomable').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(4); }],
  ['a PDF', [{ path: 'p.pdf', body: PDF }], async (f) => { await expect(f.locator('.pdf canvas')).toHaveCount(1, { timeout: 15_000 }); }],
  ['Graphviz', [{ path: 'g.dot', body: 'digraph { a -> b }' }], async (f) => { await expect(f.locator('figure.diagram svg')).toBeVisible({ timeout: 15_000 }); }],
  ['a Graphviz node whose URL is javascript:, without the link', [{ path: 'u.dot', body: 'digraph { a [URL="javascript:alert(1)"]; b [URL="https://example.com/"]; a -> b }' }],
    async (f) => { await diagramWithoutScriptLinks(f); await expect(f.locator('figure.diagram a[href="https://example.com/"], figure.diagram a[*|href="https://example.com/"]')).toHaveCount(1); }],
  ['a notebook', [{ path: 'n.ipynb', body: JSON.stringify({ nbformat: 4, metadata: {}, cells: [{ cell_type: 'code', source: 'print(1)', execution_count: 1, outputs: [{ output_type: 'stream', text: '1\n' }] }] }) }],
    async (f) => { await expect(f.locator('.cell.code')).toBeVisible(); }],
  ['audio', [{ path: 'a.wav', body: wav() }], async (f) => { await expect(f.locator('audio[controls]')).toBeVisible(); }],
  ['an Office file as a download card', [{ path: 'a.docx', body: Buffer.from('PK\u0003\u0004....word/document.xml') }], async (f) => { await expect(f.locator('.card')).toContainText('wordprocessingml'); }],
  ['a multi-file HTML app: its own module script and CSS load (plan D2)', [
    { path: 'index.html', body: '<!doctype html><link rel="stylesheet" href="style.css"><p id="t">waiting</p><script type="module" src="app.js"></script>' },
    { path: 'style.css', body: '#t { color: rgb(1, 2, 3); }' },
    { path: 'app.js', body: 'document.getElementById("t").textContent = "ran";' },
  ], async (f) => { await expect(f.locator('#t')).toHaveText('ran'); await expect(f.locator('#t')).toHaveCSS('color', 'rgb(1, 2, 3)'); }],
];

for (const [name, files, check] of cases) {
  test(`renders ${name}`, async ({ page, request }) => {
    const item = await uploadViaApi(request, files, { title: name });
    const watch = await watchContainment(page, item.itemId);
    await page.goto(`/a/${item.itemId}`);
    await check(frameOf(page));
    await watch.expectContained();
  });
}

test('the frame grows to its content, and the toolbar links are right', async ({ page, request }) => {
  const item = await uploadViaApi(request, [{ path: 'long.md', body: Array.from({ length: 300 }, (_, i) => `Line ${i}\n`).join('\n') }]);
  await page.goto(`/a/${item.itemId}`);
  const frame = page.locator('iframe.sl-frame');
  await expect.poll(async () => (await frame.boundingBox())!.height).toBeGreaterThan(480);
  await expect(page.locator('a.sl-open')).toHaveAttribute('href', `http://localhost:5173/a/${item.itemId}`);
  await expect(page.locator('a.sl-download')).toHaveAttribute('href', /\/s\/[^/]+\/long\.md\?download=1$/);
  await expect(page.locator('.sl-version')).toHaveText('v1');
});
