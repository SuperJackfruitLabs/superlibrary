<!-- apps/web/src/lib/RelatedList.svelte -->
<script lang="ts">
  import type { RelatedItem } from '@superlibrary/contract';
  import OutcomeBadge from '$kit/OutcomeBadge.svelte';
  import { outcomeVar } from '$kit/outcome';
  import { api } from '$lib/session.svelte';

  let { itemId }: { itemId: string } = $props();
  let items = $state<RelatedItem[]>([]);
  let phase = $state<'loading' | 'ok' | 'failed'>('loading');

  $effect(() => {
    const id = itemId;
    let live = true;
    phase = 'loading';
    api('/api/v1/related', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ itemId: id, limit: 5 }) })
      .then(async (res) => {
        if (!live) return;
        if (!res.ok) { phase = 'failed'; return; }
        items = ((await res.json()) as { items: RelatedItem[] }).items;
        phase = 'ok';
      })
      .catch(() => { if (live) phase = 'failed'; });
    return () => { live = false; };
  });
</script>

{#if phase === 'loading'}
  <p class="muted" role="status">Looking for related work…</p>
{:else if phase === 'failed'}
  <p class="muted">Related items could not be loaded.</p>
{:else if items.length === 0}
  <p class="muted">Nothing related found yet.</p>
{:else}
  <ul class="results" role="list" aria-label="Related items">
    {#each items as r (r.itemId)}
      <li class="result" style:--o={outcomeVar(r.outcome)}>
        <a class="result-link" href={`/a/${r.itemId}`}>
          <span class="result-title">{r.title}</span>
          <span class="result-meta"><OutcomeBadge outcome={r.outcome} /></span>
          {#if r.snippet}<span class="snippet">{r.snippet}</span>{/if}
        </a>
      </li>
    {/each}
  </ul>
{/if}
