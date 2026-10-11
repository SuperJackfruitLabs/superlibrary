<script lang="ts">
  import type { LibraryModel } from '$lib/screens/library.svelte';
  let { model, labelVisible = false }: { model: LibraryModel; labelVisible?: boolean } = $props();
</script>

<form class="searchbar" role="search" onsubmit={(e) => { e.preventDefault(); void model.submit(); }}>
  <label class={labelVisible ? 'searchbar-label' : 'visually-hidden'} for="q">Search the library</label>
  <input id="q" type="search" name="q" placeholder="Search the library" bind:value={model.words} />
  <button type="submit">Search</button>
</form>
