<!-- Paper: the collections as a table of contents under a masthead. -->
<script lang="ts">
  import type { CollectionsModel } from '$lib/screens/collections.svelte';
  import CollectionCreate from '$lib/sections/CollectionCreate.svelte';
  import CollectionList from '$lib/sections/CollectionList.svelte';
  import { look } from '$lib/vibe/appearance.svelte';
  import { dateline } from '$lib/vibe/copy';
  let { model }: { model: CollectionsModel } = $props();
</script>

<header class="sl-masthead">
  {#if look.appearance.timeStrength !== 'off'}<p class="sl-dateline">{dateline(look.now, look.phase)}</p>{/if}
  <h1>Collections</h1>
</header>
<p class="sl-standfirst">Named sets of items, put together by people. An artifact in a collection is kept however old it is.</p>
<div class="sl-underline sl-letter-col"><CollectionCreate {model} /></div>
<div class="sl-letter-col"><CollectionList {model} variant="toc" /></div>
