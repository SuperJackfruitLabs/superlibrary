<script lang="ts">
  let { label, tiles }: { label: string; tiles: Array<{ key: string; value: string; tone?: string }> } = $props();
</script>

<dl class="sl-tiles" aria-label={label}>
  {#each tiles as t (t.key)}<div class="sl-tile" style:--o={t.tone}><dt>{t.key}</dt><dd>{t.value}</dd></div>{/each}
</dl>
