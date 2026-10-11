<!-- Quiet: the library as a printed page. Everything open, labels visible, no decoration. -->
<script lang="ts">
  import Button from '$kit/Button.svelte';
  import FilterBar from '$lib/FilterBar.svelte';
  import type { LibraryModel } from '$lib/screens/library.svelte';
  import LibraryResults from '$lib/sections/LibraryResults.svelte';
  import LibraryStatus from '$lib/sections/LibraryStatus.svelte';
  import SearchForm from '$lib/sections/SearchForm.svelte';
  import { look } from '$lib/vibe/appearance.svelte';
  import { timeLine } from '$lib/vibe/copy';
  let { model }: { model: LibraryModel } = $props();
</script>

<div class="sl-quiet">
  <h1>Library</h1>
  {#if look.appearance.timeStrength !== 'off'}<p class="muted">{timeLine(look.phase)}</p>{/if}
  <p><Button href="/upload">Upload</Button></p>
  <SearchForm {model} labelVisible />
  <FilterBar filters={model.filters} facets={model.facets} onchange={(f) => void model.setFilters(f)} openFrom={0} />
  <LibraryStatus {model} />
  <LibraryResults {model} />
</div>
