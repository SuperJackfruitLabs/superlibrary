<script lang="ts">
  import Button from '$kit/Button.svelte';
  import type { CollectionModel } from '$lib/screens/collections.svelte';
  let { model }: { model: CollectionModel } = $props();
</script>

{#if model.c?.canEdit}
  {#if model.editing}
    <form class="inline-form" novalidate onsubmit={(e) => model.save(e)}>
      <label class="field">Name <input bind:value={model.name} maxlength="120" /></label>
      <label class="field">Description <input bind:value={model.description} maxlength="1000" /></label>
      <Button variant="primary" type="submit">Save</Button>
      <button type="button" onclick={() => model.stopEditing()}>Cancel</button>
    </form>
    {#if model.editError}<p class="error" role="alert">{model.editError}</p>{/if}
  {:else}
    <div class="actions collection-actions">
      <button type="button" {@attach model.renameAnchor} onclick={() => model.startEdit()}>Rename or describe</button>
      <Button variant="danger" onclick={(e) => model.askDelete(e)}>Delete collection</Button>
    </div>
  {/if}
{/if}
