// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_APPEARANCE } from '@superjackfruit/vibekit';
import { OLD_THEME_KEY, PLACE_KEY, chooseLocation, chooseVibe, initAppearance, look, setAppearance } from './appearance.svelte';

const html = () => document.documentElement;
const attrs = () => ({ vibe: html().dataset.vibe, theme: html().dataset.theme, phase: html().dataset.phase, time: html().dataset.time });
const noon = () => new Date(2026, 9, 11, 12, 0);
const night = () => new Date(2026, 9, 11, 23, 0);
const clearCookies = () => {
  for (const c of document.cookie.split('; ')) if (c) document.cookie = `${c.split('=')[0]}=; Max-Age=0; Path=/`;
};
let stop: (() => void) | null = null;

beforeEach(() => {
  clearCookies();
  localStorage.clear();
  for (const a of ['data-vibe', 'data-theme', 'data-phase', 'data-time']) html().removeAttribute(a);
});
afterEach(() => { stop?.(); stop = null; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('the appearance setting', () => {
  it('a first visit is Daylight, following the sun: light at noon', () => {
    stop = initAppearance(document, noon);
    expect(attrs()).toEqual({ vibe: 'daylight', theme: 'light', phase: 'noon', time: 'strong' });
    expect(look.appearance).toEqual(DEFAULT_APPEARANCE);
    expect(look.theme).toBe('light');
  });

  it('following the sun is dark at night', () => {
    stop = initAppearance(document, night);
    expect(attrs().theme).toBe('dark');
    expect(attrs().phase).toBe('night');
  });

  it('reads the person’s cookie', () => {
    document.cookie = 'vk_appearance=studio.dark.subtle.0; Path=/';
    stop = initAppearance(document, noon);
    expect(attrs()).toEqual({ vibe: 'studio', theme: 'dark', phase: 'noon', time: 'subtle' });
  });

  it('a junk cookie falls back field by field and never throws', () => {
    document.cookie = 'vk_appearance=neon.sun.%3Cimg%3E; Path=/';
    expect(() => { stop = initAppearance(document, noon); }).not.toThrow();
    expect(attrs()).toEqual({ vibe: 'daylight', theme: 'light', phase: 'noon', time: 'strong' });
  });

  it('an old Light or Dark choice carries over once, and the old key stays for the embed', () => {
    localStorage.setItem(OLD_THEME_KEY, 'dark');
    stop = initAppearance(document, noon);
    expect(attrs().theme).toBe('dark');
    expect(document.cookie).toContain('vk_appearance=daylight.dark.strong.0');
    expect(localStorage.getItem(OLD_THEME_KEY)).toBe('dark');
    stop(); // a second start reads the cookie and does not migrate again
    localStorage.setItem(OLD_THEME_KEY, 'light');
    stop = initAppearance(document, noon);
    expect(attrs().theme).toBe('dark');
  });

  it('the cookie wins over the old key', () => {
    document.cookie = 'vk_appearance=paper.light.strong.0; Path=/';
    localStorage.setItem(OLD_THEME_KEY, 'dark');
    stop = initAppearance(document, noon);
    expect(attrs().theme).toBe('light');
  });

  it('a change paints at once, is saved host-only, and lets the viewer follow the page', () => {
    const writes: string[] = [];
    const desc = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')!;
    vi.spyOn(Document.prototype, 'cookie', 'set').mockImplementation(function (this: Document, v: string) { writes.push(v); desc.set!.call(this, v); });
    stop = initAppearance(document, noon);
    localStorage.setItem(OLD_THEME_KEY, 'light');
    setAppearance({ vibe: 'paper', theme: 'dark', timeStrength: 'strong', useLocation: false });
    expect(attrs().vibe).toBe('paper');
    expect(attrs().theme).toBe('dark');
    expect(look.theme).toBe('dark');
    const last = writes.at(-1)!;
    expect(last).toMatch(/^vk_appearance=paper\.dark\.strong\.0; /);
    expect(last).not.toContain('Domain=');
    expect(last).not.toContain('Secure');   // jsdom is http; on https it is Secure
    expect(localStorage.getItem(OLD_THEME_KEY)).toBe('light'); // the embed's own per-device choice is never touched
  });

  it('the cookie is Secure on https and not on http', () => {
    const writes: string[] = [];
    const withProtocol = (protocol: string) => ({ ...document, location: { protocol }, documentElement: html(), querySelectorAll: () => [], defaultView: null, addEventListener() {}, removeEventListener() {}, set cookie(v: string) { writes.push(v); }, get cookie() { return ''; } }) as unknown as Document;
    setAppearance({ ...DEFAULT_APPEARANCE, vibe: 'paper' }, withProtocol('https:'));
    setAppearance({ ...DEFAULT_APPEARANCE, vibe: 'studio' }, withProtocol('http:'));
    expect(writes[0]).toMatch(/^vk_appearance=paper\./);
    expect(writes[0]).toMatch(/; Secure$/);
    expect(writes[1]).toMatch(/^vk_appearance=studio\./);
    expect(writes[1]).not.toContain('Secure');
  });

  it('two quick choices while a view transition is pending end on the second', () => {
    const pending: Array<() => void> = [];
    (document as unknown as { startViewTransition: (cb: () => void) => void }).startViewTransition = (cb) => { pending.push(cb); };
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    try {
      stop = initAppearance(document, noon);
      chooseVibe('paper');
      chooseVibe('studio');
      // The model and the cookie are already on the second choice.
      expect(look.appearance.vibe).toBe('studio');
      expect(document.cookie).toContain('vk_appearance=studio.');
      // The browser runs the paints later, in order; the page ends on the second.
      pending.forEach((cb) => cb());
      expect(attrs().vibe).toBe('studio');
    } finally {
      delete (document as unknown as { startViewTransition?: unknown }).startViewTransition;
    }
  });

  it('choosing a vibe resets the time of day to that vibe’s default', () => {
    stop = initAppearance(document, noon);
    chooseVibe('quiet');
    expect(look.appearance.timeStrength).toBe('off');
    expect(attrs().time).toBe('off');
    chooseVibe('paper');
    expect(look.appearance.timeStrength).toBe('strong');
  });

  it('blocked storage never throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => { stop = initAppearance(document, noon); }).not.toThrow();
    expect(() => setAppearance({ ...DEFAULT_APPEARANCE, vibe: 'studio' })).not.toThrow();
    expect(attrs().vibe).toBe('studio');
  });

  it('location is rounded to about 10 km and kept on this device; a refusal turns it off', async () => {
    stop = initAppearance(document, noon);
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: (ok: PositionCallback) => ok({ coords: { latitude: 28.61394, longitude: 77.20902 } } as GeolocationPosition) } });
    expect(await chooseLocation(true)).toBe(true);
    expect(JSON.parse(localStorage.getItem(PLACE_KEY)!)).toEqual({ latitude: 28.6, longitude: 77.2 });
    expect(look.appearance.useLocation).toBe(true);
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: (_ok: PositionCallback, err: PositionErrorCallback) => err({ code: 1 } as GeolocationPositionError) } });
    expect(await chooseLocation(true)).toBe(false);
    expect(look.appearance.useLocation).toBe(false);
    await chooseLocation(false);
    expect(localStorage.getItem(PLACE_KEY)).toBeNull();
  });
});
