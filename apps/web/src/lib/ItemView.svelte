<script lang="ts">
  import ConfirmDialog from '$kit/ConfirmDialog.svelte';
  import Toast from '$kit/Toast.svelte';
  import ItemStates from '$lib/layouts/item/ItemStates.svelte';
  import { LAYOUTS } from '$lib/layouts/registry';
  import { ItemModel } from '$lib/screens/item.svelte';
  import VibeLayout from '$lib/vibe/VibeLayout.svelte';

  let { itemId, version }: { itemId: string; version?: number } = $props();
  const model = new ItemModel(() => ({ itemId, version }));
</script>

<svelte:head><title>{model.tabTitle} · Superlibrary</title></svelte:head>

{#if model.notice}<Toast message={model.notice} onclose={() => model.dismissNotice()} bind:el={model.noticeEl} />{/if}

{#if model.removed || model.phase !== 'ok' || !model.item}
  <ItemStates {model} />
{:else}
  <VibeLayout layouts={LAYOUTS.item} {model} />
{/if}

{#if model.pending}
  <ConfirmDialog title={model.pending.title} message={model.pending.message} action={model.pending.action} reason={model.pending.reason ?? false} busy={model.busy}
    error={model.dialogError} opener={model.pending.opener} onconfirm={(r) => model.confirmPending(r)} oncancel={() => model.cancelPending()} />
{/if}
