<!-- apps/web/src/lib/kit/SuiteHeader.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Theme } from './theme.svelte';

  let { product, home, mark, nav, account, onsignout, theme = 'system', ontheme, suite }: {
    product: string; home: string; mark: Snippet; nav: Array<{ href: string; label: string; current: boolean }>;
    account: { label: string; detail?: string }; onsignout: () => void; theme?: Theme; ontheme?: (t: Theme) => void; suite?: Snippet;
  } = $props();

  let open = $state(false);
  let button = $state<HTMLButtonElement | null>(null);
  let menu = $state<HTMLElement | null>(null);
  const menuId = `account-${Math.random().toString(36).slice(2, 10)}`;
  const close = (refocus: boolean) => { open = false; if (refocus) button?.focus(); };

  $effect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (menu && button && !menu.contains(e.target as Node) && !button.contains(e.target as Node)) close(false); };
    document.addEventListener('click', onDoc, true);
    return () => document.removeEventListener('click', onDoc, true);
  });
</script>

<!-- The suite shell rule: mark and name left, primary nav, account menu (theme, Sign out) and the suite switcher right. -->
<header class="shell">
  <a class="shell-brand" href={home}>{@render mark()}<span class="shell-product">{product}</span></a>
  <nav class="shell-nav" aria-label={product}>
    {#each nav as n (n.href)}<a href={n.href} aria-current={n.current ? 'page' : undefined}>{n.label}</a>{/each}
  </nav>
  <div class="shell-end">
    {#if suite}<div class="shell-suite" data-slot="suite-switcher">{@render suite()}</div>{/if}
    <button bind:this={button} type="button" class="shell-account" aria-expanded={open} aria-controls={menuId} onclick={() => (open = !open)}>{account.label}</button>
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -- Escape closes the menu from anywhere inside it -->
    <div bind:this={menu} id={menuId} class="shell-menu" hidden={!open} onkeydown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close(true); } }} role="group" aria-label={account.label}>
      {#if account.detail}<p class="shell-detail">{account.detail}</p>{/if}
      <fieldset class="shell-theme">
        <legend>Theme</legend>
        {#each [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']] as [v, l] (v)}
          <label class="check"><input type="radio" name={`${menuId}-theme`} value={v} checked={theme === v} onchange={() => ontheme?.(v as Theme)} /> {l}</label>
        {/each}
      </fieldset>
      <button type="button" class="kit-button shell-signout" onclick={() => { close(false); onsignout(); }}>Sign out</button>
    </div>
  </div>
</header>
