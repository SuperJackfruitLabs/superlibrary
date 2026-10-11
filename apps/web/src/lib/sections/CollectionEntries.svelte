<script lang="ts">
  import OutcomeBadge from '$kit/OutcomeBadge.svelte';
  import { outcomeVar } from '$kit/outcome';
  import { when } from '$lib/item';
  import type { CollectionModel } from '$lib/screens/collections.svelte';
  let { model, variant = 'cards' }: { model: CollectionModel; variant?: 'cards' | 'numbered' | 'table' } = $props();
</script>

{#if model.c}
  {#if model.c.entries.length === 0}
    <p>Nothing in it yet. Open an item and choose <strong>Add to collection</strong>.</p>
  {:else if variant === 'cards'}
    <ul class="results results--cards" role="list" aria-label="Items in this collection">
      {#each model.c.entries as e (e.item.id)}
        <li class="result entry" style:--o={outcomeVar(e.item.outcome)}>
          <a class="result-link" href={`/a/${e.item.id}`}>
            <span class="result-title">{e.item.title}</span>
            <span class="result-meta"><OutcomeBadge outcome={e.item.outcome} /><small>added {when(e.addedAt)}</small></span>
            {#if e.note}<span class="snippet">{e.note}</span>{/if}
          </a>
          <button type="button" onclick={() => model.remove(e.item.id, e.item.title)}><span>Remove<span class="visually-hidden"> “{e.item.title}”</span> from collection</span></button>
        </li>
      {/each}
    </ul>
  {:else if variant === 'numbered'}
    <ol class="results sl-numbered" role="list" aria-label="Items in this collection">
      {#each model.c.entries as e (e.item.id)}
        <li class="result entry" style:--o={outcomeVar(e.item.outcome)}>
          <a class="result-link" href={`/a/${e.item.id}`}><span class="result-title">{e.item.title}</span></a>
          <p class="sl-byline"><OutcomeBadge outcome={e.item.outcome} /><em>added {when(e.addedAt)}</em></p>
          {#if e.note}<p class="snippet">{e.note}</p>{/if}
          <button type="button" onclick={() => model.remove(e.item.id, e.item.title)}><span>Remove<span class="visually-hidden"> “{e.item.title}”</span> from collection</span></button>
        </li>
      {/each}
    </ol>
  {:else if variant === 'table'}
    <!-- Explicit roles are deliberate: stacked by CSS, Safari would otherwise drop the table semantics. -->
    <!-- svelte-ignore a11y_no_redundant_roles -->
    <table class="sl-table sl-table--stack sl-table--entries" role="table" aria-label="Items in this collection">
      <!-- svelte-ignore a11y_no_redundant_roles -->
      <thead role="rowgroup"><tr role="row"><th role="columnheader" scope="col">Title</th><th role="columnheader" scope="col">Outcome</th><th role="columnheader" scope="col">Added</th><th role="columnheader" scope="col">Note</th><th role="columnheader" scope="col"><span class="visually-hidden">Action</span></th></tr></thead>
      <!-- svelte-ignore a11y_no_redundant_roles -->
      <tbody role="rowgroup">
        {#each model.c.entries as e (e.item.id)}
          <!-- svelte-ignore a11y_no_redundant_roles -->
          <tr role="row" class="result entry" style:--o={outcomeVar(e.item.outcome)}>
            <td role="cell" data-label="Title"><a class="result-link" href={`/a/${e.item.id}`}>{e.item.title}</a></td>
            <td role="cell" data-label="Outcome"><OutcomeBadge outcome={e.item.outcome} /></td>
            <td role="cell" data-label="Added">added {when(e.addedAt)}</td>
            <td role="cell" data-label="Note">{e.note ?? ''}</td>
            <td role="cell" data-label="Action"><button type="button" onclick={() => model.remove(e.item.id, e.item.title)}><span>Remove<span class="visually-hidden"> “{e.item.title}”</span> from collection</span></button></td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
{/if}
