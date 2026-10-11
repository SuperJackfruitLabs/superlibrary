// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
const ctl = vi.hoisted(() => ({ fail: false, hold: null as Promise<void> | null }));
vi.mock('$lib/session.svelte', async () => {
  const { FIX } = await import('$lib/screens/parity.fixture');
  return { session: { me: FIX.me, notEnabled: null }, api: async (p: string, i?: RequestInit) => { if (p === '/api/v1/browse') { if (ctl.hold) await ctl.hold; if (ctl.fail) return Response.json({ error: 'boom' }, { status: 500 }); } return FIX.respond(p, i); } };
});
const pg = vi.hoisted(() => ({ url: new URL('http://localhost/') }));
vi.mock('$app/state', () => ({ page: pg }));
vi.mock('$app/navigation', () => ({ goto: vi.fn(), replaceState: vi.fn() }));
import { look } from '$lib/vibe/appearance.svelte';
import Page from '../../../routes/+page.svelte';

let c: ReturnType<typeof mount> | null = null;
const settle = async () => { for (let i = 0; i < 8; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); } };
const was = { vibe: look.appearance.vibe, timeStrength: look.appearance.timeStrength, phase: look.phase };
beforeEach(() => { window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia; look.appearance = { ...look.appearance, vibe: 'quiet' }; });
afterEach(() => { pg.url = new URL('http://localhost/'); ctl.fail = false; ctl.hold = null; if (c) unmount(c); c = null; document.body.innerHTML = ''; look.appearance = { ...look.appearance, vibe: was.vibe, timeStrength: was.timeStrength }; look.phase = was.phase; });

describe('Quiet: the library as a printed page', () => {
  it('a visible search label, filters open, plain rows that say their facts in words, no faces and no sky', async () => {
    c = mount(Page, { target: document.body });
    await settle();
    expect(document.querySelector('label[for="q"]')!.classList.contains('visually-hidden')).toBe(false);
    expect(document.querySelector<HTMLDetailsElement>('details.filters')!.open).toBe(true);
    const first = document.querySelector('ul.results--plain[aria-label="Library"] > li')!;
    expect(first.querySelector('.sl-facts-line')!.textContent!.replace(/\s+/g, ' ').trim()).toBe('Outcome: Completed. Artifact · Parity board · docs · out/report. Visible to: Everyone in the workspace.');
    expect(document.querySelector('.vk-face, .vk-sky')).toBeNull();
  });

  it('the time line shows when time of day is on, and is absent when it is off', async () => {
    look.phase = 'golden';
    look.appearance = { ...look.appearance, timeStrength: 'subtle' };
    c = mount(Page, { target: document.body });
    await settle();
    expect([...document.querySelectorAll('.sl-quiet > p')].some((p) => p.textContent === 'Time of day: golden hour')).toBe(true);
    unmount(c);
    document.body.innerHTML = '';
    look.appearance = { ...look.appearance, timeStrength: 'off' };
    c = mount(Page, { target: document.body });
    await settle();
    expect(document.body.textContent).not.toContain('Time of day');
  });
});
