// apps/web/src/lib/kit/kit.svelte.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import Button from './Button.svelte';
import Tabs from './Tabs.svelte';
import Toolbar from './Toolbar.svelte';
import Toast from './Toast.svelte';
import EmptyState from './EmptyState.svelte';
import OutcomeBadge from './OutcomeBadge.svelte';
import { createRawSnippet } from 'svelte';

const mounted: ReturnType<typeof mount>[] = [];
const put = (C: any, props: Record<string, unknown>) => { const c = mount(C, { target: document.body, props }); mounted.push(c); flushSync(); return c; };
const text = (s: string) => createRawSnippet(() => ({ render: () => `<span>${s.replace(/</g, '&lt;')}</span>` }));
afterEach(() => { for (const c of mounted.splice(0)) unmount(c); document.body.innerHTML = ''; });

describe('the kit', () => {
  it('a Button with href is a link; without, a button; danger says so in its class', () => {
    put(Button, { href: '/upload', children: text('Upload') });
    put(Button, { variant: 'danger', onclick: vi.fn(), children: text('Remove') });
    expect(document.querySelector('a.kit-button')!.getAttribute('href')).toBe('/upload');
    expect(document.querySelector('button.kit-button--danger')!.getAttribute('type')).toBe('button');
    expect(document.querySelector('a.kit-button')!.classList.contains('vk-button')).toBe(true);
    expect(document.querySelector('a.kit-button--secondary.vk-button--secondary')).not.toBeNull();
    expect(document.querySelector('button.kit-button--danger')!.classList.contains('sl-danger')).toBe(true);
    expect(document.querySelector('button.kit-button--danger')!.classList.contains('vk-button')).toBe(true);
  });
  it('Tabs mark the current one and show counts', () => {
    put(Tabs, { label: 'Outcome', items: [{ href: '/o', label: 'Everything', count: 3, current: false }, { href: '/o?outcome=rejected', label: 'Rejected', count: 1, current: true, tone: 'rejected' }] });
    const nav = document.querySelector('nav')!;
    expect(nav.getAttribute('aria-label')).toBe('Outcome');
    expect(document.querySelector('[aria-current="page"]')!.textContent).toContain('Rejected');
    expect(document.querySelector('[aria-current="page"]')!.textContent).toContain('1');
  });
  it('a Toolbar shows every item with its words, and folds the secondary ones into a labelled More', () => {
    const copy = vi.fn();
    put(Toolbar, { label: 'Item', items: [{ label: 'Upload a new version', icon: 'upload', href: '/upload?item=x', primary: true }, { label: 'Copy link', icon: 'link', onclick: copy }] });
    const bar = document.querySelector('[role="toolbar"]')!;
    expect(bar.getAttribute('aria-label')).toBe('Item');
    expect([...bar.querySelectorAll('.kit-toolbar-item')].map((e) => e.textContent!.trim())).toEqual(['Upload a new version', 'Copy link']);
    const more = bar.querySelector<HTMLButtonElement>('button.kit-more')!;
    expect(more.textContent!.trim()).toBe('More');
    more.click(); flushSync();
    const panel = document.getElementById(more.getAttribute('aria-controls')!)!;
    expect(panel.hidden).toBe(false);
    [...panel.querySelectorAll('button')].find((b) => b.textContent!.trim() === 'Copy link')!.click();
    expect(copy).toHaveBeenCalled();
  });
  it('a Toast speaks, and a danger Toast interrupts', () => {
    put(Toast, { message: 'Saved.' });
    put(Toast, { message: 'Could not save.', tone: 'danger' });
    expect(document.querySelector('[role="status"]')!.textContent).toContain('Saved.');
    expect(document.querySelector('[role="alert"]')!.textContent).toContain('Could not save.');
  });
  it('an EmptyState directs, and the outcome is a word', () => {
    put(EmptyState, { title: 'Nothing here yet', body: 'Upload a file or a folder.' });
    put(OutcomeBadge, { outcome: 'in-progress' });
    expect(document.querySelector('.kit-empty h2')!.textContent).toBe('Nothing here yet');
    expect(document.querySelector('.outcome')!.textContent).toBe('In progress');
  });
});
