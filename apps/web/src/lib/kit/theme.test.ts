// apps/web/src/lib/kit/theme.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { THEME_KEY, applyTheme, readTheme } from './theme.svelte';

afterEach(() => { vi.unstubAllGlobals(); document.documentElement.removeAttribute('data-theme'); });
const store = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }; };

describe('the theme, one choice per device for the app and its viewer', () => {
  it('is stored under the embed’s own key and set on <html>; system clears it', () => {
    const s = store();
    vi.stubGlobal('localStorage', s);
    expect(THEME_KEY).toBe('superlibrary:theme');
    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(s.getItem(THEME_KEY)).toBe('dark');
    expect(readTheme()).toBe('dark');
    applyTheme('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(readTheme()).toBe('system');
  });
  it('a blocked or junk store reads as system and never throws', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => {} });
    expect(readTheme()).toBe('system');
    expect(() => applyTheme('light')).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});
