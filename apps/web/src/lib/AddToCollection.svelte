<script lang="ts">
  import { onMount } from 'svelte';
  import type { CollectionSummary } from '@superlibrary/contract';
  import Button from '$kit/Button.svelte';
  import { api } from '$lib/session.svelte';
  import { addToCollection, listCollections } from '$lib/collections';
  import Skeleton from '$lib/sections/Skeleton.svelte';

  /** `onlisted` hears how many collections there are to add to, or null when the list could not be loaded. */
  let { itemId, onlisted }: { itemId: string; onlisted?: (count: number | null) => void } = $props();
  let list = $state<CollectionSummary[]>([]);
  let chosen = $state('');
  let message = $state<string | null>(null);
  let failed = $state(false);
  let busy = $state(false);
  let loadError = $state<string | null>(null);
  let loaded = $state(false);

  async function load() {
    const r = await listCollections(api);
    loaded = true;
    if (r.ok) { list = r.value.collections; chosen = chosen || (list[0]?.id ?? ''); loadError = null; } else loadError = r.message;
    onlisted?.(r.ok ? list.length : null);
  }
  onMount(load);
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

<div class="sl-collect">
  {#if !loaded}
    <!-- Holds the picker's place while the list loads, so the sections below do not jump when it lands. -->
    <Skeleton label="Loading collections" rows={1} rowHeight={76} />
  {:else if loadError}
    <p class="error" role="alert">{loadError}</p>
    <button type="button" onclick={load}>Try again</button>
  {:else if loaded && list.length === 0}
    <p class="muted">No collections yet. <a href="/collections">Create one</a>.</p>
  {:else if list.length}
    <form class="inline-form" onsubmit={add}>
      <label class="field">Collection
        <select bind:value={chosen}>{#each list as c (c.id)}<option value={c.id}>{c.name}</option>{/each}</select>
      </label>
      <Button type="submit" disabled={busy || !chosen}>Add to collection</Button>
    </form>
  {/if}
  {#if message}<p class={failed ? 'error' : 'muted'} role={failed ? 'alert' : 'status'}>{message}</p>{/if}
</div>
