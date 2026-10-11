<!-- Paper: a front page. Masthead and dateline, the search, then the index of entries; the filters sit beside it on wide screens. -->
<script lang="ts">
  import Button from '$kit/Button.svelte';
  import FilterBar from '$lib/FilterBar.svelte';
  import type { LibraryModel } from '$lib/screens/library.svelte';
  import LibraryResults from '$lib/sections/LibraryResults.svelte';
  import LibraryStatus from '$lib/sections/LibraryStatus.svelte';
  import SearchForm from '$lib/sections/SearchForm.svelte';
  import { look } from '$lib/vibe/appearance.svelte';
  import { dateline } from '$lib/vibe/copy';
  let { model }: { model: LibraryModel } = $props();
</script>

<header class="sl-masthead">
  {#if look.appearance.timeStrength !== 'off'}<p class="sl-dateline">{dateline(look.now, look.phase)}</p>{/if}
  <div class="heading"><h1>Library</h1><Button href="/upload">Upload</Button></div>
</header>
<div class="sl-underline"><SearchForm {model} /></div>
<div class="sl-paper-columns">
  <div class="sl-paper-side">
    <FilterBar filters={model.filters} facets={model.facets} onchange={(f) => void model.setFilters(f)} openFrom={1024} />
    <LibraryStatus {model} />
  </div>
  <div class="sl-paper-main"><LibraryResults {model} /></div>
</div>
