<script lang="ts">
  let { label, tiles, cls }: { label: string; tiles: Array<{ key: string; value: string; tone?: string }>; cls?: string } = $props();
</script>

<dl class={['sl-tiles', cls]} aria-label={label}>
  {#each tiles as t (t.key)}<div class="sl-tile" style:--o={t.tone}><dt>{t.key}</dt><dd>{t.value}</dd></div>{/each}
</dl>
