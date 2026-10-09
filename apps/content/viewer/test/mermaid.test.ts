import { describe, expect, it, vi } from 'vitest';

const initialize = vi.fn();
const render = vi.fn(async (_id: string, _src: string) => ({ svg: '<svg><g class="node"></g></svg>' }));
vi.mock('mermaid', () => ({ default: { initialize, render } }));

describe('Mermaid (spec §9): strict, themed, replaces its block', () => {
  it('initializes in strict mode with the frame’s theme and puts the SVG where the block was', async () => {
    const { renderMermaidInto } = await import('../render/diagram');
    document.documentElement.dataset.theme = 'dark';
    const holder = document.createElement('pre');
    document.body.append(holder);
    await renderMermaidInto(holder, 'graph TD; A-->B');
    expect(initialize).toHaveBeenLastCalledWith(expect.objectContaining({ startOnLoad: false, securityLevel: 'strict', theme: 'dark' }));
    expect(render.mock.calls[0]![1]).toBe('graph TD; A-->B');
    expect(document.body.querySelector('figure.diagram svg g.node')).not.toBeNull();
    expect(document.body.contains(holder)).toBe(false);
    delete document.documentElement.dataset.theme;
  });
});
