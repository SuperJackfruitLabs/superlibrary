<!-- Studio: a collection as a readout, tiles, a command row and a table. -->
<script lang="ts">
  import { when } from '$lib/item';
  import { countWords, type CollectionModel } from '$lib/screens/collections.svelte';
  import CollectionActions from '$lib/sections/CollectionActions.svelte';
  import CollectionEntries from '$lib/sections/CollectionEntries.svelte';
  import { look } from '$lib/vibe/appearance.svelte';
  import { readout } from '$lib/vibe/copy';
  import Tiles from '$lib/sections/Tiles.svelte';
  let { model }: { model: CollectionModel } = $props();
  const c = $derived(model.c!);
</script>

<div class="sl-readout-bar"><span class="sl-k">Collection</span><code>{c.id}</code>{#if look.appearance.timeStrength !== 'off'}<span class="sl-readout" aria-hidden="true"><span class="sl-led sl-led--sun"></span>{readout(look.now, look.phase)}</span>{/if}</div>
<h1>{c.name}</h1>
{#if c.description}<p class="body">{c.description}</p>{/if}
<p class="muted">{model.meta}</p>
<Tiles cls="sl-tiles--facts" label="Facts" tiles={[{ key: 'Items', value: countWords(c.itemCount) }, { key: 'Created', value: when(c.createdAt) }]} />
<div class="sl-command"><CollectionActions {model} /></div>
<CollectionEntries {model} variant="table" />
