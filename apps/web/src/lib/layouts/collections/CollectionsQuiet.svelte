<!-- Quiet: the collections as one plain page: blurb, the form, a plain list. -->
<script lang="ts">
  import type { CollectionsModel } from '$lib/screens/collections.svelte';
  import CollectionCreate from '$lib/sections/CollectionCreate.svelte';
  import CollectionList from '$lib/sections/CollectionList.svelte';
  let { model }: { model: CollectionsModel } = $props();
</script>

<div class="sl-quiet">
  <h1>Collections</h1>
  <p>Named sets of items, put together by people. An artifact in a collection is kept however old it is.</p>
  <CollectionCreate {model} />
  <CollectionList {model} variant="plain" />
</div>
