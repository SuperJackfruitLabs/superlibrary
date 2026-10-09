<!-- apps/web/src/lib/kit/Toolbar.svelte -->
<script lang="ts" module>
  import type { IconName } from './Icon.svelte';
  export type ToolbarItem = { label: string; icon?: IconName; href?: string; onclick?: () => void; primary?: boolean; external?: boolean };
</script>
<script lang="ts">
  import Icon from './Icon.svelte';
  let { label, items }: { label: string; items: ToolbarItem[] } = $props();
  let open = $state(false);
  const panelId = `more-${Math.random().toString(36).slice(2, 10)}`;
  const secondary = $derived(items.filter((i) => !i.primary));
  const run = (i: ToolbarItem) => { open = false; i.onclick?.(); };
</script>

<!-- Every action keeps its words (operator review): at phone width the secondary ones fold into More. -->
<div class="kit-toolbar-wrap">
<div class="kit-toolbar" role="toolbar" aria-label={label}>
  {#each items as i (i.label)}
    {#if i.href}
      <a class="kit-toolbar-item" class:kit-secondary={!i.primary} href={i.href} {...(i.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{#if i.icon}<Icon name={i.icon} />{/if}<span>{i.label}</span></a>
    {:else}
      <button type="button" class="kit-toolbar-item" class:kit-secondary={!i.primary} onclick={() => run(i)}>{#if i.icon}<Icon name={i.icon} />{/if}<span>{i.label}</span></button>
    {/if}
  {/each}
  {#if secondary.length}
    <button type="button" class="kit-more" aria-expanded={open} aria-controls={panelId} onclick={() => (open = !open)}><Icon name="more" /><span>More</span></button>
  {/if}
</div>
<div class="kit-more-panel" id={panelId} hidden={!open}>
  {#each secondary as i (i.label)}
    {#if i.href}
      <a class="kit-button kit-button--ghost" href={i.href} {...(i.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{i.label}</a>
    {:else}
      <button type="button" class="kit-button kit-button--ghost" onclick={() => run(i)}>{i.label}</button>
    {/if}
  {/each}
</div>
</div>
