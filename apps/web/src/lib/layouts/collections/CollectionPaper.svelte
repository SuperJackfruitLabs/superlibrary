<!-- Paper: a collection as a letter, its items numbered like enclosures. -->
<script lang="ts">
  import type { CollectionModel } from '$lib/screens/collections.svelte';
  import CollectionActions from '$lib/sections/CollectionActions.svelte';
  import CollectionEntries from '$lib/sections/CollectionEntries.svelte';
  let { model }: { model: CollectionModel } = $props();
  const c = $derived(model.c!);
</script>

<div class="sl-letter-col">
  <header class="sl-letterhead">
    <p class="sl-kicker">Superlibrary · Collection</p>
    <h1>{c.name}</h1>
    <p class="sl-dateline">{model.meta}</p>
  </header>
  {#if c.description}<p class="body sl-letter-body">{c.description}</p>{/if}
  <CollectionActions {model} />
  <CollectionEntries {model} variant="numbered" />
</div>
