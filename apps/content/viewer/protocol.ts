import { isTheme, isThemeMessage, type ResizeMessage, type Theme } from '@superlibrary/contract';

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
