/**
 * Gap S4: where a search or a related call spends its time, as `Server-Timing` stage durations.
 * Names and milliseconds only. In Workers, Date.now() advances on I/O, not during CPU work, so a
 * stage measures its storage, AI and network waits, which is what the claim budget is spent on.
 */
export type Stage = 'auth' | 'scopes' | 'basis' | 'embed' | 'vector' | 'fts' | 'recheck' | 'hydrate' | 'fit' | 'audit';

export class Timer {
  private readonly ms = new Map<Stage, number>();
  async time<T>(stage: Stage, fn: () => Promise<T>): Promise<T> {
    const t0 = Date.now();
    try {
      return await fn();
    } finally {
      this.add(stage, Date.now() - t0);
    }
  }
  add(stage: Stage, ms: number): void {
    this.ms.set(stage, (this.ms.get(stage) ?? 0) + ms);
  }
  header(): string {
    return [...this.ms].map(([s, ms]) => `${s};dur=${ms}`).join(', ');
  }
}
