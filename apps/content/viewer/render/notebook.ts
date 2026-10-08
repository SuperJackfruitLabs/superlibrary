import type { ViewerData } from '@superlibrary/contract';
import { h, header } from '../dom';
import { highlightBlock, markdownHtml, resolveImages } from './markdown';

type Lines = string | string[] | undefined;
const join = (s: Lines) => (Array.isArray(s) ? s.join('') : typeof s === 'string' ? s : '');
// CSI sequences (colours, cursor moves) that Jupyter keeps in tracebacks and some streams.
const stripAnsi = (s: string) => s.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, '');

interface Output { output_type: string; text?: Lines; data?: Record<string, Lines>; traceback?: string[]; ename?: string; evalue?: string }
interface Cell { cell_type: string; source?: Lines; execution_count?: number | null; outputs?: Output[] }
type Base = Pick<ViewerData, 'path' | 'baseUrl'>;

function markdownBlock(cls: string, src: string, base?: Base): HTMLElement {
  const div = h('div', { class: cls });
  div.innerHTML = markdownHtml(src);
  if (base) resolveImages(div, base);
  for (const code of div.querySelectorAll<HTMLElement>('pre > code')) highlightBlock(code, /\blanguage-([\w+#.-]+)/.exec(code.className)?.[1] ?? null);
  return div;
}

function outputElement(o: Output, base?: Base): HTMLElement {
  if (o.output_type === 'stream') return h('pre', { class: 'out' }, stripAnsi(join(o.text)));
  if (o.output_type === 'error') {
    const tb = (o.traceback ?? []).join('\n');
    return h('pre', { class: 'out error' }, stripAnsi(tb || `${o.ename ?? 'Error'}: ${o.evalue ?? ''}`));
  }
  const data = o.data ?? {};
  for (const type of ['image/png', 'image/jpeg', 'image/gif']) {
    if (data[type]) return h('img', { src: `data:${type};base64,${join(data[type]).replace(/\s+/g, '')}`, alt: 'output' });
  }
  // As an image, so any script in the SVG cannot run (spec §9, SVG).
  if (data['image/svg+xml']) return h('img', { src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(join(data['image/svg+xml']))}`, alt: 'output' });
  if (data['text/markdown']) return markdownBlock('out markdown', join(data['text/markdown']), base);
  // Never as markup: a notebook's HTML output may carry script (spec §9: "never executed").
  if (data['text/html']) return h('div', { class: 'out' }, h('p', { class: 'note' }, 'HTML output, shown as source:'), h('pre', {}, join(data['text/html'])));
  return h('pre', { class: 'out' }, stripAnsi(join(data['text/plain'])));
}

/** Spec §9: cells and their saved outputs. Nothing is executed, and no output is interpreted as HTML. */
export function notebookElements(nb: unknown, base?: Base): HTMLElement[] {
  const book = (nb ?? {}) as { cells?: Cell[]; metadata?: { kernelspec?: { language?: string }; language_info?: { name?: string } } };
  const lang = book.metadata?.kernelspec?.language ?? book.metadata?.language_info?.name ?? 'python';
  if (!Array.isArray(book.cells)) throw new Error('not a Jupyter notebook (nbformat 4): it has no cells');
  return book.cells.map((cell) => {
    const src = join(cell.source);
    if (cell.cell_type === 'markdown') return markdownBlock('cell markdown', src, base);
    if (cell.cell_type !== 'code') return h('pre', { class: 'cell raw' }, src);
    const code = h('code', { class: `language-${lang}` }, src);
    highlightBlock(code, lang);
    return h('div', { class: 'cell code' },
      h('div', { class: 'prompt' }, `In [${cell.execution_count ?? ' '}]:`),
      h('pre', {}, code),
      ...(cell.outputs ?? []).map((o) => outputElement(o, base)));
  });
}

export function renderNotebook(el: HTMLElement, d: ViewerData): void {
  el.replaceChildren(header(d), ...notebookElements(JSON.parse(d.text ?? '{}'), d));
}
