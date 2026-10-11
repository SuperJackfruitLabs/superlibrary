// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRawSnippet, flushSync, mount, unmount } from 'svelte';
import Enclosure from './Enclosure.svelte';

let c: ReturnType<typeof mount> | null = null;
const body = createRawSnippet(() => ({ render: () => '<p>Inside</p>' }));
beforeEach(() => { window.matchMedia = ((q: string) => ({ matches: q.includes('1024'), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia; });
afterEach(() => { if (c) unmount(c); c = null; document.body.innerHTML = ''; });

describe('an enclosure', () => {
  it('is a region named by its heading, whose button opens and closes it', () => {
    c = mount(Enclosure, { target: document.body, props: { id: 'v', title: 'Versions', summary: '2 versions', children: body } });
    flushSync();
    const region = document.querySelector('section.sl-enclosure')!;
    // The region and the heading are both named by the title alone; the summary is only in the button.
    expect(document.getElementById(region.getAttribute('aria-labelledby')!)!.textContent).toBe('Versions');
    const h2 = document.querySelector('h2')!;
    expect(document.getElementById(h2.getAttribute('aria-labelledby')!)!.textContent).toBe('Versions');
    const b = document.querySelector<HTMLButtonElement>('h2 > button.sl-enclosure-toggle')!;
    const panel = document.getElementById(b.getAttribute('aria-controls')!)!;
    expect(b.getAttribute('aria-expanded')).toBe('false');
    expect(panel.hidden).toBe(true);
    expect(b.textContent).toContain('2 versions');   // the closed state says what is inside
    b.click(); flushSync();
    expect(b.getAttribute('aria-expanded')).toBe('true');
    expect(panel.hidden).toBe(false);
    b.click(); flushSync();
    expect(panel.hidden).toBe(true);
  });
  it('opens by itself from a width, when asked', () => {
    c = mount(Enclosure, { target: document.body, props: { id: 'd', title: 'Details', openFrom: 1024, children: body } });
    flushSync();
    expect(document.querySelector('button.sl-enclosure-toggle')!.getAttribute('aria-expanded')).toBe('true');
  });
  it('stays closed below that width', () => {
    c = mount(Enclosure, { target: document.body, props: { id: 'd', title: 'Details', openFrom: 1280, children: body } });
    flushSync();
    expect(document.querySelector('button.sl-enclosure-toggle')!.getAttribute('aria-expanded')).toBe('false');
  });
});
