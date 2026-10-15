/**
 * Loading, empty and failed: the three states every screen has, never mixed (catch-up audit S1-S5).
 * Loading draws the shape of the content with no numbers and no "nothing" words; empty is only said
 * after a read that worked came back with nothing; failed says it could not load and offers Try
 * again. A failed read is never drawn as empty.
 *
 * Timing: a skeleton appears only after 150 ms (a fast answer shows no flash) and, once shown, stays
 * at least 300 ms (no flicker). At 8 s the screen adds "Still loading — the server is slow."; at 20 s
 * a read gives up (api.ts aborts it) and the screen turns to Failed with Try again.
 */

export const SKELETON_DELAY_MS = 150;
export const SKELETON_MIN_MS = 300;
export const SLOW_MS = 8_000;
/** A read still unanswered after this is aborted (api.ts) and the screen says it failed. */
export const REQUEST_TIMEOUT_MS = 20_000;

export const SLOW_COPY = 'Still loading — the server is slow.';
/** 5xx, a network failure or a timeout: the read did not work. */
export const FAILED_COPY = "Couldn't load — try again.";
/** 404 or 403: the thing is not there for this person. */
export const MISSING_COPY = "This doesn't exist or isn't shared with you.";
export const TRY_AGAIN = 'Try again';
/** A count while it is pending: a dash, never 0. */
export const PENDING_COUNT = '–';

export type FailKind = 'missing' | 'failed';

/** 404 and 403 mean "not there for you"; anything else (5xx, network, timeout, no status) is a failure to load. */
export function failKindOf(status: number | null | undefined): FailKind {
  return status === 404 || status === 403 ? 'missing' : 'failed';
}
export const failCopy = (kind: FailKind): string => (kind === 'missing' ? MISSING_COPY : FAILED_COPY);

export const countOrDash = (n: number | null | undefined): string => (n === null || n === undefined ? PENDING_COUNT : String(n));

export type PendingPhase = 'idle' | 'waiting' | 'showing' | 'holding';
export interface PendingState { phase: PendingPhase; slow: boolean }
interface Timers { set(fn: () => void, ms: number): unknown; clear(id: unknown): void; now(): number }
const realTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
};

/**
 * The skeleton's clock. `set(true)` starts a wait; after 150 ms the skeleton shows; `set(false)`
 * before then ends it with nothing shown; after it showed, it holds until it has been up 300 ms. At
 * 8 s `slow` turns on.
 */
export class PendingClock {
  #s: PendingState = { phase: 'idle', slow: false };
  #shownAt = 0;
  #show: unknown;
  #slow: unknown;
  #hold: unknown;
  constructor(private readonly onChange: (s: PendingState) => void, private readonly t: Timers = realTimers) {}

  get state(): PendingState { return this.#s; }

  #emit(next: Partial<PendingState>): void {
    this.#s = { ...this.#s, ...next };
    this.onChange(this.#s);
  }
  #clear(): void {
    for (const id of [this.#show, this.#slow, this.#hold]) if (id !== undefined) this.t.clear(id);
    this.#show = this.#slow = this.#hold = undefined;
  }

  set(pending: boolean): void {
    const { phase } = this.#s;
    if (pending) {
      if (phase === 'waiting' || phase === 'showing') return;
      if (phase === 'holding') {
        if (this.#hold !== undefined) this.t.clear(this.#hold);
        this.#hold = undefined;
        this.#emit({ phase: 'showing' });
        return;
      }
      this.#show = this.t.set(() => { this.#show = undefined; this.#shownAt = this.t.now(); this.#emit({ phase: 'showing' }); }, SKELETON_DELAY_MS);
      this.#slow = this.t.set(() => { this.#slow = undefined; this.#emit({ slow: true }); }, SLOW_MS);
      this.#emit({ phase: 'waiting', slow: false });
      return;
    }
    if (phase === 'idle' || phase === 'holding') return;
    const left = phase === 'showing' ? this.#shownAt + SKELETON_MIN_MS - this.t.now() : 0;
    this.#clear();
    if (left > 0) {
      this.#hold = this.t.set(() => { this.#hold = undefined; this.#emit({ phase: 'idle' }); }, left);
      this.#emit({ phase: 'holding', slow: false });
    } else this.#emit({ phase: 'idle', slow: false });
  }

  dispose(): void { this.#clear(); }
}

/** The boot screen's words over time: Connecting…, then slow at 8 s; at 20 s it has failed (the read is aborted). */
export function bootWords(elapsedMs: number): string {
  return elapsedMs >= SLOW_MS ? SLOW_COPY : 'Connecting…';
}

/**
 * `fetch` with a deadline for reads: a GET (or HEAD) without its own signal is aborted after
 * REQUEST_TIMEOUT_MS, so a server that never answers ends in Failed, never in loading forever.
 * Writes are never aborted: one may still land.
 */
/** A signal that aborts after `ms`: for a read sent as a POST (browse, search, related), which withReadTimeout leaves alone. */
export function readDeadline(ms = REQUEST_TIMEOUT_MS): AbortSignal {
  const ctl = new AbortController();
  setTimeout(() => ctl.abort(new DOMException('The server did not answer in time.', 'TimeoutError')), ms);
  return ctl.signal;
}

export function withReadTimeout(fetchFn: typeof fetch, ms = REQUEST_TIMEOUT_MS): typeof fetch {
  return (input, init = {}) => {
    const method = (init.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if ((method !== 'GET' && method !== 'HEAD') || init.signal) return fetchFn(input, init);
    // A timer and a controller (not AbortSignal.timeout): the same everywhere, and fake timers drive it in tests.
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(new DOMException('The server did not answer in time.', 'TimeoutError')), ms);
    return fetchFn(input, { ...init, signal: ctl.signal }).finally(() => clearTimeout(t));
  };
}
