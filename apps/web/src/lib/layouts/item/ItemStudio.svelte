<!-- Studio: the item as an instrument. Readout bar, title and chips, the content, tiles, then dense panels. -->
<script lang="ts">
  import OutcomeBadge from '$kit/OutcomeBadge.svelte';
  import Toolbar from '$kit/Toolbar.svelte';
  import { formatBytes } from '@superlibrary/embed';
  import AddToCollection from '$lib/AddToCollection.svelte';
  import RelatedList from '$lib/RelatedList.svelte';
  import { when } from '$lib/item';
  import type { ItemModel } from '$lib/screens/item.svelte';
  import DetailsSection from '$lib/sections/DetailsSection.svelte';
  import FrameError from '$lib/sections/FrameError.svelte';
  import LinkedArtifacts from '$lib/sections/LinkedArtifacts.svelte';
  import ManageSection from '$lib/sections/ManageSection.svelte';
  import ProvenanceSection from '$lib/sections/ProvenanceSection.svelte';
  import RecordFailed from '$lib/sections/RecordFailed.svelte';
  import RecordLine from '$lib/sections/RecordLine.svelte';
  import SpecRows from '$lib/sections/SpecRows.svelte';
  import Tiles from '$lib/sections/Tiles.svelte';
  import Timeline from '$lib/sections/Timeline.svelte';
  import VersionsSection from '$lib/sections/VersionsSection.svelte';
  import { look } from '$lib/vibe/appearance.svelte';
  import { readout } from '$lib/vibe/copy';
  let { model }: { model: ItemModel } = $props();
  const item = $derived(model.item!);
  const row = (label: string) => model.details.find((r) => r.label === label)?.value ?? '';
  const tiles = $derived(item.kind === 'artifact'
    ? [
        { key: 'Version', value: model.current ? `v${model.current.version} of ${model.versions.length}${model.current.version === model.latestLive ? ', latest' : ''}` : '—' },
        { key: 'Size', value: model.current ? formatBytes(model.current.totalBytes) : '—' },
        { key: 'Files', value: model.current ? String(model.current.fileCount) : '—' },
        { key: 'Kind', value: row('Kind') || '—' },
        { key: 'Uploaded', value: model.current ? when(model.current.createdAt) : '—' },
      ]
    : [
        { key: 'Stage', value: model.record?.record.stage ?? '—' },
        { key: 'Timeline entries', value: String(model.entryCount) },
        { key: 'Artifacts linked', value: String(model.record?.artifacts.length ?? 0) },
      ]);
</script>

<!-- The readout sits inside the header, so the header's facts stay together with the title. -->
<header class="item-header sl-studio-item">
  <div class="sl-readout-bar">
    <span class="sl-k">{model.kindLabel}</span><code>{item.id}</code>
    <OutcomeBadge outcome={item.outcome} />
    {#if look.appearance.timeStrength !== 'off'}<span class="sl-readout" aria-hidden="true"><span class="sl-led sl-led--sun"></span>{readout(look.now, look.phase)}</span>{/if}
  </div>
  <h1>{item.title}</h1>
  <p class="item-meta">{#if model.versionWords}<span class="sl-chip">{model.versionWords}</span>{/if}<span class="sl-chip">{model.visibility}</span>{#if model.deleteWords}<span class="sl-chip">{model.deleteWords}</span>{/if}</p>
  {#if model.headerActions.length}<Toolbar label="Item" items={model.headerActions} />{/if}
</header>

{#if item.kind === 'artifact'}
  <div class="viewer" {@attach model.viewer}></div>
  <FrameError {model} />
{/if}
<Tiles label="Facts" {tiles} />

<div class="sl-panels">
  {#if item.kind === 'artifact'}
    <section class="sl-panel sl-panel--wide" aria-labelledby="versions-h"><h2 id="versions-h">Versions</h2><VersionsSection {model} variant="table" /></section>
    <section class="sl-panel" aria-labelledby="details-h"><h2 id="details-h">{model.detailsHeading}</h2><DetailsSection {model} /></section>
  {:else if model.record}
    <section class="sl-panel sl-panel--wide" aria-labelledby="timeline-h"><h2 id="timeline-h">Timeline</h2><Timeline view={model.record} variant="log" /></section>
    <section class="sl-panel" aria-labelledby="record-h"><h2 id="record-h" class="visually-hidden">Record</h2><RecordLine view={model.record} />{#if model.hasSpec}<h2>Spec</h2><SpecRows view={model.record} />{/if}</section>
    <section class="sl-panel" aria-labelledby="artifacts-h"><h2 id="artifacts-h">Artifacts</h2><LinkedArtifacts view={model.record} /></section>
  {:else}
    <RecordFailed {model} />
  {/if}
  <section class="sl-panel" aria-labelledby="provenance-h"><h2 id="provenance-h">Provenance</h2><ProvenanceSection {model} /></section>
  <section class="sl-panel" aria-labelledby="related-h"><h2 id="related-h">Related</h2><RelatedList itemId={item.id} /></section>
  <section class="sl-panel" aria-labelledby="collect-h"><h2 id="collect-h">Collections</h2><AddToCollection itemId={item.id} /></section>
</div>
{#if model.manage}
  <section class="manage sl-panels sl-command" aria-labelledby="manage-h"><h2 id="manage-h" class="visually-hidden">Manage</h2><ManageSection {model} level={2} /></section>
{/if}
