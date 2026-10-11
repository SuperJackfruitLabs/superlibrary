<script lang="ts">
  import type { ItemModel } from '$lib/screens/item.svelte';
  let { model, heading, level = 2 }: { model: ItemModel; heading: string; level?: 2 | 3 } = $props();
</script>

<!-- novalidate: the page says why in words, the same on every browser (iOS does not enforce min). -->
<form class="stack" novalidate onsubmit={(e) => { e.preventDefault(); void model.saveExpiry(false); }}>
  <svelte:element this={`h${level}`}>{heading}</svelte:element>
  <label class="field">Delete on <input name="expires" type="date" min={model.tomorrow} bind:value={model.expires} disabled={model.saving} /></label>
  {#if model.expiryError}<p class="error" role="alert">{model.expiryError}</p>{/if}
  <div class="actions">
    <button type="submit" disabled={model.saving || !model.expires}>Set the delete date</button>
    {#if model.item?.expiresAt || model.phase === 'expired'}<button type="button" disabled={model.saving} onclick={() => model.saveExpiry(true)}>Keep it (no delete date)</button>{/if}
  </div>
</form>
