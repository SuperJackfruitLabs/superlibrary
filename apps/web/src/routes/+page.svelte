<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { onMount, untrack } from 'svelte';
  import type { Facets, ItemSummary, SearchResult } from '@superlibrary/contract';
  import { api } from '$lib/session.svelte';
  import FilterBar from '$lib/FilterBar.svelte';
  import ResultList from '$lib/ResultList.svelte';
  import { boardNames, browseLibrary, loadFacets, rangeProblem, readFilters, rowOfItem, rowOfResult, searchLibrary, writeFilters, type Filters } from '$lib/library';
  import Button from '$kit/Button.svelte';
  import EmptyState from '$kit/EmptyState.svelte';

  let facets = $state<Facets | null>(null);
  let results = $state<SearchResult[]>([]);
  let items = $state<ItemSummary[]>([]);
  let next = $state<string | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let words = $state('');
  const filters = $derived(readFilters(page.url.searchParams));
  const searching = $derived(filters.q.trim() !== '');
  const boards = $derived(boardNames(facets));
  const rows = $derived(searching ? results.map((r) => rowOfResult(r, boards)) : items.map((i) => rowOfItem(i, boards)));

  onMount(async () => { const f = await loadFacets(api); if (f.ok) facets = f.value; });

  function show(f: Filters) {
    const qs = writeFilters(f);
    return goto(qs ? `/?${qs}` : '/', { replaceState: true, keepFocus: true, noScroll: true });
  }

  let loads = 0;
  async function load(f: Filters, cursor: string | null = null) {
    const mine = ++loads;
    loading = true;
    error = null;
    if (rangeProblem(f)) { results = []; items = []; next = null; loading = false; return; }
    if (f.q.trim()) {
      const r = await searchLibrary(api, f);
      if (mine !== loads) return;
      if (r.ok) { results = r.value.results; next = null; } else error = r.message;
    } else {
      const r = await browseLibrary(api, f, cursor);
      if (mine !== loads) return;
      if (r.ok) { items = cursor ? [...items, ...r.value.items] : r.value.items; next = r.value.next; } else error = r.message;
    }
    loading = false;
  }
  $effect(() => { const f = filters; untrack(() => { words = f.q; void load(f); }); });

  const summaryLine = $derived(
    searching ? (rows.length === 25 ? 'The 25 best matches' : `${rows.length} match${rows.length === 1 ? '' : 'es'}`)
      : `${rows.length}${next ? '+' : ''} item${rows.length === 1 ? '' : 's'}, most recent activity first`,
  );
</script>

<svelte:head><title>Library · Superlibrary</title></svelte:head>
<div class="heading">
  <h1>Library</h1>
  <a class="kit-button kit-button--primary" href="/upload">Upload</a>
</div>
<form class="searchbar" role="search" onsubmit={(e) => { e.preventDefault(); void show({ ...filters, q: words }); }}>
  <label class="visually-hidden" for="q">Search the library</label>
  <input id="q" type="search" name="q" placeholder="Search the library" bind:value={words} />
  <button type="submit">Search</button>
</form>
<FilterBar {filters} {facets} onchange={(f) => void show(f)} />
<p class="muted" role="status">{loading ? 'Loading…' : error ? '' : summaryLine}</p>
{#if error}
  <p class="error" role="alert">{error}</p>
  <button type="button" onclick={() => load(filters)}>Try again</button>
{:else if !loading && rows.length === 0}
  {#if searching}
    <EmptyState title="Nothing matches." body="Try other words, or clear the filters." />
  {:else}
    <EmptyState title="Nothing here yet" body="Upload a file or a folder, or link one from an agent's station.">
      {#snippet action()}<Button variant="primary" href="/upload">Upload</Button>{/snippet}
    </EmptyState>
  {/if}
{/if}
{#if rows.length}
  <ResultList {rows} label={searching ? 'Search results' : 'Library'} />
  {#if next}<button type="button" disabled={loading} onclick={() => load(filters, next)}>{loading ? 'Loading…' : 'More'}</button>{/if}
{/if}
