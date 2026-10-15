// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import AppHeader from './AppHeader.svelte';

let c: ReturnType<typeof mount> | undefined;
afterEach(() => { if (c) unmount(c); c = undefined; document.body.innerHTML = ''; });
const me = { principalId: 'prn_000000000000000000a2', org: 'org_1', workspaceId: 'wks_1', role: 'owner' as const };
const open = (onsignout = vi.fn()) => { c = mount(AppHeader, { target: document.body, props: { me, onsignout } }); flushSync(); };

describe('the app header', () => {
  it('shows the mark beside the name, as decoration inside the home link', () => {
    open();
    const home = document.querySelector<HTMLAnchorElement>('header a[href="/"]')!;
    const mark = home.querySelector('svg[data-testid="superlibrary-mark"]')!;
    expect(mark).not.toBeNull();
    expect(mark.getAttribute('aria-hidden')).toBe('true');
    expect(mark.querySelectorAll('g[mask] > path')).toHaveLength(4);   // the pack's four pages
    expect(home.textContent?.trim()).toBe('Superlibrary');
  });

  it('the mark draws the same pages as the favicon (translucent-v2)', () => {
    open();
    const fav = readFileSync(join(__dirname, '..', '..', 'static', 'brand', 'favicon.svg'), 'utf8');
    const inHeader = [...document.querySelectorAll('[data-testid="superlibrary-mark"] g[mask] > path')].map((p) => p.getAttribute('d')!);
    expect(inHeader).toHaveLength(4);
    for (const d of inHeader) expect(fav, d.slice(0, 20)).toContain(`d="${d}"`);
  });

  it('the nav reads Library, Outcomes, Collections, Upload', () => {
    open();
    expect([...document.querySelectorAll('nav[aria-label="Superlibrary"] a')].map((a) => a.textContent)).toEqual(['Library', 'Outcomes', 'Collections', 'Upload']);
  });

  it('opening the account menu closes the suite switcher, and Escape on the trigger closes it', () => {
    open();
    const sw = document.querySelector<HTMLButtonElement>('button.suite-switcher')!;
    const acct = document.querySelector<HTMLButtonElement>('button.suite-shell-account')!;
    sw.click(); flushSync();
    expect(sw.getAttribute('aria-expanded')).toBe('true');
    acct.click(); flushSync();
    expect(sw.getAttribute('aria-expanded')).toBe('false');
    expect(acct.getAttribute('aria-expanded')).toBe('true');
    acct.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); flushSync();
    expect(acct.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(acct);
  });

  it('Sign out is inside the account menu, not in the bar, and calls back', () => {
    const onsignout = vi.fn();
    open(onsignout);
    const signout = [...document.querySelectorAll<HTMLButtonElement>('header button')].find((b) => b.textContent!.trim() === 'Sign out')!;
    expect(signout.closest('.suite-shell-menu')).not.toBeNull();
    signout.click();
    expect(onsignout).toHaveBeenCalledOnce();
  });
});
