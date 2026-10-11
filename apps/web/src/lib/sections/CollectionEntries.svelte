<script lang="ts">
  import OutcomeBadge from '$kit/OutcomeBadge.svelte';
  import { outcomeVar } from '$kit/outcome';
  import { when } from '$lib/item';
  import type { CollectionModel } from '$lib/screens/collections.svelte';
  let { model, variant = 'cards' }: { model: CollectionModel; variant?: 'cards' | 'numbered' } = $props();
</script>

{#if model.c}
  {#if model.c.entries.length === 0}
    <p>Nothing in it yet. Open an item and choose <strong>Add to collection</strong>.</p>
  {:else if variant === 'cards'}
    <ul class="results results--cards" aria-label="Items in this collection">
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
    <ol class="results sl-numbered" aria-label="Items in this collection">
      {#each model.c.entries as e (e.item.id)}
        <li class="result entry" style:--o={outcomeVar(e.item.outcome)}>
          <a class="result-link" href={`/a/${e.item.id}`}><span class="result-title">{e.item.title}</span></a>
          <p class="sl-byline"><OutcomeBadge outcome={e.item.outcome} /><em>added {when(e.addedAt)}</em></p>
          {#if e.note}<blockquote class="snippet">{e.note}</blockquote>{/if}
          <button type="button" onclick={() => model.remove(e.item.id, e.item.title)}><span>Remove<span class="visually-hidden"> “{e.item.title}”</span> from collection</span></button>
        </li>
      {/each}
    </ol>
  {/if}
{/if}
