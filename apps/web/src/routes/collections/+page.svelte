<!-- apps/web/src/routes/collections/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import type { CollectionSummary } from '@superlibrary/contract';
  import Button from '$kit/Button.svelte';
  import { api } from '$lib/session.svelte';
  import { createCollection, listCollections } from '$lib/collections';

  let list = $state<CollectionSummary[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let name = $state('');
  let description = $state('');
  let creating = $state(false);
  let createError = $state<string | null>(null);

  async function load() {
    loading = true;
    const r = await listCollections(api);
    loading = false;
    if (r.ok) { list = r.value.collections; error = null; } else error = r.message;
  }
  onMount(load);

  async function create(e: SubmitEvent) {
    e.preventDefault();
    if (!name.trim()) { createError = 'Give the collection a name.'; return; }
    creating = true;
    createError = null;
    const r = await createCollection(api, name.trim(), description.trim());
    creating = false;
    if (!r.ok) { createError = r.message; return; }
    await goto(`/collections/${r.value.id}`);
  }
</script>

<svelte:head><title>Collections · Superlibrary</title></svelte:head>
<h1>Collections</h1>
<p class="muted">Named sets of items, put together by people. An artifact in a collection is kept however old it is.</p>
<form class="inline-form" novalidate onsubmit={create}>
  <label class="field">Name <input bind:value={name} maxlength="120" /></label>
  <label class="field">Description (optional) <input bind:value={description} maxlength="1000" /></label>
  <Button variant="primary" type="submit" disabled={creating}>{creating ? 'Creating…' : 'Create collection'}</Button>
</form>
{#if createError}<p class="error" role="alert">{createError}</p>{/if}
{#if loading}
  <p class="muted" role="status">Loading…</p>
{:else if error}
  <p class="error" role="alert">{error}</p>
  <button type="button" onclick={load}>Try again</button>
{:else if list.length === 0}
  <p>No collections yet. Create the first one above.</p>
{:else}
  <ul class="items" aria-label="Collections">
    {#each list as c (c.id)}
      <li><a href={`/collections/${c.id}`}><span class="title">{c.name}</span><small>{c.itemCount} item{c.itemCount === 1 ? '' : 's'}{c.description ? ` · ${c.description}` : ''}</small></a></li>
    {/each}
  </ul>
{/if}
