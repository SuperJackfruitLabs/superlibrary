<script lang="ts">
  import { formatBytes } from '@superlibrary/embed';
  import { when } from '$lib/item';
  import type { ItemModel } from '$lib/screens/item.svelte';
  let { model, variant = 'list' }: { model: ItemModel; variant?: 'list' } = $props();
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
{/if}
