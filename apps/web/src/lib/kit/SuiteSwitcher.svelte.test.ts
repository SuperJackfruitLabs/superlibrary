// apps/web/src/lib/kit/SuiteSwitcher.svelte.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import SuiteSwitcher from './SuiteSwitcher.svelte';
import SuiteFooter from './SuiteFooter.svelte';
const PRODUCTS = [
  { key: 'agentpod', name: 'AgentPod', url: 'https://a.example' },
  { key: 'later', name: 'Later', url: '' },
  { key: 'superlibrary', name: 'Superlibrary', url: 'https://b.example' },
];

const mounted: ReturnType<typeof mount>[] = [];
afterEach(() => { for (const c of mounted.splice(0)) unmount(c); document.body.innerHTML = ''; });

describe('the parent in the shell', () => {
  it('closes on Escape from its button and on a click outside', () => {
    mounted.push(mount(SuiteSwitcher, { target: document.body, props: { products: PRODUCTS, current: 'superlibrary' } }));
    flushSync();
    const btn = document.querySelector<HTMLButtonElement>('button.suite-switcher')!;
    const panel = document.getElementById(btn.getAttribute('aria-controls')!)!;
    btn.click(); flushSync();
    expect(panel.hidden).toBe(false);
    btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); flushSync();
    expect(panel.hidden).toBe(true);
    expect(document.activeElement).toBe(btn);
    btn.click(); flushSync();
    document.body.click(); flushSync();
    expect(panel.hidden).toBe(true);
  });
  it("the switcher is headed by the parent's name, and lists products with addresses, the current one marked", () => {
    mounted.push(mount(SuiteSwitcher, { target: document.body, props: { products: PRODUCTS, current: 'superlibrary' } }));
    flushSync();
    const btn = document.querySelector<HTMLButtonElement>('button.suite-switcher')!;
    expect(btn.textContent!.trim()).toBe('Products');
    btn.click(); flushSync();
    const panel = document.getElementById(btn.getAttribute('aria-controls')!)!;
    expect(panel.querySelector('.suite-head')!.textContent).toContain('Super Jackfruit Labs');
    const links = [...panel.querySelectorAll('a')];
    expect(links.map((a) => a.textContent!.trim())).toEqual(['AgentPod', 'Superlibrary']);   // no address yet: not linked
    expect(panel.querySelector('[aria-current="true"]')!.textContent).toContain('Superlibrary');
    const chip = document.querySelector<HTMLElement>('.suite-list li')!;
    expect(chip.style.getPropertyValue('--chip-bg')).toMatch(/^var\(--vk-product-[a-z]+-bg\)$/);
    expect(chip.style.getPropertyValue('--chip-fg')).toMatch(/^var\(--vk-product-[a-z]+-fg\)$/);
    expect(document.querySelector('svg.parent-mark')).toBeNull();
  });
  it('the footer names the parent and links to it, with no mark', () => {
    mounted.push(mount(SuiteFooter, { target: document.body, props: {} }));
    flushSync();
    const link = document.querySelector<HTMLAnchorElement>('footer a')!;
    expect(link.textContent!.trim()).toBe('Super Jackfruit Labs');
    expect(link.getAttribute('href')).toBe('https://superjackfruit.com');
    expect(link.querySelector('svg')).toBeNull();
  });
});
