<script lang="ts">
  import { onMount } from 'svelte';
  import type { ItemSummary } from '@superlibrary/contract';
  import { api } from '$lib/session.svelte';
  import { listLine } from '$lib/item';

  let items = $state<ItemSummary[]>([]);
  let next = $state<string | null>(null);
  let error = $state<string | null>(null);
  let loading = $state(true);


  async function load(before: string | null = null) {
    loading = true;
    error = null;
    try {
      const res = await api(`/api/v1/items?limit=50${before ? `&before=${encodeURIComponent(before)}` : ''}`);
      if (!res.ok) { error = `The library could not be loaded (HTTP ${res.status}).`; return; }
      const body = (await res.json()) as { items: ItemSummary[]; next: string | null };
      items = before ? [...items, ...body.items] : body.items;
      next = body.next;
    } catch {
      error = 'The library could not be loaded. Check your connection and try again.';
    } finally {
      loading = false;
    }
  }
  onMount(() => load());
</script>

<svelte:head><title>Library · Superlibrary</title></svelte:head>
<div class="heading">
  <h1>Library</h1>
  <a class="button primary" href="/upload">Upload</a>
</div>
{#if error}
  <p class="error" role="alert">{error}</p>
  <button type="button" onclick={() => load(items.length ? next : null)}>Try again</button>
{/if}
{#if loading && items.length === 0}
  <p class="muted" role="status">Loading…</p>
{:else if items.length === 0 && !error}
  <p>Nothing here yet. <a href="/upload">Upload a file or a folder</a>.</p>
{:else if items.length > 0}
  <ul class="items">
    {#each items as item (item.id)}
      <li>
        <a href={`/a/${item.id}`}>
          <span class="title">{item.title}</span>
          <small>{listLine(item)}</small>
        </a>
      </li>
    {/each}
  </ul>
  {#if next}<button type="button" disabled={loading} onclick={() => load(next)}>{loading ? 'Loading…' : 'More'}</button>{/if}
{/if}
