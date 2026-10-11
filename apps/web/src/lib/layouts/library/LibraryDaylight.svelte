<!-- Daylight: the library as a sunlit room. The sky band holds the greeting, the heading, Upload and the search. -->
<script lang="ts">
  import { Sky, greeting } from '@superjackfruit/vibekit';
  import Button from '$kit/Button.svelte';
  import FilterBar from '$lib/FilterBar.svelte';
  import type { LibraryModel } from '$lib/screens/library.svelte';
  import LibraryResults from '$lib/sections/LibraryResults.svelte';
  import LibraryStatus from '$lib/sections/LibraryStatus.svelte';
  import SearchForm from '$lib/sections/SearchForm.svelte';
  import { look } from '$lib/vibe/appearance.svelte';
  let { model }: { model: LibraryModel } = $props();
</script>

<div class="sl-day-hero">
  <Sky phase={look.phase}>
    {#if look.appearance.timeStrength !== 'off'}<p class="sl-greeting">{greeting(look.phase, 'daylight')}</p>{/if}
    <div class="heading"><h1>Library</h1><Button variant="primary" href="/upload">Upload</Button></div>
    <SearchForm {model} />
  </Sky>
</div>
<div class="sl-day-card sl-day-filters"><FilterBar filters={model.filters} facets={model.facets} onchange={(f) => void model.setFilters(f)} /></div>
<LibraryStatus {model} />
<LibraryResults {model} />
