/** The frame protocol (spec §9, Embedding). Both sides use these guards. */
export type ResizeMessage = { type: 'superlibrary:resize'; height: number };
/** `system` hands the choice back to the viewer's own prefers-color-scheme, which is also the default. */
export type Theme = 'light' | 'dark' | 'system';
export type ThemeMessage = { type: 'superlibrary:theme'; theme: Theme };
/**
 * Frame to host: a signed URL ran out while the frame was using it (a document navigation answered
 * by the expired page, or a media element that failed). `path` is the file of the version it was
 * for, decoded; "" for the `/_view` entry when the manifest could not be read.
 */
export type ExpiredMessage = { type: 'superlibrary:expired'; path: string };
/** Frame to host: the person clicked a link in a rendered file. The sandbox cannot open it itself. */
export type OpenMessage = { type: 'superlibrary:open'; url: string };
export const MAX_FRAME_HEIGHT = 20000;

const isObj = (d: unknown): d is Record<string, unknown> => typeof d === 'object' && d !== null;

export const isTheme = (t: unknown): t is Theme => t === 'light' || t === 'dark' || t === 'system';

export function isResizeMessage(d: unknown): d is ResizeMessage {
  return isObj(d) && d.type === 'superlibrary:resize' && typeof d.height === 'number' && Number.isFinite(d.height) && d.height >= 0;
}

export function isThemeMessage(d: unknown): d is ThemeMessage {
  return isObj(d) && d.type === 'superlibrary:theme' && isTheme(d.theme);
}

export function isExpiredMessage(d: unknown): d is ExpiredMessage {
  return isObj(d) && d.type === 'superlibrary:expired' && typeof d.path === 'string';
}

export function isOpenMessage(d: unknown): d is OpenMessage {
  return isObj(d) && d.type === 'superlibrary:open' && typeof d.url === 'string';
}

/** An absolute http: or https: URL, and nothing else (no javascript:, data:, blob:, relative paths). */
export function isWebUrl(url: string): boolean {
  try {
    const p = new URL(url).protocol;
    return p === 'http:' || p === 'https:';
  } catch {
    return false;
  }
}
