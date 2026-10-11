<!-- Studio: the library as an instrument. Readout, tiles, one dense control row, the table. -->
<script lang="ts">
  import Button from '$kit/Button.svelte';
  import { OUTCOME_ORDER, OUTCOME_WORDS, outcomeVar } from '$kit/outcome';
  import FilterBar from '$lib/FilterBar.svelte';
  import type { LibraryModel } from '$lib/screens/library.svelte';
  import LibraryResults from '$lib/sections/LibraryResults.svelte';
  import LibraryStatus from '$lib/sections/LibraryStatus.svelte';
  import SearchForm from '$lib/sections/SearchForm.svelte';
  import Tiles from '$lib/sections/Tiles.svelte';
  import { look } from '$lib/vibe/appearance.svelte';
  import { readout } from '$lib/vibe/copy';
  let { model }: { model: LibraryModel } = $props();
  const tiles = $derived([
    { key: 'Shown', value: `${model.rows.length}${model.next ? '+' : ''}` },
    { key: 'Filters on', value: String(model.activeCount) },
    ...(model.searching || !model.counts ? [] : OUTCOME_ORDER.map((o) => ({ key: OUTCOME_WORDS[o], value: String(model.counts![o] ?? 0), tone: outcomeVar(o) }))),
  ]);
</script>

<div class="heading sl-studio-head">
  <h1>Library</h1>
  {#if look.appearance.timeStrength !== 'off'}<p class="sl-readout" aria-hidden="true"><span class="sl-led sl-led--sun"></span>{readout(look.now, look.phase)}</p>{/if}
  <Button variant="primary" href="/upload">Upload</Button>
</div>
{#if !model.error && !model.refreshing}<Tiles label="Summary" {tiles} />{/if}
<div class="sl-studio-bar">
  <SearchForm {model} />
  <FilterBar filters={model.filters} facets={model.facets} onchange={(f) => void model.setFilters(f)} openFrom={1024} />
</div>
<LibraryStatus {model} />
<LibraryResults {model} />
