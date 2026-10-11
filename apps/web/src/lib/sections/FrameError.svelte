<script lang="ts">
  import type { ItemModel } from '$lib/screens/item.svelte';
  let { model }: { model: ItemModel } = $props();
</script>

{#if model.frameError}
  <div class="frame-error">
    <p class="error" role="alert">{model.frameError}</p>
    <div class="actions">
      {#if model.showLatestOffer}<a class="button" href={model.showUrl(undefined)} onclick={(e) => { e.preventDefault(); model.showLatest(); }}>Show the latest version</a>{/if}
      <button type="button" onclick={() => model.retryViewer()}>Try again</button>
    </div>
  </div>
{/if}
