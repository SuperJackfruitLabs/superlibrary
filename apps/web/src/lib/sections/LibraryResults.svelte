<script lang="ts">
  import Button from '$kit/Button.svelte';
  import EmptyState from '$kit/EmptyState.svelte';
  import ResultList from '$lib/ResultList.svelte';
  import LoadFailed from './LoadFailed.svelte';
  import Skeleton from './Skeleton.svelte';
  import type { LibraryModel } from '$lib/screens/library.svelte';
  let { model }: { model: LibraryModel } = $props();
</script>

{#if model.error}
  <LoadFailed kind={model.failKind ?? 'failed'} message={model.error} onretry={() => model.retry()} />
{:else if model.refreshing && model.rows.length === 0}
  <Skeleton label={model.searching ? 'Searching the library' : 'Loading the library'} rows={8} />
{:else if model.empty === 'no-match'}
  <EmptyState title="Nothing matches." body="Try other words, or clear the filters." />
{:else if model.empty === 'nothing-yet'}
  <EmptyState title="Nothing here yet" body="Upload a file or a folder, or link one from an agent's station.">
    {#snippet action()}<Button variant="primary" href="/upload">Upload</Button>{/snippet}
  </EmptyState>
{/if}
{#if model.rows.length}
  <div aria-busy={model.refreshing}><ResultList rows={model.rows} label={model.listLabel} /></div>
  {#if model.next}<button type="button" class="sl-more" disabled={model.loading} onclick={() => model.more()}>{model.loading ? 'Loading…' : 'More'}</button>{/if}
{/if}
