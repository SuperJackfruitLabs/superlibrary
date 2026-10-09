import { isTheme, isThemeMessage, isWebUrl, type ExpiredMessage, type OpenMessage, type ResizeMessage, type Theme } from '@superlibrary/contract';

/**
 * Post the content height to the host — the one origin the token signed, never '*'. The root's box,
 * not its scrollHeight: scrollHeight is never less than the frame's viewport, so a frame the host
 * grew for one file could never shrink for the next.
 */
export function reportHeight(host: string, win: Window = window): () => void {
  const send = () => {
    const msg: ResizeMessage = { type: 'superlibrary:resize', height: Math.ceil(win.document.documentElement.getBoundingClientRect().height) };
    win.parent.postMessage(msg, host);
  };
  const ro = new (win as Window & typeof globalThis).ResizeObserver(send);
  ro.observe(win.document.documentElement);
  send();
  return () => ro.disconnect();
}

/** Accept a theme only from the signed host (plan D18). */
export function listenForTheme(host: string, apply: (theme: Theme) => void, win: Window = window): () => void {
  const on = (e: MessageEvent) => {
    if (e.origin !== host || !isThemeMessage(e.data)) return;
    apply(e.data.theme);
  };
  win.addEventListener('message', on);
  return () => win.removeEventListener('message', on);
}

/**
 * `light` and `dark` pin the stylesheet's theme; `system` (and no theme at all, the default) leaves
 * it to prefers-color-scheme.
 */
export function applyTheme(theme: Theme, doc: Document = document): void {
  if (theme === 'system') delete doc.documentElement.dataset.theme;
  else doc.documentElement.dataset.theme = theme;
}

/** `/_view?…&theme=dark`: the host's theme at load, so the frame does not flash the other one first. */
export function themeFromQuery(search: string): Theme | null {
  const t = new URLSearchParams(search).get('theme');
  return isTheme(t) ? t : null;
}

/**
 * Links in a rendered file (Markdown, notebook Markdown, Graphviz node URLs). The sandbox has no
 * allow-popups (spec §9), so an http(s) link is posted to the signed host, which opens it. Any other
 * absolute scheme (javascript:, data:, mailto:…) is neither posted nor followed. In-page anchors and
 * relative links are left to the browser.
 */
export function listenForLinks(host: string, root: HTMLElement, win: Window = window): () => void {
  const on = (e: MouseEvent) => {
    if (e.type === 'auxclick' && e.button !== 1) return;
    const a = e.target instanceof Element ? e.target.closest('a') : null;
    if (!a || !root.contains(a)) return;
    const href = (a.getAttribute('href') ?? a.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ?? '').trim();
    if (href === '' || href.startsWith('#') || !/^[a-z][a-z0-9+.-]*:/i.test(href)) return;
    e.preventDefault();
    if (!isWebUrl(href)) return;
    const msg: OpenMessage = { type: 'superlibrary:open', url: new URL(href).href };
    win.parent.postMessage(msg, host);
  };
  win.document.addEventListener('click', on);
  win.document.addEventListener('auxclick', on);
  return () => {
    win.document.removeEventListener('click', on);
    win.document.removeEventListener('auxclick', on);
  };
}

/**
 * An image, audio or video of this version that fails to load (a late image, a range request after
 * the URL ran out), or a media element that stalls: tell the host which file, so it can mint again. The host acts only on a grant old
 * enough to have expired, so a file that fails for another reason does not loop.
 */
export function reportExpiredMedia(host: string, d: { baseUrl: string }, win: Window = window): () => void {
  const on = (e: Event) => {
    const t = e.target;
    if (!(t instanceof HTMLImageElement || t instanceof HTMLMediaElement)) return;
    if (e.type === 'stalled' && !(t instanceof HTMLMediaElement)) return;
    const src = t.currentSrc || t.getAttribute('src') || '';
    if (!src.startsWith(d.baseUrl)) return;
    let path: string;
    try {
      path = (src.slice(d.baseUrl.length).split(/[?#]/)[0] ?? '').split('/').map(decodeURIComponent).join('/');
    } catch {
      return;
    }
    const msg: ExpiredMessage = { type: 'superlibrary:expired', path };
    win.parent.postMessage(msg, host);
  };
  // Neither bubbles: listen in the capture phase. `stalled` because Chromium never fails a media
  // element whose range request was refused (Opaque Response Blocking hides the 403; it retries).
  win.document.addEventListener('error', on, true);
  win.document.addEventListener('stalled', on, true);
  return () => {
    win.document.removeEventListener('error', on, true);
    win.document.removeEventListener('stalled', on, true);
  };
}
