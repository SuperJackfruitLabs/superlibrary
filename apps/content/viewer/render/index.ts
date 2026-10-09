import type { ViewerData } from '@superlibrary/contract';
import { renderCode } from './code';
import { renderStructured } from './structured';
import { renderTable } from './table';
import { renderImage, renderMedia, renderSvg } from './media';
import { renderDownload } from './download';

/**
 * One renderer for every host (spec §9, Embedding). Markdown, diagrams, notebooks and PDF are lazy chunks
 * (`/_viewer/chunks/*`, loaded as module scripts from 'self': connect-src is 'none'), so Mermaid, viz.js
 * and pdf.js load only when their kind renders.
 */
export async function render(el: HTMLElement, d: ViewerData): Promise<void> {
  // Operator: view source. The Worker sets it only for a text-backed kind, with the text inlined.
  if (d.source) return renderCode(el, d);
  switch (d.view) {
    case 'code':
    case 'text':
      return renderCode(el, d);
    case 'json':
    case 'yaml':
    case 'toml':
      return renderStructured(el, d);
    case 'csv':
    case 'tsv':
      return renderTable(el, d);
    case 'image':
      return renderImage(el, d);
    case 'svg':
      return renderSvg(el, d);
    case 'audio':
    case 'video':
      return renderMedia(el, d);
    case 'markdown':
      return (await import('./markdown')).renderMarkdown(el, d);
    case 'mermaid':
      return (await import('./diagram')).renderMermaid(el, d);
    case 'graphviz':
      return (await import('./diagram')).renderGraphviz(el, d);
    case 'ipynb':
      return (await import('./notebook')).renderNotebook(el, d);
    case 'pdf':
      return (await import('./pdf')).renderPdf(el, d);
    default:
      return renderDownload(el, d);
  }
}
