<script lang="ts">
  import type { CollectionModel } from '$lib/screens/collections.svelte';
  import CollectionActions from '$lib/sections/CollectionActions.svelte';
  import CollectionEntries from '$lib/sections/CollectionEntries.svelte';
  let { model }: { model: CollectionModel } = $props();
  const c = $derived(model.c!);
</script>

<header class="sl-day-card sl-collection-head">
  <h1>{c.name}</h1>
  {#if c.description}<p class="body">{c.description}</p>{/if}
  <p class="muted">{model.meta}</p>
  <CollectionActions {model} />
</header>
<CollectionEntries {model} variant="cards" />
