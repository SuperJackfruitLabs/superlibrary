<!-- apps/web/src/lib/kit/ParentMark.svelte -->
<script lang="ts">
  /**
   * The Super Jackfruit Labs mark (option C "Ink"): three hexagons, the cells of the jackfruit's skin,
   * white on the shared ink product tile. Stroked when large; filled at 32px and under, where a 3px
   * stroke would close the shapes up. Decorative unless `label` says it stands alone.
   */
  let { size = 24, tile = true, label }: { size?: number; tile?: boolean; label?: string } = $props();
  const HEX = ['M24 14l8 4.6v9.2L24 32.4l-8-4.6v-9.2z', 'M40 14l8 4.6v9.2L40 32.4l-8-4.6v-9.2z', 'M32 28l8 4.6v9.2L32 46.4l-8-4.6v-9.2z'];
  const style = $derived(size <= 32
    ? 'fill: var(--parent-mark); stroke: var(--parent-mark); stroke-width: 1.2; stroke-linejoin: round'
    : 'fill: none; stroke: var(--parent-mark); stroke-width: 3.2; stroke-linejoin: round');
</script>

<svg class="parent-mark" width={size} height={size} viewBox="0 0 64 64" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : 'true'} focusable="false">
  {#if tile}<rect width="64" height="64" rx="15" style="fill: var(--parent-tile)" />{/if}
  <g {style}>{#each HEX as d (d)}<path {d} />{/each}</g>
</svg>
