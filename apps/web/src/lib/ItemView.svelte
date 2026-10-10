<script lang="ts">
  import { formatBytes } from '@superlibrary/embed';
  import ConfirmDialog from '$kit/ConfirmDialog.svelte';
  import Toast from '$kit/Toast.svelte';
  import Button from '$kit/Button.svelte';
  import ItemHeader from '$lib/ItemHeader.svelte';
  import WorkRecordView from '$lib/WorkRecordView.svelte';
  import RelatedList from '$lib/RelatedList.svelte';
  import AddToCollection from '$lib/AddToCollection.svelte';
  import ModerationPanel from '$lib/ModerationPanel.svelte';
  import { ITEM_KIND_WORD, when } from '$lib/item';
  import { ItemModel } from '$lib/screens/item.svelte';

  let { itemId, version }: { itemId: string; version?: number } = $props();
  const model = new ItemModel(() => ({ itemId, version }));
</script>

<svelte:head><title>{model.tabTitle} · Superlibrary</title></svelte:head>

{#snippet expiryForm(heading: string)}
  <!-- novalidate: the page says why in words, the same on every browser (iOS does not enforce min). -->
  <form class="stack" novalidate onsubmit={(e) => { e.preventDefault(); void model.saveExpiry(false); }}>
    <h2>{heading}</h2>
    <label class="field">Delete on <input name="expires" type="date" min={model.tomorrow} bind:value={model.expires} disabled={model.saving} /></label>
    {#if model.expiryError}<p class="error" role="alert">{model.expiryError}</p>{/if}
    <div class="actions">
      <button type="submit" disabled={model.saving || !model.expires}>Set the delete date</button>
      {#if model.item?.expiresAt || model.phase === 'expired'}<button type="button" disabled={model.saving} onclick={() => model.saveExpiry(true)}>Keep it (no delete date)</button>{/if}
    </div>
  </form>
{/snippet}

{#if model.notice}<Toast message={model.notice} onclose={() => model.dismissNotice()} bind:el={model.noticeEl} />{/if}

{#if model.removed}
  <h1 tabindex="-1" {@attach model.removedAnchor}>Removed from memory</h1>
  <p role="status">It is gone from the library and from search. The audit log keeps your reason.</p>
  <p><Button href="/">Back to the library</Button></p>
{:else if model.phase === 'loading'}
  <p class="muted" role="status">Loading…</p>
{:else if model.phase === 'expired'}
  <h1>This has expired</h1>
  <p>It is no longer shown to anyone, and it will be deleted soon. The person who uploaded it, or an owner of the workspace, can keep it by choosing a new delete date or none.</p>
  <div class="panel">{@render expiryForm('Keep it')}</div>
  <p><a href="/">Back to the library</a></p>
{:else if model.phase === 'refused'}
  <p class="error" role="alert" tabindex="-1" {@attach model.refusalAnchor}>{model.refusal}</p>
  <div class="actions"><a class="button" href="/">Back to the library</a>{#if model.canRetryRefusal}<button type="button" onclick={() => model.load()}>Try again</button>{/if}</div>
{:else if model.item}
  <ItemHeader item={model.item} version={model.current?.version} latest={model.latestLive}
    actions={model.headerActions} />

  {#if model.item.kind === 'artifact'}
  <div class="viewer" {@attach model.viewer}></div>
  {#if model.frameError}
    <div class="frame-error">
      <p class="error" role="alert">{model.frameError}</p>
      <div class="actions">
        {#if model.shown !== undefined && model.latestLive !== undefined && model.shown !== model.latestLive}<a class="button" href={model.showUrl(undefined)} onclick={(e) => { e.preventDefault(); model.showLatest(); }}>Show the latest version</a>{/if}
        <button type="button" onclick={() => model.retryViewer()}>Try again</button>
      </div>
    </div>
  {/if}

  <div class="item-grid">
    <section aria-labelledby="versions-h">
      <h2 id="versions-h">Versions</h2>
      <ul class="versions">
        {#each model.versions as v (v.version)}
          <li class:current={model.current?.version === v.version}>
            <div class="vline">
              {#if v.revokedAt}
                <span class="vname">v{v.version}</span>
              {:else}
                <a class="vname" href={model.showUrl(v.version)} aria-current={model.current?.version === v.version ? 'true' : undefined} onclick={(e) => model.pick(v.version, e)}>v{v.version}</a>
              {/if}
              <small class="muted">{when(v.createdAt)} · {formatBytes(v.totalBytes)} · {v.fileCount} file{v.fileCount === 1 ? '' : 's'}</small>
              <span class="badges">
                {#if model.current?.version === v.version}<span class="badge">Shown</span>{/if}
                {#if v.version === model.latestLive}<span class="badge">Latest</span>{/if}
                {#if v.revokedAt}<span class="badge danger-text">Revoked</span>{/if}
                {#if v.scanOverride}<span class="badge">Secret scan overridden</span>{/if}
              </span>
            </div>
            {#if model.manage && !v.revokedAt}
              <button type="button" class="danger-outline" onclick={(e) => model.revokeVersion(e, v.version)}>Revoke<span class="visually-hidden"> version {v.version}</span></button>
            {/if}
          </li>
        {/each}
      </ul>
    </section>

    <section class="panel" aria-labelledby="details-h">
      <h2 id="details-h">{model.detailsHeading}</h2>
      {#if model.current}
        <dl class="rows">
          <dt>Item</dt><dd>{ITEM_KIND_WORD[model.item.kind]}</dd>
          {#each model.details as r (r.label)}
            <dt>{r.label}</dt>
            <dd>
              {#if r.copy}
                <code class="hash" id={`row-${r.label}`}>{r.value}</code>
                {#if r.note}<small class="muted"> ({r.note})</small>{/if}
                <button type="button" class="copy" onclick={() => model.copy(r.value, r.label, document.getElementById(`row-${r.label}`))}>Copy<span class="visually-hidden"> {r.label}</span></button>
              {:else if r.mono}<code>{r.value}</code>{:else}{r.value}{/if}
            </dd>
          {/each}
        </dl>
        <p class="muted" role="status">{model.copied ?? ''}</p>
      {:else}
        <p class="muted">No version of this item can be viewed.</p>
      {/if}
    </section>
  </div>
  {:else if model.record}
    <WorkRecordView view={model.record} />
  {:else}
    <p class="error" role="alert">The record could not be loaded.</p>
    <p><button type="button" onclick={() => model.load()}>Try again</button></p>
  {/if}

  <section aria-labelledby="provenance-h">
    <h2 id="provenance-h">Provenance</h2>
    <dl class="rows">
      {#each model.provenance as r (r.label)}
        <dt>{r.label}</dt><dd>{#if r.mono}<code>{r.value}</code>{:else}{r.value}{/if}</dd>
      {/each}
    </dl>
  </section>

  <RelatedList {itemId} />
  <AddToCollection {itemId} />

  {#if model.manage}
    <section class="manage" aria-labelledby="manage-h">
      <h2 id="manage-h" class="visually-hidden">Manage</h2>
      <ModerationPanel item={model.item} onchanged={(n) => model.moderated(n)} onremoved={() => model.removedNow()} />
      <div class="panel">{@render expiryForm(model.expiryHeading)}</div>
      <div class="panel">
        <h2>Revoke</h2>
        <p class="muted">Nobody will be able to view it again. The record of it stays.</p>
        <button type="button" class="danger" onclick={(e) => model.revokeItem(e)}>Revoke this item</button>
      </div>
    </section>
  {/if}
{/if}

{#if model.pending}
  <ConfirmDialog title={model.pending.title} message={model.pending.message} action={model.pending.action} reason={model.pending.reason ?? false} busy={model.busy} error={model.dialogError} opener={model.pending.opener}
    onconfirm={(r) => model.confirmPending(r)} oncancel={() => model.cancelPending()} />
{/if}
