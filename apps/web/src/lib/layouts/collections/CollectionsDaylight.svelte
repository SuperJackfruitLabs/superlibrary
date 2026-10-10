<script lang="ts">
  import type { CollectionsModel } from '$lib/screens/collections.svelte';
  import CollectionCreate from '$lib/sections/CollectionCreate.svelte';
  import CollectionList from '$lib/sections/CollectionList.svelte';
  let { model }: { model: CollectionsModel } = $props();
</script>

<h1>Collections</h1>
<p class="muted">Named sets of items, put together by people. An artifact in a collection is kept however old it is.</p>
<div class="sl-day-card sl-create"><CollectionCreate {model} /></div>
<CollectionList {model} variant="cards" />
