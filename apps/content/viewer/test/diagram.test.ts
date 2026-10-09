import { describe, expect, it } from 'vitest';
import type { ViewerData } from '@superlibrary/contract';
import { graphvizSvg, renderGraphviz } from '../render/diagram';

const data = (text: string): ViewerData => ({ view: 'graphviz', path: 'g.dot', name: 'g.dot', mediaType: 'text/vnd.graphviz', bytes: text.length, sha256: 'a'.repeat(64), rawUrl: '', baseUrl: 'https://c.test/s/T/', host: 'https://app.test', text });

describe('Graphviz (viz.js asm.js, plan D4): rendered plus source', () => {
  it('draws the graph as SVG and keeps the source', async () => {
    const el = document.createElement('main');
    await renderGraphviz(el, data('digraph { a -> b }'));
    expect(el.querySelector('figure.diagram svg')).not.toBeNull();
    expect([...el.querySelectorAll('svg text')].map((t) => t.textContent)).toEqual(['a', 'b']);
    expect(el.querySelector('details pre')!.textContent).toBe('digraph { a -> b }');
  });

  it('a node URL cannot become a javascript: link, and no script survives', async () => {
    const svg = await graphvizSvg('digraph { a [URL="javascript:alert(1)"]; b [label=<<b>x</b>>] }');
    expect(svg).toContain('<svg');
    expect(svg).not.toMatch(/javascript:/i);
    expect(svg).not.toContain('<script');
  });

  it('a graph that does not parse shows the reason and the source', async () => {
    const el = document.createElement('main');
    await renderGraphviz(el, data('digraph { a -> }'));
    expect(el.querySelector('.note')!.textContent).toMatch(/could not be drawn: .*syntax error/i);
    expect(el.querySelector('details')!.hasAttribute('open')).toBe(true);
    expect(el.querySelector('details pre')!.textContent).toBe('digraph { a -> }');
  });
});
