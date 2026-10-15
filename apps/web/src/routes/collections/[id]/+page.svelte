<!-- apps/web/src/routes/collections/[id]/+page.svelte -->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import ConfirmDialog from '$kit/ConfirmDialog.svelte';
  import Toast from '$kit/Toast.svelte';
  import { LAYOUTS } from '$lib/layouts/registry';
  import { CollectionModel } from '$lib/screens/collections.svelte';
  import VibeLayout from '$lib/vibe/VibeLayout.svelte';
  import LoadFailed from '$lib/sections/LoadFailed.svelte';
  import Skeleton from '$lib/sections/Skeleton.svelte';
  const model = new CollectionModel(() => page.params.id ?? '', (href) => goto(href));
</script>

<svelte:head><title>{model.c ? model.c.name : 'Collection'} · Superlibrary</title></svelte:head>
{#if model.notice}<Toast message={model.notice} onclose={() => model.dismissNotice()} />{/if}
{#if model.error && model.failKind}
  <LoadFailed heading kind={model.failKind} message={model.error} onretry={() => model.retry()} back={{ href: '/collections', label: 'All collections' }} />
{:else if !model.c}
  <Skeleton label="Loading the collection" rows={7} />
{:else}
  <VibeLayout layouts={LAYOUTS.collection} {model} />
{/if}
{#if model.deleting && model.ask}
  <ConfirmDialog title={model.ask.title} message={model.ask.message} action={model.ask.action} busy={model.busy} error={model.dialogError} opener={model.deleting}
    onconfirm={() => model.confirmDelete()} oncancel={() => model.cancelDelete()} />
{/if}
