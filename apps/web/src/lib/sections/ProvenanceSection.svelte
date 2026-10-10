<script lang="ts">
  import type { ItemModel } from '$lib/screens/item.svelte';
  let { model }: { model: ItemModel } = $props();
</script>

<dl class="rows">
  {#each model.provenance as r (r.label)}<dt>{r.label}</dt><dd>{#if r.mono}<code>{r.value}</code>{:else}{r.value}{/if}</dd>{/each}
</dl>
