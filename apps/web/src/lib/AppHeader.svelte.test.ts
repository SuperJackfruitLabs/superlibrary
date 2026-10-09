// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import AppHeader from './AppHeader.svelte';

let c: ReturnType<typeof mount> | undefined;
afterEach(() => { if (c) unmount(c); c = undefined; document.body.innerHTML = ''; });

describe('the app header', () => {
  it('shows the mark beside the name, as decoration inside the home link', () => {
    c = mount(AppHeader, { target: document.body, props: { onsignout: vi.fn() } });
    flushSync();
    const home = document.querySelector<HTMLAnchorElement>('header a[href="/"]')!;
    const mark = home.querySelector('svg[data-testid="superlibrary-mark"]')!;
    expect(mark).not.toBeNull();
    expect(mark.getAttribute('aria-hidden')).toBe('true');
    expect(mark.querySelectorAll('rect')).toHaveLength(3);
    expect(home.textContent?.trim()).toBe('Superlibrary');
  });

  it('the mark draws the same three spines as the favicon', () => {
    c = mount(AppHeader, { target: document.body, props: { onsignout: vi.fn() } });
    flushSync();
    const fav = readFileSync(join(__dirname, '..', '..', 'static', 'favicon.svg'), 'utf8');
    const fromFavicon = [...fav.matchAll(/<rect (x="[^/]*?)\/>/g)].map((m) => m[1]!.trim());
    const inHeader = [...document.querySelectorAll('[data-testid="superlibrary-mark"] rect')].map((r) => [...r.attributes].map((a) => `${a.name}="${a.value}"`).join(' '));
    expect(inHeader).toEqual(fromFavicon);
  });

  it('Sign out calls back', () => {
    const onsignout = vi.fn();
    c = mount(AppHeader, { target: document.body, props: { onsignout } });
    flushSync();
    document.querySelector<HTMLButtonElement>('header button')!.click();
    expect(onsignout).toHaveBeenCalledOnce();
  });
});
