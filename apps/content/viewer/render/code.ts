import hljs from 'highlight.js/lib/common';
import type { ViewerData } from '@superlibrary/contract';
import { escapeHtml, h, header } from '../dom';
import { languageFor } from '../lang';

const PAGE = 2000;

function highlight(text: string, lang: string | null): string {
  if (lang && hljs.getLanguage(lang)) return hljs.highlight(text, { language: lang, ignoreIllegals: true }).value;
  return escapeHtml(text);
}

/**
 * Spec §9: "Syntax-highlighted, paged when large." hljs output is escaped HTML, so it may be inserted.
 * Source mode (`d.source`) shows any text-backed kind this way, its language taken from the path.
 */
export function renderCode(el: HTMLElement, d: ViewerData, lang = d.view === 'code' || d.source ? languageFor(d.path) : null): void {
  const lines = (d.text ?? '').split(/\r\n|\r|\n/);
  const code = h('code', { class: lang ? `hljs language-${lang}` : 'hljs' });
  const more = h('button', { type: 'button', class: 'more' });
  let shown = 0;
  const showMore = () => {
    const chunk = lines.slice(shown, shown + PAGE).join('\n');
    code.insertAdjacentHTML('beforeend', (shown > 0 ? '\n' : '') + highlight(chunk, lang));
    shown = Math.min(lines.length, shown + PAGE);
    more.hidden = shown >= lines.length;
    more.textContent = `Show more (${(lines.length - shown).toLocaleString('en')} lines left)`;
  };
  more.addEventListener('click', showMore);
  showMore();
  el.replaceChildren(header(d), h('pre', { class: 'code' }, code), more);
}
