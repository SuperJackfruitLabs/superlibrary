/** The frame protocol (spec §9, Embedding). Both sides use these guards. */
export type ResizeMessage = { type: 'superlibrary:resize'; height: number };
/** `system` hands the choice back to the viewer's own prefers-color-scheme, which is also the default. */
export type Theme = 'light' | 'dark' | 'system';
export type ThemeMessage = { type: 'superlibrary:theme'; theme: Theme };
export const MAX_FRAME_HEIGHT = 20000;

const isObj = (d: unknown): d is Record<string, unknown> => typeof d === 'object' && d !== null;

export const isTheme = (t: unknown): t is Theme => t === 'light' || t === 'dark' || t === 'system';

export function isResizeMessage(d: unknown): d is ResizeMessage {
  return isObj(d) && d.type === 'superlibrary:resize' && typeof d.height === 'number' && Number.isFinite(d.height) && d.height >= 0;
}

export function isThemeMessage(d: unknown): d is ThemeMessage {
  return isObj(d) && d.type === 'superlibrary:theme' && isTheme(d.theme);
}
