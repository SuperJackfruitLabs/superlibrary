<!-- apps/web/src/lib/AddToCollection.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { CollectionSummary } from '@superlibrary/contract';
  import { api } from '$lib/session.svelte';
  import { addToCollection, listCollections } from '$lib/collections';

  let { itemId }: { itemId: string } = $props();
  let list = $state<CollectionSummary[]>([]);
  let chosen = $state('');
  let message = $state<string | null>(null);
  let failed = $state(false);
  let busy = $state(false);

  onMount(async () => {
    const r = await listCollections(api);
    if (r.ok) { list = r.value.collections; chosen = list[0]?.id ?? ''; }
  });
  async function add(e: SubmitEvent) {
    e.preventDefault();
    if (!chosen) return;
    busy = true;
    const err = await addToCollection(api, chosen, itemId);
    busy = false;
    failed = err !== null;
    message = err ?? `Added to “${list.find((c) => c.id === chosen)?.name ?? 'the collection'}”.`;
  }
</script>

<section class="panel" aria-labelledby="collect-h">
  <h2 id="collect-h">Collections</h2>
  {#if list.length === 0}
    <p class="muted">No collections yet. <a href="/collections">Create one</a>.</p>
  {:else}
    <form class="inline-form" onsubmit={add}>
      <label class="field">Collection
        <select bind:value={chosen}>{#each list as c (c.id)}<option value={c.id}>{c.name}</option>{/each}</select>
      </label>
      <button type="submit" disabled={busy || !chosen}>Add to collection</button>
    </form>
  {/if}
  {#if message}<p class={failed ? 'error' : 'muted'} role={failed ? 'alert' : 'status'}>{message}</p>{/if}
</section>
