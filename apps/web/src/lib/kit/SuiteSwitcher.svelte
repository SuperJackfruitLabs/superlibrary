<!-- apps/web/src/lib/kit/SuiteSwitcher.svelte -->
<script lang="ts">
  import ParentMark from './ParentMark.svelte';
  import { PARENT } from './suite.generated';
  let { products, current }: { products: ReadonlyArray<{ key: string; name: string; accent: string; url: string }>; current: string } = $props();
  let open = $state(false);
  let button = $state<HTMLButtonElement | null>(null);
  const panelId = `suite-${Math.random().toString(36).slice(2, 10)}`;
</script>

<button bind:this={button} type="button" class="suite-switcher" aria-expanded={open} aria-controls={panelId} onclick={() => (open = !open)}>
  <ParentMark size={20} /><span>Products</span>
</button>
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -- Escape closes the menu from anywhere inside it -->
<div id={panelId} class="shell-menu suite-panel" hidden={!open} role="group" aria-label={PARENT.name}
  onkeydown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); open = false; button?.focus(); } }}>
  <p class="suite-head"><ParentMark size={28} /><span>{PARENT.name}</span></p>
  <ul class="suite-list">
    {#each products.filter((p) => p.url) as p (p.key)}
      <li style:--product-accent={`var(--product-${p.key}-accent)`}>
        <a href={p.url} aria-current={p.key === current ? 'true' : undefined}><span class="suite-dot" aria-hidden="true"></span>{p.name}</a>
      </li>
    {/each}
  </ul>
</div>
