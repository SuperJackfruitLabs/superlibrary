import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FAILED_COPY, MISSING_COPY, PendingClock, REQUEST_TIMEOUT_MS, SKELETON_DELAY_MS, SKELETON_MIN_MS, SLOW_COPY, SLOW_MS,
  bootWords, countOrDash, failCopy, failKindOf, withReadTimeout, type PendingState,
} from './loading';

describe('failKindOf', () => {
  it('tells "not there for you" (404/403) from "could not load" (5xx, network, timeout)', () => {
    expect(failKindOf(404)).toBe('missing');
    expect(failKindOf(403)).toBe('missing');
    expect(failKindOf(500)).toBe('failed');
    expect(failKindOf(null)).toBe('failed');
    expect(failCopy('missing')).toBe(MISSING_COPY);
    expect(failCopy('failed')).toBe(FAILED_COPY);
  });
  it('never words a failure with a raw code', () => {
    for (const s of [FAILED_COPY, MISSING_COPY, SLOW_COPY]) expect(s).not.toMatch(/HTTP|\(\d{3}\)|\b[a-z]+_[a-z]+\b/);
  });
});

describe('counts while pending', () => {
  it('shows a dash, never 0, until the count is known', () => {
    expect(countOrDash(null)).toBe('–');
    expect(countOrDash(undefined)).toBe('–');
    expect(countOrDash(0)).toBe('0');
  });
});

describe('boot words', () => {
  it('says Connecting… and then that the server is slow at 8 s', () => {
    expect(bootWords(0)).toBe('Connecting…');
    expect(bootWords(SLOW_MS - 1)).toBe('Connecting…');
    expect(bootWords(SLOW_MS)).toBe(SLOW_COPY);
  });
});

describe('withReadTimeout', () => {
  it('gives a read a 20 s deadline and leaves writes alone', async () => {
    const seen: (AbortSignal | null | undefined)[] = [];
    const f = withReadTimeout((async (_u: unknown, init?: RequestInit) => { seen.push(init?.signal); return new Response('{}'); }) as typeof fetch);
    await f('/api/v1/me');
    await f('/api/v1/items', { method: 'POST', body: '{}' });
    expect(seen[0]).toBeInstanceOf(AbortSignal);
    expect(seen[1]).toBeUndefined();
    expect(REQUEST_TIMEOUT_MS).toBe(20_000);
  });
  it('a read that never answers is aborted', async () => {
    const never = withReadTimeout(((_u: unknown, init?: RequestInit) => new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason)))) as typeof fetch, 30);
    await expect(never('/api/v1/me')).rejects.toThrow();
  });
  it('keeps a signal the caller gave', async () => {
    const own = new AbortController().signal;
    let got: AbortSignal | null | undefined;
    await withReadTimeout((async (_u: unknown, init?: RequestInit) => { got = init?.signal; return new Response(''); }) as typeof fetch)('/x', { signal: own });
    expect(got).toBe(own);
  });
});

describe('PendingClock', () => {
  let now = 0;
  const timers: { at: number; fn: () => void; id: number }[] = [];
  let nextId = 0;
  const t = {
    set: (fn: () => void, ms: number) => { const id = ++nextId; timers.push({ at: now + ms, fn, id }); return id; },
    clear: (id: unknown) => { const i = timers.findIndex((x) => x.id === id); if (i >= 0) timers.splice(i, 1); },
    now: () => now,
  };
  const advance = (ms: number) => {
    const end = now + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const due = timers[0];
      if (!due || due.at > end) break;
      timers.shift();
      now = due.at;
      due.fn();
    }
    now = end;
  };
  let states: PendingState[];
  let clock: PendingClock;
  beforeEach(() => { now = 0; timers.length = 0; states = []; clock = new PendingClock((s) => states.push(s), t); });
  afterEach(() => clock.dispose());

  it('a fast answer shows no skeleton at all', () => {
    clock.set(true);
    advance(SKELETON_DELAY_MS - 1);
    clock.set(false);
    expect(states.some((s) => s.phase === 'showing')).toBe(false);
    expect(clock.state.phase).toBe('idle');
  });
  it('a skeleton that showed stays at least 300 ms', () => {
    clock.set(true);
    advance(SKELETON_DELAY_MS);
    expect(clock.state.phase).toBe('showing');
    advance(10);
    clock.set(false);
    expect(clock.state.phase).toBe('holding');
    advance(SKELETON_MIN_MS - 11);
    expect(clock.state.phase).toBe('holding');
    advance(1);
    expect(clock.state.phase).toBe('idle');
  });
  it('turns slow at 8 s', () => {
    clock.set(true);
    advance(SLOW_MS - 1);
    expect(clock.state.slow).toBe(false);
    advance(1);
    expect(clock.state.slow).toBe(true);
  });
});
