<script lang="ts">
  import type { ItemModel } from '$lib/screens/item.svelte';
  let { model }: { model: ItemModel } = $props();
</script>

{#if model.current}
  <dl class="rows">
    <dt>Item</dt><dd>{model.kindLabel}</dd>
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
