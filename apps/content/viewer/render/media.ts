import type { ViewerData } from '@superlibrary/contract';
import { h, header } from '../dom';

function zoomable(d: ViewerData): HTMLImageElement {
  const img = h('img', { src: d.rawUrl, alt: d.name, class: 'zoomable' });
  img.addEventListener('click', () => img.classList.toggle('zoomed'));
  return img;
}

export function renderImage(el: HTMLElement, d: ViewerData): void {
  el.replaceChildren(header(d), zoomable(d));
}

/** Spec §9: "As an image only (scripts cannot run), with the source available." */
export function renderSvg(el: HTMLElement, d: ViewerData): void {
  const source = h('details', {}, h('summary', {}, 'Source'), h('pre', { class: 'raw' }, d.text ?? ''));
  el.replaceChildren(header(d), zoomable(d), h('p', { class: 'note' }, 'Shown as an image: scripts in it do not run.'), source);
}

export function renderMedia(el: HTMLElement, d: ViewerData): void {
  const player = d.view === 'audio' ? h('audio', { controls: true, preload: 'metadata', src: d.rawUrl }) : h('video', { controls: true, preload: 'metadata', src: d.rawUrl });
  el.replaceChildren(header(d), player);
}
