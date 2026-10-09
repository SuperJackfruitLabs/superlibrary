import type { ViewerData } from '@superlibrary/contract';
import { formatBytes, h } from '../dom';

/** Spec §9: "Download, with type, size and hash." The download itself is the host toolbar's (plan D6). */
export function renderDownload(el: HTMLElement, d: ViewerData): void {
  const row = (k: string, v: string) => [h('dt', {}, k), h('dd', {}, v)];
  el.replaceChildren(
    h('dl', { class: 'card' }, ...row('Name', d.name), ...row('Type', d.mediaType), ...row('Size', formatBytes(d.bytes)), ...row('SHA-256', d.sha256)),
    h('p', { class: 'note' }, 'This kind is not shown here. Use Download in the toolbar.'),
  );
}
