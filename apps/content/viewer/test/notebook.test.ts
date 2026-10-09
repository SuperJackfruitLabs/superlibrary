import { describe, expect, it } from 'vitest';
import { notebookElements } from '../render/notebook';

const nb = {
  nbformat: 4,
  metadata: { kernelspec: { language: 'python' } },
  cells: [
    { cell_type: 'markdown', source: ['# Title\n', 'text'] },
    { cell_type: 'code', execution_count: 3, source: 'print(1)', outputs: [
      { output_type: 'stream', name: 'stdout', text: ['1\n'] },
      { output_type: 'display_data', data: { 'image/png': 'iVBORw0KGgo=\n', 'text/plain': ['<Figure>'] } },
      { output_type: 'execute_result', data: { 'text/html': ['<script>alert(1)</script><b>x</b>'] } },
      { output_type: 'error', ename: 'ValueError', evalue: 'bad', traceback: ['\u001b[31mValueError\u001b[0m: bad'] },
    ] },
  ],
};

describe('notebooks: cells and saved outputs, never executed', () => {
  it('renders markdown cells, highlighted code with its count, and outputs', () => {
    const root = document.createElement('div');
    root.append(...notebookElements(nb));
    expect(root.querySelector('h1')!.textContent).toBe('Title');
    expect(root.querySelector('.prompt')!.textContent).toBe('In [3]:');
    expect(root.querySelector('code.hljs')).not.toBeNull();
    expect(root.textContent).toContain('1\n');
    expect(root.querySelector('img')!.getAttribute('src')).toBe('data:image/png;base64,iVBORw0KGgo=');
    expect(root.textContent).toContain('ValueError: bad');
    expect(root.textContent).not.toContain('\u001b[');
  });

  it('shows an HTML output as source: nothing from it reaches the DOM as markup', () => {
    const root = document.createElement('div');
    root.append(...notebookElements(nb));
    expect(root.querySelector('script')).toBeNull();
    expect(root.querySelector('b')).toBeNull();
    expect(root.textContent).toContain('<script>alert(1)</script><b>x</b>');
  });
});

describe('notebook details', () => {
  it('relative images in markdown cells resolve to the signed base; an error without a traceback still says what failed', () => {
    const root = document.createElement('div');
    root.append(...notebookElements({ cells: [
      { cell_type: 'markdown', source: '![p](<plots/a b.png>)' },
      { cell_type: 'code', source: 'x', outputs: [{ output_type: 'error', ename: 'KeyError', evalue: "'k'", traceback: [] }] },
    ] }, { path: 'nb/run.ipynb', baseUrl: 'https://c.test/s/T/' }));
    expect(root.querySelector('img')!.getAttribute('src')).toBe('https://c.test/s/T/nb/plots/a%20b.png');
    expect(root.querySelector('.prompt')!.textContent).toBe('In [ ]:');
    expect(root.querySelector('.out.error')!.textContent).toBe("KeyError: 'k'");
  });

  it('refuses something that is not a notebook rather than showing an empty page', () => {
    expect(() => notebookElements({ worksheets: [] })).toThrow(/no cells/);
  });
});
