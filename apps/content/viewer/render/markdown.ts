import { marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/common';
import { encodePath, type ViewerData } from '@superlibrary/contract';
import { escapeHtml, h, header } from '../dom';

/** A link inside the same version, as a manifest path; null for anything absolute or above the root. */
export function resolveRelative(fromPath: string, href: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//') || href.startsWith('#')) return null;
  const pathPart = href.split(/[?#]/)[0] ?? '';
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathPart);
  } catch {
    decoded = pathPart;
  }
  const parts = decoded.startsWith('/') ? [] : fromPath.split('/').slice(0, -1);
  for (const seg of decoded.split('/')) {
    if (seg === '..') {
      if (parts.length === 0) return null;
      parts.pop();
    } else if (seg !== '' && seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

/** Spec §9: GFM (tables, task lists), then sanitized; raw HTML in the file survives only as DOMPurify allows. */
export function markdownHtml(src: string): string {
  const html = marked.parse(src, { gfm: true, async: false }) as string;
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}

/** Images from the same folder (spec §9): a relative src is a file of this version, under the signed base. */
export function resolveImages(root: ParentNode, d: Pick<ViewerData, 'path' | 'baseUrl'>): void {
  for (const img of root.querySelectorAll('img')) {
    const rel = resolveRelative(d.path, img.getAttribute('src') ?? '');
    if (rel) img.setAttribute('src', d.baseUrl + encodePath(rel));
  }
}

/** hljs output is escaped HTML; an unknown or missing language is shown escaped, as in renderCode. */
export function highlightBlock(code: HTMLElement, lang: string | null): void {
  const text = code.textContent ?? '';
  code.classList.add('hljs');
  code.innerHTML = lang && hljs.getLanguage(lang) ? hljs.highlight(text, { language: lang, ignoreIllegals: true }).value : escapeHtml(text);
}

const fenceLanguage = (code: Element) => /\blanguage-([\w+#.-]+)/.exec(code.className)?.[1] ?? null;

export async function renderMarkdown(el: HTMLElement, d: ViewerData): Promise<void> {
  const article = h('article', { class: 'markdown' });
  article.innerHTML = markdownHtml(d.text ?? '');
  resolveImages(article, d);
  const mermaidBlocks: HTMLElement[] = [];
  for (const code of article.querySelectorAll<HTMLElement>('pre > code')) {
    const lang = fenceLanguage(code);
    if (lang === 'mermaid') mermaidBlocks.push(code);
    else highlightBlock(code, lang);
  }
  el.replaceChildren(header(d), article);
  if (mermaidBlocks.length > 0) {
    const { renderMermaidInto } = await import('./diagram');
    for (const code of mermaidBlocks) {
      const pre = code.parentElement!;
      const src = code.textContent ?? '';
      try {
        await renderMermaidInto(pre, src);
      } catch (e) {
        // One bad diagram does not hide the document: the block stays as source, with the reason.
        pre.before(h('p', { class: 'note' }, `This diagram could not be drawn: ${e instanceof Error ? e.message : String(e)}`));
      }
    }
  }
}
