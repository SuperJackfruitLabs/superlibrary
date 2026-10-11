<!-- Quiet: the item on one plain page. Facts as a list, the content, then every section open with its heading. -->
<script lang="ts">
  import Button from '$kit/Button.svelte';
  import OutcomeBadge from '$kit/OutcomeBadge.svelte';
  import AddToCollection from '$lib/AddToCollection.svelte';
  import RelatedList from '$lib/RelatedList.svelte';
  import type { ItemModel } from '$lib/screens/item.svelte';
  import DetailsSection from '$lib/sections/DetailsSection.svelte';
  import FrameError from '$lib/sections/FrameError.svelte';
  import LinkedArtifacts from '$lib/sections/LinkedArtifacts.svelte';
  import ManageSection from '$lib/sections/ManageSection.svelte';
  import ProvenanceSection from '$lib/sections/ProvenanceSection.svelte';
  import RecordFailed from '$lib/sections/RecordFailed.svelte';
  import RecordLine from '$lib/sections/RecordLine.svelte';
  import SpecRows from '$lib/sections/SpecRows.svelte';
  import Timeline from '$lib/sections/Timeline.svelte';
  import VersionsSection from '$lib/sections/VersionsSection.svelte';
  let { model }: { model: ItemModel } = $props();
  const item = $derived(model.item!);
</script>

<div class="sl-quiet">
  <p><a class="sl-back" href="/">← Library</a></p>
  <h1>{item.title}</h1>
  <dl class="sl-facts item-meta">
    <dt>Outcome</dt><dd><OutcomeBadge outcome={item.outcome} /></dd>
    {#if model.versionWords}<dt>Version</dt><dd>{model.versionWords}</dd>{/if}
    <dt>Visible to</dt><dd>{model.visibility}</dd>
    {#if model.deleteWords}<dt>Delete date</dt><dd>{model.deleteWords}</dd>{/if}
  </dl>

  {#if item.kind === 'artifact'}
    <div class="viewer" {@attach model.viewer}></div>
    <FrameError {model} />
    {#each model.headerActions as a (a.label)}<p><Button href={a.href} icon={a.icon}>{a.label}</Button></p>{/each}
    <section aria-labelledby="versions-h"><h2 id="versions-h">Versions</h2><VersionsSection {model} variant="plain" /></section>
    <section aria-labelledby="details-h"><h2 id="details-h">{model.detailsHeading}</h2><DetailsSection {model} /></section>
  {:else if model.record}
    <RecordLine view={model.record} />
    {#if model.hasSpec}<section aria-labelledby="spec-h"><h2 id="spec-h">Spec</h2><SpecRows view={model.record} /></section>{/if}
    <section aria-labelledby="timeline-h"><h2 id="timeline-h">Timeline</h2><Timeline view={model.record} variant="plain" /></section>
    <section aria-labelledby="artifacts-h"><h2 id="artifacts-h">Artifacts</h2><LinkedArtifacts view={model.record} /></section>
  {:else}
    <RecordFailed {model} />
  {/if}

  <section aria-labelledby="provenance-h"><h2 id="provenance-h">Provenance</h2><ProvenanceSection {model} /></section>
  <section aria-labelledby="related-h"><h2 id="related-h">Related</h2><RelatedList itemId={item.id} /></section>
  <section aria-labelledby="collect-h"><h2 id="collect-h">Collections</h2><AddToCollection itemId={item.id} /></section>
  {#if model.manage}
    <section class="sl-quiet-manage" aria-labelledby="manage-h"><h2 id="manage-h">Manage</h2><ManageSection {model} level={3} /></section>
  {/if}
</div>
