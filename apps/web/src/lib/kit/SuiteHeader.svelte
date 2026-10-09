<!-- apps/web/src/lib/kit/SuiteHeader.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Theme } from './theme.svelte';
  import { menus, watchMenu } from './menus.svelte';

  let { product, home, mark, nav, account, onsignout, theme = 'system', ontheme, suite }: {
    product: string; home: string; mark: Snippet; nav: Array<{ href: string; label: string; current: boolean }>;
    account: { label: string; detail?: string }; onsignout: () => void; theme?: Theme; ontheme?: (t: Theme) => void; suite?: Snippet;
  } = $props();

  let button = $state<HTMLButtonElement | null>(null);
  let menu = $state<HTMLElement | null>(null);
  const menuId = `account-${Math.random().toString(36).slice(2, 10)}`;
  const open = $derived(menus.open === menuId);
  $effect(() => watchMenu(open ? menuId : '', () => button, () => menu));
</script>

<!-- The suite shell rule: mark and name left, primary nav, account menu (theme, Sign out) and the suite switcher right. -->
<header class="suite-shell">
  <a class="suite-shell-brand" href={home}>{@render mark()}<span class="suite-shell-product">{product}</span></a>
  <nav class="suite-shell-nav" aria-label={product}>
    {#each nav as n (n.href)}<a href={n.href} aria-current={n.current ? 'page' : undefined}>{n.label}</a>{/each}
  </nav>
  <div class="suite-shell-end">
    {#if suite}<div class="suite-shell-suite" data-slot="suite-switcher">{@render suite()}</div>{/if}
    <button bind:this={button} type="button" class="suite-shell-account" aria-expanded={open} aria-controls={menuId} onclick={() => (menus.open = open ? null : menuId)}>{account.label}</button>
    <div bind:this={menu} id={menuId} class="suite-shell-menu" hidden={!open} role="group" aria-label={account.label}>
      {#if account.detail}<p class="suite-shell-detail">{account.detail}</p>{/if}
      <fieldset class="suite-shell-theme">
        <legend>Theme</legend>
        {#each [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']] as [v, l] (v)}
          <label class="check"><input type="radio" name={`${menuId}-theme`} value={v} checked={theme === v} onchange={() => ontheme?.(v as Theme)} /> {l}</label>
        {/each}
      </fieldset>
      <button type="button" class="kit-button suite-shell-signout" onclick={() => { menus.open = null; onsignout(); }}>Sign out</button>
    </div>
  </div>
</header>
