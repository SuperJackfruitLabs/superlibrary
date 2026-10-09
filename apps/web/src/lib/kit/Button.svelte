<!-- apps/web/src/lib/kit/Button.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon, { type IconName } from './Icon.svelte';
  let { variant = 'secondary', href, type = 'button', disabled = false, onclick, icon, children, ...rest }: {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; href?: string; type?: 'button' | 'submit'; disabled?: boolean;
    onclick?: (e: MouseEvent) => void; icon?: IconName; children: Snippet; [k: string]: unknown;
  } = $props();
  const cls = $derived(`kit-button kit-button--${variant}`);
</script>

{#if href}
  <a class={cls} {href} {...rest}>{#if icon}<Icon name={icon} />{/if}{@render children()}</a>
{:else}
  <button class={cls} {type} {disabled} {onclick} {...rest}>{#if icon}<Icon name={icon} />{/if}{@render children()}</button>
{/if}
