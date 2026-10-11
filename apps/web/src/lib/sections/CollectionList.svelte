<script lang="ts">
  import { countWords, type CollectionsModel } from '$lib/screens/collections.svelte';
  let { model, variant = 'cards' }: { model: CollectionsModel; variant?: 'cards' | 'toc' | 'table' | 'plain' } = $props();
</script>

{#if model.loading}
  <p class="muted" role="status">Loading…</p>
{:else if model.error}
  <p class="error" role="alert">{model.error}</p>
  <button type="button" onclick={() => model.load()}>Try again</button>
{:else if model.list.length === 0}
  <p>No collections yet. Create the first one above.</p>
{:else if variant === 'cards'}
  <ul class="items sl-collection-cards" role="list" aria-label="Collections">
    {#each model.list as c (c.id)}
      <li><a href={`/collections/${c.id}`}><span class="title">{c.name}</span><small>{countWords(c.itemCount)}{c.description ? ` · ${c.description}` : ''}</small></a></li>
    {/each}
  </ul>
{:else if variant === 'toc'}
  <ol class="items sl-toc" role="list" aria-label="Collections">
    {#each model.list as c (c.id)}
      <li>
        <a href={`/collections/${c.id}`}><span class="title">{c.name}</span><span class="sl-leader" aria-hidden="true"></span><span class="sl-toc-count">{countWords(c.itemCount)}</span></a>
        {#if c.description}<p class="sl-toc-desc"><em>{c.description}</em></p>{/if}
      </li>
    {/each}
  </ol>
{:else if variant === 'plain'}
  <ul class="items items--plain" role="list" aria-label="Collections">
    {#each model.list as c (c.id)}
      <li><a href={`/collections/${c.id}`}><span class="title">{c.name}</span><small>{countWords(c.itemCount)}{c.description ? ` · ${c.description}` : ''}</small></a></li>
    {/each}
  </ul>
{:else if variant === 'table'}
  <!-- Explicit roles are deliberate: stacked by CSS, Safari would otherwise drop the table semantics. -->
  <!-- svelte-ignore a11y_no_redundant_roles -->
  <table class="sl-table sl-table--stack sl-table--collections" role="table" aria-label="Collections">
    <!-- svelte-ignore a11y_no_redundant_roles -->
    <thead role="rowgroup"><tr role="row"><th role="columnheader" scope="col">Name</th><th role="columnheader" scope="col">Items</th><th role="columnheader" scope="col">Description</th></tr></thead>
    <!-- svelte-ignore a11y_no_redundant_roles -->
    <tbody role="rowgroup">
      {#each model.list as c (c.id)}
        <!-- svelte-ignore a11y_no_redundant_roles -->
        <tr role="row"><td role="cell" data-label="Name"><a class="result-link" href={`/collections/${c.id}`}>{c.name}</a></td><td role="cell" data-label="Items">{countWords(c.itemCount)}</td><td role="cell" data-label="Description">{c.description}</td></tr>
      {/each}
    </tbody>
  </table>
{/if}
