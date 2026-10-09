// apps/web/src/lib/kit/theme.svelte.ts
/**
 * One theme choice per device for the app and its viewer: the embed stores the person's choice under
 * the same key (packages/embed/src/view.ts THEME_KEY). `system` follows the OS (no data-theme).
 */
export type Theme = 'system' | 'light' | 'dark';
export const THEME_KEY = 'superlibrary:theme';
const isTheme = (t: unknown): t is Theme => t === 'system' || t === 'light' || t === 'dark';

export function readTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return isTheme(t) ? t : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(t: Theme): void {
  const root = document.documentElement;
  if (t === 'system') root.removeAttribute('data-theme');
  else root.dataset.theme = t;
  try {
    if (t === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, t);
  } catch { /* private window or blocked storage: the choice lasts this page only */ }
  themeState.value = t;
}

export const themeState = $state<{ value: Theme }>({ value: 'system' });
