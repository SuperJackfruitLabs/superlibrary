// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import FilterBar from './FilterBar.svelte';
import { EMPTY_FILTERS } from '$lib/library';

let c: ReturnType<typeof mount> | null = null;
const asked: string[] = [];
const run = (props: { openFrom?: number }, matches: boolean) => {
  asked.length = 0;
  window.matchMedia = ((q: string) => { asked.push(q); return { matches, media: q, addEventListener() {}, removeEventListener() {} }; }) as unknown as typeof window.matchMedia;
  c = mount(FilterBar, { target: document.body, props: { filters: EMPTY_FILTERS, facets: null, onchange: vi.fn(), ...props } });
  flushSync();
  return document.querySelector('details.filters') as HTMLDetailsElement;
};
afterEach(() => { if (c) unmount(c); c = null; document.body.innerHTML = ''; });

describe('FilterBar openFrom', () => {
  it('asks for the width it was given, 768 by default', () => {
    expect(run({}, true).open).toBe(true);
    expect(asked).toEqual(['(min-width: 768px)']);
    unmount(c!); document.body.innerHTML = '';
    run({ openFrom: 1024 }, false);
    expect(asked).toEqual(['(min-width: 1024px)']);
  });
  it('0 opens it at every width without asking', () => {
    expect(run({ openFrom: 0 }, false).open).toBe(true);
    expect(asked).toEqual([]);
  });
  it('stays folded when the width does not match', () => {
    expect(run({}, false).open).toBe(false);
  });
});
