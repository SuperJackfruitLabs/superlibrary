<script lang="ts">
  import { formatBytes } from '@superlibrary/embed';
  import { when } from '$lib/item';
  import type { ItemModel } from '$lib/screens/item.svelte';
  let { model, variant = 'list' }: { model: ItemModel; variant?: 'list' | 'table' } = $props();
  const files = (n: number) => `${n} file${n === 1 ? '' : 's'}`;
</script>

{#if variant === 'list'}
  <ul class="versions">
    {#each model.versions as v (v.version)}
      <li class:current={model.current?.version === v.version}>
        <div class="vline">
          {#if v.revokedAt}
            <span class="vname">v{v.version}</span>
          {:else}
            <a class="vname" href={model.showUrl(v.version)} aria-current={model.current?.version === v.version ? 'true' : undefined} onclick={(e) => model.pick(v.version, e)}>v{v.version}</a>
          {/if}
          <small class="muted">{when(v.createdAt)} · {formatBytes(v.totalBytes)} · {files(v.fileCount)}</small>
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
{:else if variant === 'table'}
  <!-- Explicit roles are deliberate: stacked by CSS, Safari would otherwise drop the table semantics. -->
  <!-- svelte-ignore a11y_no_redundant_roles -->
  <table class="sl-table sl-table--stack" role="table" aria-label="Versions">
    <!-- svelte-ignore a11y_no_redundant_roles -->
    <thead role="rowgroup">
      <!-- svelte-ignore a11y_no_redundant_roles -->
      <tr role="row"><th role="columnheader" scope="col">Version</th><th role="columnheader" scope="col">Uploaded</th><th role="columnheader" scope="col">Size</th><th role="columnheader" scope="col">Files</th><th role="columnheader" scope="col">Flags</th><th role="columnheader" scope="col"><span class="visually-hidden">Action</span></th></tr>
    </thead>
    <!-- svelte-ignore a11y_no_redundant_roles -->
    <tbody role="rowgroup">
      {#each model.versions as v (v.version)}
        <!-- svelte-ignore a11y_no_redundant_roles -->
        <tr role="row" class:current={model.current?.version === v.version}>
          <td role="cell" data-label="Version">{#if v.revokedAt}<span class="vname">v{v.version}</span>{:else}<a class="vname" href={model.showUrl(v.version)} aria-current={model.current?.version === v.version ? 'true' : undefined} onclick={(e) => model.pick(v.version, e)}>v{v.version}</a>{/if}</td>
          <td role="cell" data-label="Uploaded">{when(v.createdAt)}</td>
          <td role="cell" data-label="Size">{formatBytes(v.totalBytes)}</td>
          <td role="cell" data-label="Files">{files(v.fileCount)}</td>
          <td role="cell" data-label="Flags"><span class="badges">
            {#if model.current?.version === v.version}<span class="badge">Shown</span>{/if}
            {#if v.version === model.latestLive}<span class="badge">Latest</span>{/if}
            {#if v.revokedAt}<span class="badge danger-text">Revoked</span>{/if}
            {#if v.scanOverride}<span class="badge">Secret scan overridden</span>{/if}
          </span></td>
          <td role="cell" data-label="Action">{#if model.manage && !v.revokedAt}<button type="button" class="danger-outline" onclick={(e) => model.revokeVersion(e, v.version)}>Revoke<span class="visually-hidden"> version {v.version}</span></button>{/if}</td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}
