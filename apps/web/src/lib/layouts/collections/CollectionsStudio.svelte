<!-- Studio: the collections as a table, with the create form as a command bar. -->
<script lang="ts">
  import type { CollectionsModel } from '$lib/screens/collections.svelte';
  import CollectionCreate from '$lib/sections/CollectionCreate.svelte';
  import CollectionList from '$lib/sections/CollectionList.svelte';
  import { look } from '$lib/vibe/appearance.svelte';
  import { readout } from '$lib/vibe/copy';
  let { model }: { model: CollectionsModel } = $props();
</script>

<div class="heading sl-studio-head">
  <h1>Collections</h1>
  {#if look.appearance.timeStrength !== 'off'}<p class="sl-readout" aria-hidden="true"><span class="sl-led sl-led--sun"></span>{readout(look.now, look.phase)}</p>{/if}
</div>
<p class="muted">Named sets of items, put together by people. An artifact in a collection is kept however old it is.</p>
<div class="sl-panel sl-command-bar"><CollectionCreate {model} /></div>
<CollectionList {model} variant="table" />
