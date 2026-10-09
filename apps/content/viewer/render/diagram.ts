import DOMPurify from 'dompurify';
import type { ViewerData } from '@superlibrary/contract';
import { h, header } from '../dom';

let counter = 0;
const sourceOf = (d: ViewerData, open = false) => h('details', { open }, h('summary', {}, 'Source'), h('pre', { class: 'raw' }, d.text ?? ''));
const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

const isDark = () => {
  const forced = document.documentElement.dataset.theme;
  return forced === 'dark' || (!forced && matchMedia('(prefers-color-scheme: dark)').matches);
};

/**
 * Mermaid in strict mode (its own DOMPurify pass; no click handlers or HTML labels). Its injected
 * `<style>` is inline, which the content CSP allows (plan D3), so themes apply.
 */
export async function renderMermaidInto(target: HTMLElement, src: string): Promise<void> {
  const { default: mermaid } = await import('mermaid');
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', suppressErrorRendering: true, theme: isDark() ? 'dark' : 'default' });
  const id = `sl-mermaid-${++counter}`;
  let svg: string;
  try {
    ({ svg } = await mermaid.render(id, src));
  } finally {
    // A failed render can leave its scratch container in <body>.
    document.getElementById(`d${id}`)?.remove();
  }
  const fig = h('figure', { class: 'diagram' });
  fig.innerHTML = svg;
  target.replaceWith(fig);
}

/** A diagram file that does not parse still shows its source, with the reason. */
async function diagramFile(el: HTMLElement, d: ViewerData, draw: (holder: HTMLElement) => Promise<void>): Promise<void> {
  const holder = h('div');
  el.replaceChildren(header(d), holder, sourceOf(d));
  try {
    await draw(holder);
  } catch (e) {
    el.replaceChildren(header(d), h('p', { class: 'note' }, `This diagram could not be drawn: ${messageOf(e)}`), sourceOf(d, true));
  }
}

export function renderMermaid(el: HTMLElement, d: ViewerData): Promise<void> {
  return diagramFile(el, d, (holder) => renderMermaidInto(holder, d.text ?? ''));
}

/** Graphviz's SVG, sanitized: a node's URL attribute becomes an <a href>, and `javascript:` must not survive. */
export async function graphvizSvg(src: string): Promise<string> {
  // viz.js 2.1.2's asm.js build: the content CSP has no 'wasm-unsafe-eval' (plan D4). A fresh instance per
  // render, because a Graphviz syntax error can leave the Emscripten module unusable.
  const [{ default: Viz }, { Module, render }] = await Promise.all([import('viz.js'), import('viz.js/full.render.js')]);
  const svg = await new Viz({ Module, render }).renderString(src);
  return DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } });
}

export function renderGraphviz(el: HTMLElement, d: ViewerData): Promise<void> {
  return diagramFile(el, d, async (holder) => {
    const fig = h('figure', { class: 'diagram' });
    fig.innerHTML = await graphvizSvg(d.text ?? '');
    holder.replaceWith(fig);
  });
}
