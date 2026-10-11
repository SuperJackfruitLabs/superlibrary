<!-- apps/web/src/routes/collections/[id]/+page.svelte -->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import Button from '$kit/Button.svelte';
  import ConfirmDialog from '$kit/ConfirmDialog.svelte';
  import Toast from '$kit/Toast.svelte';
  import { LAYOUTS } from '$lib/layouts/registry';
  import { CollectionModel } from '$lib/screens/collections.svelte';
  import VibeLayout from '$lib/vibe/VibeLayout.svelte';
  const model = new CollectionModel(() => page.params.id ?? '', (href) => goto(href));
</script>

<svelte:head><title>{model.c ? model.c.name : 'Collection'} · Superlibrary</title></svelte:head>
{#if model.notice}<Toast message={model.notice} onclose={() => model.dismissNotice()} />{/if}
{#if model.error}
  <p class="error" role="alert">{model.error}</p>
  <p><Button href="/collections">All collections</Button></p>
{:else if !model.c}
  <p class="muted" role="status">Loading…</p>
{:else}
  <VibeLayout layouts={LAYOUTS.collection} {model} />
{/if}
{#if model.deleting && model.ask}
  <ConfirmDialog title={model.ask.title} message={model.ask.message} action={model.ask.action} busy={model.busy} error={model.dialogError} opener={model.deleting}
    onconfirm={() => model.confirmDelete()} oncancel={() => model.cancelDelete()} />
{/if}
