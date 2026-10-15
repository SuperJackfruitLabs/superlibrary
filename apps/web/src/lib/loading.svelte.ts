/**
 * The reactive side of loading.ts: a pending gate a screen reads, and the one polite status line per
 * screen (drawn once, in +layout.svelte) that every skeleton reports to.
 */
import { untrack } from 'svelte';
import { PendingClock, SLOW_MS, type PendingPhase } from './loading';

export interface Pending {
  /** Draw the loading form (the reserved space; the bars once `skeleton`). */
  readonly busy: boolean;
  /** The skeleton is showing: 150 ms in, held at least 300 ms. */
  readonly skeleton: boolean;
  /** Still pending after 8 s. */
  readonly slow: boolean;
}

/**
 * Follow `get()` (true while a read is pending) through the skeleton clock. Call it during component
 * initialisation (it owns effects). The first value is read synchronously, so the first frame is
 * already the loading form, never a flash of "nothing".
 */
export function pending(get: () => boolean): Pending {
  const s = $state<{ phase: PendingPhase; slow: boolean }>({ phase: 'idle', slow: false });
  const clock = new PendingClock((next) => { s.phase = next.phase; s.slow = next.slow; });
  clock.set(untrack(get));
  $effect.pre(() => { clock.set(get()); });
  $effect(() => () => clock.dispose());
  return {
    get busy() { return s.phase !== 'idle'; },
    get skeleton() { return s.phase === 'showing' || s.phase === 'holding'; },
    get slow() { return s.slow; },
  };
}

/**
 * The screen's one polite status line. Each skeleton adds its words while it is up; the line says
 * the first, and from 8 s on that the server is slow. When nothing is loading it says the screen's
 * last settled words (`say`), such as how many results a search found.
 */
class LoadingStatus {
  #items = $state<{ id: number; label: string; since: number }[]>([]);
  #next = 0;
  #said = $state('');
  now = $state(Date.now());
  #tick: ReturnType<typeof setInterval> | undefined;

  add(label: string): () => void {
    const id = ++this.#next;
    this.#items.push({ id, label, since: Date.now() });
    this.#watch();
    return () => {
      this.#items = this.#items.filter((i) => i.id !== id);
      this.#watch();
    };
  }
  /** The screen's settled words (a result count); cleared on navigation by the layout. */
  say(words: string): void { this.#said = words; }
  #watch(): void {
    if (typeof window === 'undefined') return;
    if (this.#items.length > 0 && this.#tick === undefined) {
      this.now = Date.now();
      this.#tick = setInterval(() => { this.now = Date.now(); }, 1000);
    } else if (this.#items.length === 0 && this.#tick !== undefined) {
      clearInterval(this.#tick);
      this.#tick = undefined;
    }
  }
  get loading(): boolean { return this.#items.length > 0; }
  get label(): string { return this.#items[0]?.label ?? this.#said; }
  get slow(): boolean {
    const first = this.#items.reduce((t, i) => Math.min(t, i.since), Infinity);
    return this.#items.length > 0 && this.now - first >= SLOW_MS;
  }
}

export const loadingStatus = new LoadingStatus();
