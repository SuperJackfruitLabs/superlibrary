<script lang="ts">
  import { countWords, type CollectionsModel } from '$lib/screens/collections.svelte';
  let { model, variant = 'cards' }: { model: CollectionsModel; variant?: 'cards' } = $props();
</script>

{#if model.loading}
  <p class="muted" role="status">Loading…</p>
{:else if model.error}
  <p class="error" role="alert">{model.error}</p>
  <button type="button" onclick={() => model.load()}>Try again</button>
{:else if model.list.length === 0}
  <p>No collections yet. Create the first one above.</p>
{:else if variant === 'cards'}
  <ul class="items sl-collection-cards" aria-label="Collections">
    {#each model.list as c (c.id)}
      <li><a href={`/collections/${c.id}`}><span class="title">{c.name}</span><small>{countWords(c.itemCount)}{c.description ? ` · ${c.description}` : ''}</small></a></li>
    {/each}
  </ul>
{/if}
