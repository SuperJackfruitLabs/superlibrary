<!-- Quiet: a collection as one plain page: name, description, meta, actions, a plain list. -->
<script lang="ts">
  import type { CollectionModel } from '$lib/screens/collections.svelte';
  import CollectionActions from '$lib/sections/CollectionActions.svelte';
  import CollectionEntries from '$lib/sections/CollectionEntries.svelte';
  let { model }: { model: CollectionModel } = $props();
  const c = $derived(model.c!);
</script>

<div class="sl-quiet">
  <p><a class="sl-back" href="/collections">← Collections</a></p>
  <h1>{c.name}</h1>
  {#if c.description}<p class="body">{c.description}</p>{/if}
  <p class="muted">{model.meta}</p>
  <CollectionActions {model} />
  <CollectionEntries {model} variant="plain" />
</div>
