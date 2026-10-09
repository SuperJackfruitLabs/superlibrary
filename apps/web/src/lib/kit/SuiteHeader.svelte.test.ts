// apps/web/src/lib/kit/SuiteHeader.svelte.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRawSnippet, flushSync, mount, unmount } from 'svelte';
import SuiteHeader from './SuiteHeader.svelte';

let c: ReturnType<typeof mount> | null = null;
afterEach(() => { if (c) unmount(c); c = null; document.body.innerHTML = ''; });
const mark = createRawSnippet(() => ({ render: () => '<svg data-testid="mark"></svg>' }));
const suite = createRawSnippet(() => ({ render: () => '<button>Products</button>' }));

function open(extra: Record<string, unknown> = {}) {
  const onsignout = vi.fn();
  const ontheme = vi.fn();
  c = mount(SuiteHeader, { target: document.body, props: {
    product: 'Superlibrary', home: '/', mark, onsignout, ontheme, theme: 'system',
    nav: [{ href: '/', label: 'Library', current: true }, { href: '/outcomes', label: 'Outcomes', current: false }],
    account: { label: 'Account', detail: 'An owner of this workspace' }, ...extra,
  } });
  flushSync();
  return { onsignout, ontheme };
}

describe('the suite shell (operator direction A)', () => {
  it('puts the mark and name left, the nav in the middle, the account menu right', () => {
    open();
    const header = document.querySelector('header')!;
    const parts = [...header.children].map((e) => e.className.split(' ')[0]);
    expect(parts).toEqual(['suite-shell-brand', 'suite-shell-nav', 'suite-shell-end']);
    expect(header.querySelector('.suite-shell-brand')!.textContent).toContain('Superlibrary');
    expect(header.querySelector('[data-testid="mark"]')).not.toBeNull();
    expect(header.querySelector('nav[aria-label="Superlibrary"] [aria-current="page"]')!.textContent).toBe('Library');
  });
  it('the account menu holds the theme and Sign out, and Escape closes it back to its button', () => {
    const { onsignout, ontheme } = open();
    const btn = document.querySelector<HTMLButtonElement>('.suite-shell-account')!;
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    btn.click(); flushSync();
    const menu = document.getElementById(btn.getAttribute('aria-controls')!)!;
    expect(menu.hidden).toBe(false);
    expect(menu.textContent).toContain('An owner of this workspace');
    const dark = [...menu.querySelectorAll<HTMLInputElement>('input[type=radio]')].find((r) => r.value === 'dark')!;
    dark.click(); flushSync();
    expect(ontheme).toHaveBeenCalledWith('dark');
    menu.querySelector<HTMLButtonElement>('button.suite-shell-signout')!.click();
    expect(onsignout).toHaveBeenCalled();
    btn.click(); flushSync();
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    flushSync();
    expect(menu.hidden).toBe(true);
    expect(document.activeElement).toBe(btn);
  });
  it('the suite switcher has its slot beside the account menu, and nothing is drawn without one', () => {
    open();
    expect(document.querySelector('[data-slot="suite-switcher"]')).toBeNull();
    unmount(c!); c = null; document.body.innerHTML = '';
    open({ suite });
    expect(document.querySelector('.suite-shell-end [data-slot="suite-switcher"] button')!.textContent).toBe('Products');
  });
});
