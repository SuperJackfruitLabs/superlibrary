// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import Count from './Count.svelte';
import { look } from '$lib/vibe/appearance.svelte';

let c: ReturnType<typeof mount> | null = null;
const was = look.appearance.vibe;
afterEach(() => { if (c) unmount(c); c = null; document.body.innerHTML = ''; look.appearance = { ...look.appearance, vibe: was }; });

describe('Count', () => {
  for (const vibe of ['daylight', 'quiet'] as const) {
    it(`${vibe}: a dash while unknown, never 0 and never the last view's number`, () => {
      window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
      look.appearance = { ...look.appearance, vibe };
      const props = $state<{ value: number | null }>({ value: null });
      c = mount(Count, { target: document.body, props });
      flushSync();
      expect(document.body.textContent).toBe('–');
      props.value = 14; flushSync();
      expect(document.body.textContent).toBe('14');
      props.value = null; flushSync();
      expect(document.body.textContent).toBe('–');
    });
  }
});
