<!-- Daylight: the item in a product-coloured band, the content right under it, then cards. -->
<script lang="ts">
  import AddToCollection from '$lib/AddToCollection.svelte';
  import ItemHeader from '$lib/ItemHeader.svelte';
  import RelatedList from '$lib/RelatedList.svelte';
  import WorkRecordView from '$lib/WorkRecordView.svelte';
  import type { ItemModel } from '$lib/screens/item.svelte';
  import DetailsSection from '$lib/sections/DetailsSection.svelte';
  import FrameError from '$lib/sections/FrameError.svelte';
  import ManageSection from '$lib/sections/ManageSection.svelte';
  import ProvenanceSection from '$lib/sections/ProvenanceSection.svelte';
  import RecordFailed from '$lib/sections/RecordFailed.svelte';
  import VersionsSection from '$lib/sections/VersionsSection.svelte';
  let { model }: { model: ItemModel } = $props();
  const item = $derived(model.item!);
</script>

<ItemHeader {item} version={model.current?.version} latest={model.latestLive} maker={model.maker} actions={model.headerActions} band />

{#if item.kind === 'artifact'}
  <div class="viewer" {@attach model.viewer}></div>
  <FrameError {model} />
  <div class="item-grid">
    <section class="sl-card" aria-labelledby="versions-h"><h2 id="versions-h">Versions</h2><VersionsSection {model} /></section>
    <section class="sl-card" aria-labelledby="details-h"><h2 id="details-h">{model.detailsHeading}</h2><DetailsSection {model} /></section>
  </div>
{:else if model.record}
  <div class="sl-card sl-record"><WorkRecordView view={model.record} timeline="bubbles" hasSpec={model.hasSpec} /></div>
{:else}
  <RecordFailed {model} />
{/if}

<section class="sl-card" aria-labelledby="provenance-h"><h2 id="provenance-h">Provenance</h2><ProvenanceSection {model} /></section>
<div class="item-grid">
  <section class="sl-card" aria-labelledby="related-h"><h2 id="related-h">Related</h2><RelatedList itemId={item.id} /></section>
  <section class="sl-card" aria-labelledby="collect-h"><h2 id="collect-h">Collections</h2><AddToCollection itemId={item.id} /></section>
</div>

{#if model.manage}
  <section class="manage" aria-labelledby="manage-h">
    <h2 id="manage-h" class="visually-hidden">Manage</h2>
    <ManageSection {model} level={2} />
  </section>
{/if}
