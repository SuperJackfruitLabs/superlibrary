<script lang="ts">
  import Button from '$kit/Button.svelte';
  import type { CollectionsModel } from '$lib/screens/collections.svelte';
  let { model }: { model: CollectionsModel } = $props();
</script>

<form class="inline-form" novalidate onsubmit={(e) => model.create(e)}>
  <label class="field">Name <input bind:value={model.name} maxlength="120" /></label>
  <label class="field">Description (optional) <input bind:value={model.description} maxlength="1000" /></label>
  <Button variant="primary" type="submit" aria-busy={model.creating} disabled={model.creating}>{model.creating ? 'Creating…' : 'Create collection'}</Button>
</form>
{#if model.createError}<p class="error" role="alert">{model.createError}</p>{/if}
