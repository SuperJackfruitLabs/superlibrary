<!-- apps/web/src/lib/kit/SuiteSwitcher.svelte -->
<script lang="ts">
  import ParentMark from './ParentMark.svelte';
  import { menus, watchMenu } from './menus.svelte';
  import { PARENT } from './suite.generated';
  let { products, current }: { products: ReadonlyArray<{ key: string; name: string; accent: string; url: string }>; current: string } = $props();
  let button = $state<HTMLButtonElement | null>(null);
  let panel = $state<HTMLElement | null>(null);
  const panelId = `suite-${Math.random().toString(36).slice(2, 10)}`;
  const open = $derived(menus.open === panelId);
  $effect(() => watchMenu(open ? panelId : '', () => button, () => panel));
</script>

<button bind:this={button} type="button" class="suite-switcher" aria-expanded={open} aria-controls={panelId} onclick={() => (menus.open = open ? null : panelId)}>
  <ParentMark size={20} /><span>Products</span>
</button>
<div bind:this={panel} id={panelId} class="suite-shell-menu suite-panel" hidden={!open} role="group" aria-label={PARENT.name}>
  <p class="suite-head"><ParentMark size={28} /><span>{PARENT.name}</span></p>
  <ul class="suite-list">
    {#each products.filter((p) => p.url) as p (p.key)}
      <li style:--product-accent={`var(--product-${p.key}-accent)`}>
        <a href={p.url} aria-current={p.key === current ? 'true' : undefined}><span class="suite-dot" aria-hidden="true"></span>{p.name}</a>
      </li>
    {/each}
  </ul>
</div>
