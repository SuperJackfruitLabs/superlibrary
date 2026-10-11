// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { DEFAULT_APPEARANCE } from '@superjackfruit/vibekit';
import AppearanceDialog from './AppearanceDialog.svelte';
import { PLACE_KEY, look, setAppearance } from './appearance.svelte';

let c: ReturnType<typeof mount> | null = null;
beforeEach(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  localStorage.clear();
  setAppearance({ ...DEFAULT_APPEARANCE });
});
afterEach(() => { if (c) unmount(c); c = null; document.body.innerHTML = ''; vi.unstubAllGlobals(); });
const open = (onclose = vi.fn(), opener: HTMLElement | null = null) => { c = mount(AppearanceDialog, { target: document.body, props: { onclose, opener } }); flushSync(); return onclose; };
const radio = (name: string) => [...document.querySelectorAll<HTMLInputElement>('input[name="vibe"]')].find((r) => r.closest('label')!.textContent!.includes(name))!;
const segment = (label: string) => [...document.querySelectorAll<HTMLElement>('[role="radio"]')].find((r) => r.textContent === label)!;
const locationBox = () => document.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
const geo = (impl: (ok: PositionCallback, fail: PositionErrorCallback) => void) => vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition: impl } });
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('the appearance dialog', () => {
  it('is a labelled modal dialog that starts on the chosen vibe', () => {
    open();
    const d = document.querySelector('[role="dialog"]')!;
    expect(d.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(d.getAttribute('aria-labelledby')!)!.textContent).toBe('Appearance');
    expect(document.activeElement).toBe(radio('Daylight'));
  });

  it('lists the four vibes with what each feels like, each with a sample in its own colours', () => {
    open();
    const cards = [...document.querySelectorAll('.sl-vibe-card')];
    expect(cards.map((l) => l.querySelector('.sl-vibe-name')!.textContent)).toEqual(['Daylight', 'Paper', 'Studio', 'Quiet']);
    expect(cards[1]!.textContent).toContain('A letter from a colleague');
    expect(cards[2]!.querySelector('.sl-vibe-sample')!.getAttribute('data-vibe')).toBe('studio');
  });

  it('a vibe applies at once and is saved', () => {
    open();
    radio('Studio').click(); flushSync();
    expect(document.documentElement.dataset.vibe).toBe('studio');
    expect(look.appearance.vibe).toBe('studio');
    expect(document.cookie).toContain('vk_appearance=studio.');
  });

  it('light or dark and the time of day are labelled radio groups', () => {
    open();
    const groups = [...document.querySelectorAll('[role="radiogroup"]')].map((g) => g.getAttribute('aria-label'));
    expect(groups).toEqual(['Light or dark', 'Time of day']);
    segment('Dark').click(); flushSync();
    expect(look.appearance.theme).toBe('dark');
    segment('Subtle').click(); flushSync();
    expect(look.appearance.timeStrength).toBe('subtle');
  });

  it('choosing Quiet shows the time of day turned off', () => {
    open();
    radio('Quiet').click(); flushSync();
    expect(look.appearance.timeStrength).toBe('off');
    expect(segment('Off').getAttribute('aria-checked')).toBe('true');
    expect(segment('Strong').getAttribute('aria-checked')).toBe('false');
  });

  it('Done and Escape close it, and focus goes back to the opener', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    const onclose = open(vi.fn(), opener);
    expect(document.activeElement).not.toBe(opener);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onclose).toHaveBeenCalledOnce();
    [...document.querySelectorAll('button')].find((b) => b.textContent === 'Done')!.click();
    expect(onclose).toHaveBeenCalledTimes(2);
    unmount(c!); c = null; // the parent closes it
    expect(document.activeElement).toBe(opener);
  });

  it('traps focus: Tab wraps from Done to the first control', () => {
    open();
    const done = [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Done')!;
    done.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(document.querySelector('[role="dialog"]')!.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(done);
  });

  it('Tab stops once per group, in order: the checked vibe, each segmented control once, the location box, Done', () => {
    open();
    const dialog = document.querySelector('[role="dialog"]')!;
    const stops: Element[] = [];
    for (let n = 0; n < 6; n++) {
      stops.push(document.activeElement!);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    }
    const name = (el: Element) => el instanceof HTMLInputElement ? `${el.type}:${el.value || el.name}` : el.textContent!.trim();
    expect(stops.map(name)).toEqual(['radio:daylight', 'Follow the sun', 'Strong', 'checkbox:on', 'Done', 'radio:daylight']);
    expect(dialog.contains(document.activeElement)).toBe(true);
    // Shift+Tab from the first stop wraps to Done.
    radio('Daylight').focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    expect(document.activeElement!.textContent!.trim()).toBe('Done');
  });

  it('use my location: allowed, the place is kept and the box stays checked', async () => {
    geo((ok) => ok({ coords: { latitude: 12.34, longitude: 56.78 } } as GeolocationPosition));
    open();
    locationBox().click(); await settle(); flushSync();
    expect(look.appearance.useLocation).toBe(true);
    expect(locationBox().checked).toBe(true);
    expect(JSON.parse(localStorage.getItem(PLACE_KEY)!)).toEqual({ latitude: 12.3, longitude: 56.8 });
  });

  it('use my location: refused, the box ends unchecked and says so', async () => {
    geo((_ok, fail) => fail({ code: 1 } as GeolocationPositionError));
    open();
    locationBox().click(); await settle(); flushSync();
    expect(look.appearance.useLocation).toBe(false);
    expect(locationBox().checked).toBe(false);
    expect(document.querySelector('[role="status"]')!.textContent).toContain('Location was not shared');
  });

  it('unchecking while the prompt is pending: a late allow does not turn it back on', async () => {
    let allow!: PositionCallback;
    geo((ok) => { allow = ok; });
    open();
    locationBox().click(); // asks, still pending
    expect(locationBox().checked).toBe(true);
    locationBox().click(); await settle(); flushSync(); // unchecked
    allow({ coords: { latitude: 1, longitude: 2 } } as GeolocationPosition);
    await settle(); flushSync();
    expect(look.appearance.useLocation).toBe(false);
    expect(locationBox().checked).toBe(false);
    expect(localStorage.getItem(PLACE_KEY)).toBeNull();
    expect(document.querySelector('[role="status"]')!.textContent).not.toContain('Location was not shared');
  });

  it('check, uncheck, check: the first answer leaves the box alone while the third ask is pending', async () => {
    const asks: Array<{ ok: PositionCallback; fail: PositionErrorCallback }> = [];
    geo((ok, fail) => { asks.push({ ok, fail }); });
    open();
    locationBox().click(); // A pending
    locationBox().click(); await settle(); // off
    locationBox().click(); // C pending
    expect(asks).toHaveLength(2);
    asks[0]!.fail({ code: 1 } as GeolocationPositionError); await settle(); flushSync();
    expect(locationBox().checked).toBe(true);
    expect(document.querySelector('[role="status"]')!.textContent).not.toContain('Location was not shared');
    asks[1]!.ok({ coords: { latitude: 1, longitude: 2 } } as GeolocationPosition); await settle(); flushSync();
    expect(look.appearance.useLocation).toBe(true);
    expect(locationBox().checked).toBe(true);
  });
});
