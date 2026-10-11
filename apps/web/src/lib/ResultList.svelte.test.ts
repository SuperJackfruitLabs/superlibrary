// apps/web/src/lib/ResultList.svelte.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import ResultList from './ResultList.svelte';

let c: ReturnType<typeof mount> | null = null;
afterEach(() => { if (c) unmount(c); c = null; document.body.innerHTML = ''; });

describe('ResultList', () => {
  it('a title with markup is shown as text', () => {
    c = mount(ResultList, { target: document.body, props: { label: 'Search results', rows: [
      { id: 'itm_0123456789abcdef', title: '<img src=x onerror=alert(1)>Plan', kind: 'artifact', outcome: 'rejected', line: 'Artifact', snippet: '<script>alert(2)</script>', supersededBy: 'itm_0123456789abcde0', visibility: 'Everyone in the workspace', kindWord: 'Artifact', board: null, station: null, path: null, maker: null },
    ] } });
    flushSync();
    expect(document.querySelector('img, script')).toBeNull();
    expect(document.body.textContent).toContain('<img src=x onerror=alert(1)>Plan');
    expect(document.body.textContent).toContain('Rejected');
    expect(document.body.textContent).toContain('Everyone in the workspace');
    expect(document.querySelector('a.result-link')!.getAttribute('href')).toBe('/a/itm_0123456789abcdef');
    expect(document.querySelector('a.replaced')!.getAttribute('href')).toBe('/a/itm_0123456789abcde0');
    expect(document.querySelector('ul')!.getAttribute('aria-label')).toBe('Search results');
  });
});
