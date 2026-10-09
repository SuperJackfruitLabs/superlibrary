// apps/web/src/lib/kit/SuiteSwitcher.svelte.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import SuiteSwitcher from './SuiteSwitcher.svelte';
import SuiteFooter from './SuiteFooter.svelte';
import { PRODUCTS } from './suite.generated';

const mounted: ReturnType<typeof mount>[] = [];
afterEach(() => { for (const c of mounted.splice(0)) unmount(c); document.body.innerHTML = ''; });

describe('the parent in the shell (option C "Ink")', () => {
  it('the switcher is headed by the parent mark and name, and lists products with addresses, the current one marked', () => {
    mounted.push(mount(SuiteSwitcher, { target: document.body, props: { products: PRODUCTS, current: 'superlibrary' } }));
    flushSync();
    const btn = document.querySelector<HTMLButtonElement>('button.suite-switcher')!;
    expect(btn.textContent!.trim()).toBe('Products');
    expect(btn.querySelector('svg.parent-mark')).not.toBeNull();
    btn.click(); flushSync();
    const panel = document.getElementById(btn.getAttribute('aria-controls')!)!;
    expect(panel.querySelector('.suite-head')!.textContent).toContain('Super Jackfruit Labs');
    expect(panel.querySelector('.suite-head svg.parent-mark')).not.toBeNull();
    const links = [...panel.querySelectorAll('a')];
    expect(links.map((a) => a.textContent!.trim())).toEqual(['AgentPod', 'Superpipeline', 'Superlibrary']);   // no address yet: not linked
    expect(panel.querySelector('[aria-current="true"]')!.textContent).toContain('Superlibrary');
  });
  it('the parent mark is three hexagons on the ink tile, filled when small', () => {
    mounted.push(mount(SuiteFooter, { target: document.body, props: {} }));
    flushSync();
    const link = document.querySelector<HTMLAnchorElement>('footer a')!;
    expect(link.textContent!.trim()).toBe('Super Jackfruit Labs');
    expect(link.getAttribute('href')).toBe('https://superjackfruit.com');
    const svg = link.querySelector('svg.parent-mark')!;
    expect(svg.getAttribute('viewBox')).toBe('0 0 64 64');
    expect(svg.querySelectorAll('path')).toHaveLength(3);
    expect(svg.querySelector('rect')!.getAttribute('rx')).toBe('15');
    expect(svg.querySelector('g')!.getAttribute('style')).toContain('fill: var(--parent-mark)');   // 20px: the filled variant
  });
});
