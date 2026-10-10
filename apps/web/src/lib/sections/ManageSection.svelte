<script lang="ts">
  import ModerationPanel from '$lib/ModerationPanel.svelte';
  import type { ItemModel } from '$lib/screens/item.svelte';
  import ExpiryForm from './ExpiryForm.svelte';
  let { model, level = 2 }: { model: ItemModel; level?: 2 | 3 } = $props();
</script>

{#if model.manage && model.item}
  <ModerationPanel item={model.item} {level} onchanged={(n) => model.moderated(n)} onremoved={() => model.removedNow()} />
  <div class="panel"><ExpiryForm {model} heading={model.expiryHeading} {level} /></div>
  <div class="panel">
    <svelte:element this={`h${level}`}>Revoke</svelte:element>
    <p class="muted">Nobody will be able to view it again. The record of it stays.</p>
    <button type="button" class="danger" onclick={(e) => model.revokeItem(e)}>Revoke this item</button>
  </div>
{/if}
