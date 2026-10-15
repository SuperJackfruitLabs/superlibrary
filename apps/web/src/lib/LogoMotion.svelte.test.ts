// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import LogoMotion from './LogoMotion.svelte';
import { resetIntroForTest } from '$lib/logo-motion';
import { look } from '$lib/vibe/appearance.svelte';

const BUNDLE = readFileSync(join(__dirname, '..', '..', 'static', 'brand', 'logo-motion.js'), 'utf8');
let reduce = false;
let plays = 0;
let c: ReturnType<typeof mount> | null = null;
const was = look.appearance.vibe;

beforeEach(() => {
  reduce = false; plays = 0; resetIntroForTest();
  window.matchMedia = ((q: string) => ({ get matches() { return q.includes('reduced-motion') && reduce; }, media: q, addEventListener() {}, removeEventListener() {} })) as never;
  delete window.SJLLogoMotion;
  window.eval(BUNDLE);
  const real = window.SJLLogoMotion!;
  window.SJLLogoMotion = { create(el, id) { const i = real.create(el, id); return { ...i, play: () => { plays++; return Promise.resolve({ status: 'finished' as const }); } }; } };
});
afterEach(() => { if (c) unmount(c); c = null; document.body.innerHTML = ''; look.appearance = { ...look.appearance, vibe: was }; });
const settle = async () => { for (let i = 0; i < 4; i++) { await Promise.resolve(); await tick(); flushSync(); } };

describe('LogoMotion', () => {
  it('draws the Superlibrary master and plays the intro once per session', async () => {
    look.appearance = { ...look.appearance, vibe: 'daylight' };
    c = mount(LogoMotion, { target: document.body, props: { playIntro: true } });
    await settle();
    expect(document.querySelectorAll('svg')).toHaveLength(1);
    expect(plays).toBe(1);
    unmount(c);
    c = mount(LogoMotion, { target: document.body, props: { playIntro: true } });
    await settle();
    expect(plays).toBe(1);
  });
  it('never plays under reduced motion, data-motion="reduce" or in Quiet', async () => {
    for (const setup of [() => { reduce = true; }, () => document.documentElement.setAttribute('data-motion', 'reduce'), () => { look.appearance = { ...look.appearance, vibe: 'quiet' }; }]) {
      resetIntroForTest(); reduce = false; document.documentElement.removeAttribute('data-motion'); look.appearance = { ...look.appearance, vibe: 'daylight' };
      setup();
      c = mount(LogoMotion, { target: document.body, props: { playIntro: true } });
      await settle();
      expect(plays).toBe(0);
      unmount(c); c = null;
    }
    document.documentElement.removeAttribute('data-motion');
  });
});
