<script lang="ts">
  /**
   * The loading stand-in every screen shares (catch-up S3/S5). It reserves the space of the content
   * it stands for from the first frame (so nothing jumps when the data lands), shows its bars only
   * after 150 ms (a fast answer flashes nothing) and sits in aria-busy. Its words go to the screen's
   * one polite status line (`loadingStatus`, drawn by +layout.svelte), so a screen with two of these
   * still says one thing.
   *
   * By vibe (app.css, .sl-skeleton): Daylight soft rounded bars with a gentle shimmer; Paper
   * hairline-ruled blank lines, no shimmer; Studio grey blocks with "— LOADING" in mono; Quiet the
   * word "Loading…" alone, no bars, no motion. Reduced motion is static.
   *
   * `shape`: `rows` (a list: a title line and a meta line per row), `item` (an item page's header,
   * its viewer frame and its versions table).
   */
  import { onMount } from 'svelte';
  import { SKELETON_DELAY_MS, SLOW_COPY } from '$lib/loading';
  import { loadingStatus } from '$lib/loading.svelte';

  let { label, rows = 6, rowHeight = 64, shape = 'rows', minHeight }: { label: string; rows?: number; rowHeight?: number; shape?: 'rows' | 'item'; minHeight?: string } = $props();
  const WIDTHS = ['92%', '74%', '58%', '83%', '66%'];
  let on = $state(false);
  onMount(() => {
    const t = setTimeout(() => (on = true), SKELETON_DELAY_MS);
    const drop = loadingStatus.add(label);
    return () => { clearTimeout(t); drop(); };
  });
</script>

<div class="sl-skeleton sl-skeleton--{shape}" class:sl-skeleton--on={on} aria-busy="true" aria-label={label} data-skeleton
  style:min-height={minHeight ?? (shape === 'rows' ? `${rows * rowHeight}px` : undefined)}>
  <span class="sl-skeleton__word sl-skeleton__word--quiet" aria-hidden="true">Loading…</span>
  <span class="sl-skeleton__word sl-skeleton__word--studio" aria-hidden="true">— LOADING</span>
  {#if shape === 'item'}
    <span class="sl-skeleton__head" aria-hidden="true"><span class="sl-sk sl-sk--title" style="width: 64%;"></span><span class="sl-sk sl-sk--meta" style="width: 42%;"></span></span>
    <span class="sl-sk sl-sk--frame" aria-hidden="true"></span>
    {#each Array.from({ length: rows }, (_, i) => i) as i (i)}
      <span class="sl-skeleton__row" aria-hidden="true" style:min-height="{rowHeight}px"><span class="sl-sk" style:width={WIDTHS[i % WIDTHS.length]}></span></span>
    {/each}
  {:else}
    {#each Array.from({ length: rows }, (_, i) => i) as i (i)}
      <span class="sl-skeleton__row" aria-hidden="true" style:min-height="{rowHeight}px"><span class="sl-sk" style:width={WIDTHS[i % WIDTHS.length]}></span><span class="sl-sk sl-sk--meta"></span></span>
    {/each}
  {/if}
  {#if loadingStatus.slow}<span class="sl-skeleton__slow">{SLOW_COPY}</span>{/if}
</div>
