<!-- apps/web/src/routes/collections/[id]/+page.svelte -->
<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { COLLECTION_ID, type CollectionDetail } from '@superlibrary/contract';
  import { api } from '$lib/session.svelte';
  import ConfirmDialog from '$kit/ConfirmDialog.svelte';
  import OutcomeBadge from '$kit/OutcomeBadge.svelte';
  import { outcomeVar } from '$kit/outcome';
  import { when } from '$lib/item';
  import { askDeleteCollection, deleteCollection, getCollection, removeFromCollection, updateCollection } from '$lib/collections';
  import Button from '$kit/Button.svelte';
  import Toast from '$kit/Toast.svelte';

  const id = $derived(page.params.id ?? '');
  let c = $state<CollectionDetail | null>(null);
  let error = $state<string | null>(null);
  let notice = $state<string | null>(null);
  let editing = $state(false);
  let renameBtn = $state<HTMLElement | null>(null);
  async function stopEditing() { editing = false; await tick(); renameBtn?.focus(); }
  let name = $state('');
  let description = $state('');
  let editError = $state<string | null>(null);
  let deleting = $state<HTMLElement | null>(null);
  let busy = $state(false);
  let dialogError = $state<string | null>(null);

  async function load() {
    if (!COLLECTION_ID.test(id)) { error = 'Nothing here, or you cannot see it.'; return; }
    const r = await getCollection(api, id);
    if (r.ok) { c = r.value; error = null; } else error = r.message;
  }
  $effect(() => { void id; untrack(() => void load()); });

  function startEdit() { name = c!.name; description = c!.description; editError = null; editing = true; }
  async function save(e: SubmitEvent) {
    e.preventDefault();
    if (!name.trim()) { editError = 'Give the collection a name.'; return; }
    const err = await updateCollection(api, id, { name: name.trim(), description: description.trim() });
    if (err) { editError = err; return; }
    notice = 'Saved.';
    await load();
    await stopEditing();
  }
  async function remove(itemId: string, title: string) {
    const err = await removeFromCollection(api, id, itemId);
    notice = err ?? `Removed “${title}” from the collection.`;
    await load();
  }
  async function confirmDelete() {
    busy = true;
    dialogError = null;
    const err = await deleteCollection(api, id);
    busy = false;
    if (err) { dialogError = err; return; }
    deleting = null;
    await goto('/collections');
  }
</script>

<svelte:head><title>{c ? c.name : 'Collection'} · Superlibrary</title></svelte:head>
{#if notice}<Toast message={notice} onclose={() => (notice = null)} />{/if}
{#if error}
  <p class="error" role="alert">{error}</p>
  <p><Button href="/collections">All collections</Button></p>
{:else if !c}
  <p class="muted" role="status">Loading…</p>
{:else}
  <h1>{c.name}</h1>
  {#if c.description}<p class="body">{c.description}</p>{/if}
  <p class="muted">{c.itemCount} item{c.itemCount === 1 ? '' : 's'} · created {when(c.createdAt)}</p>
  {#if c.canEdit}
    {#if editing}
      <form class="inline-form" novalidate onsubmit={save}>
        <label class="field">Name <input bind:value={name} maxlength="120" /></label>
        <label class="field">Description <input bind:value={description} maxlength="1000" /></label>
        <Button variant="primary" type="submit">Save</Button>
        <button type="button" onclick={stopEditing}>Cancel</button>
      </form>
      {#if editError}<p class="error" role="alert">{editError}</p>{/if}
    {:else}
      <div class="actions collection-actions">
        <button type="button" bind:this={renameBtn} onclick={startEdit}>Rename or describe</button>
        <Button variant="danger" onclick={(e) => { dialogError = null; deleting = e.currentTarget as HTMLElement; }}>Delete collection</Button>
      </div>
    {/if}
  {/if}
  {#if c.entries.length === 0}
    <p>Nothing in it yet. Open an item and choose <strong>Add to collection</strong>.</p>
  {:else}
    <ul class="results" aria-label="Items in this collection">
      {#each c.entries as e (e.item.id)}
        <li class="result entry" style:--o={outcomeVar(e.item.outcome)}>
          <a class="result-link" href={`/a/${e.item.id}`}>
            <span class="result-title">{e.item.title}</span>
            <span class="result-meta"><OutcomeBadge outcome={e.item.outcome} /><small>added {when(e.addedAt)}</small></span>
            {#if e.note}<span class="snippet">{e.note}</span>{/if}
          </a>
          <button type="button" onclick={() => remove(e.item.id, e.item.title)}><span>Remove<span class="visually-hidden"> “{e.item.title}”</span> from collection</span></button>
        </li>
      {/each}
    </ul>
  {/if}
{/if}
{#if deleting && c}
  {@const ask = askDeleteCollection(c.name)}
  <ConfirmDialog title={ask.title} message={ask.message} action={ask.action} {busy} error={dialogError} opener={deleting}
    onconfirm={confirmDelete} oncancel={() => { if (!busy) deleting = null; }} />
{/if}
