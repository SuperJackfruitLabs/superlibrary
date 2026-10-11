<!-- Paper: the item as a letter. Letterhead and byline, the content as the sheet, then the enclosures. -->
<script lang="ts">
  import { Face } from '@superjackfruit/vibekit';
  import Button from '$kit/Button.svelte';
  import OutcomeBadge from '$kit/OutcomeBadge.svelte';
  import AddToCollection from '$lib/AddToCollection.svelte';
  import RelatedList from '$lib/RelatedList.svelte';
  import type { ItemModel } from '$lib/screens/item.svelte';
  import DetailsSection from '$lib/sections/DetailsSection.svelte';
  import Enclosure from '$lib/sections/Enclosure.svelte';
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
  const n = $derived(model.versions.length);
  const versionsSum = $derived(`${n} version${n === 1 ? '' : 's'}${model.latestLive !== undefined ? ` · v${model.latestLive} latest` : ''}`);
  const detailsSum = $derived(model.details.filter((r) => r.label === 'Kind' || r.label === 'Size').map((r) => r.value.replace(/ \(.*\)$/, '')).join(' · '));
  const artifactsSum = $derived(model.record ? `${model.record.artifacts.length} linked` : '');
</script>

<header class="item-header sl-letterhead">
  <div class="sl-letterhead-top">
    <p class="sl-kicker">Superlibrary · {model.kindLabel}</p>
    {#each model.headerActions as a (a.label)}<Button href={a.href} icon={a.icon}>{a.label}</Button>{/each}
  </div>
  <h1>{item.title}</h1>
  <p class="item-meta sl-byline">
    {#if model.maker}<span class="item-face" aria-hidden="true"><Face id={model.maker.id} label={model.maker.label} size={24} /></span>{/if}
    <span>From {model.createdByWords}</span>
    <OutcomeBadge outcome={item.outcome} />
    {#if model.versionWords}<span>{model.versionWords}</span>{/if}
    <span>{model.visibility}</span>
    {#if model.deleteWords}<span>{model.deleteWords}</span>{/if}
  </p>
</header>

{#if item.kind === 'artifact'}
  <div class="viewer sl-sheet" {@attach model.viewer}></div>
  <FrameError {model} />
{:else if model.record}
  <div class="sl-letter-col">
    <RecordLine view={model.record} />
    {#if model.hasSpec}<section class="sl-letter" aria-labelledby="spec-h"><h2 id="spec-h">Spec</h2><SpecRows view={model.record} /></section>{/if}
  </div>
{:else}
  <RecordFailed {model} />
{/if}

<div class="sl-letter-col">
  <h2 class="sl-enclosed-h">Enclosed</h2>
  {#if item.kind === 'work-record' && model.record}
    <Enclosure id="timeline" title="Timeline" summary={`${model.entryCount} entries`} open><Timeline view={model.record} variant="letters" /></Enclosure>
    <Enclosure id="artifacts" title="Artifacts" summary={artifactsSum} open><LinkedArtifacts view={model.record} /></Enclosure>
  {/if}
  {#if item.kind === 'artifact'}
    <Enclosure id="versions" title="Versions" summary={versionsSum} open><VersionsSection {model} /></Enclosure>
    <Enclosure id="details" title={model.detailsHeading} summary={detailsSum} openFrom={1024}><DetailsSection {model} /></Enclosure>
  {/if}
  <Enclosure id="provenance" title="Provenance" summary={model.createdByWords} openFrom={1024}><ProvenanceSection {model} /></Enclosure>
  <Enclosure id="related" title="Related" openFrom={1024}><RelatedList itemId={item.id} /></Enclosure>
  <Enclosure id="collect" title="Collections" openFrom={1024}><AddToCollection itemId={item.id} /></Enclosure>
  {#if model.manage}
    <section class="manage sl-postscript" aria-labelledby="manage-h"><h2 id="manage-h">Manage</h2><ManageSection {model} level={3} /></section>
  {/if}
</div>
