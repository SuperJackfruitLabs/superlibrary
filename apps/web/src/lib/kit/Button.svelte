<!-- apps/web/src/lib/kit/Button.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon, { type IconName } from './Icon.svelte';
  let { variant = 'secondary', href, type = 'button', disabled = false, onclick, icon, children, ...rest }: {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; href?: string; type?: 'button' | 'submit'; disabled?: boolean;
    onclick?: (e: MouseEvent) => void; icon?: IconName; children: Snippet; [k: string]: unknown;
  } = $props();
  // vibekit's class set (danger is its secondary with the sl-danger marker, ghost its quiet) plus the kit's own.
  const VK = { primary: 'vk-button vk-button--primary', secondary: 'vk-button vk-button--secondary', danger: 'vk-button vk-button--secondary sl-danger', ghost: 'vk-button vk-button--quiet' } as const;
  const cls = $derived(`${VK[variant]} kit-button kit-button--${variant}`);
</script>

{#if href}
  <a class={cls} {href} {...rest}>{#if icon}<Icon name={icon} />{/if}{@render children()}</a>
{:else}
  <button class={cls} {type} {disabled} {onclick} {...rest}>{#if icon}<Icon name={icon} />{/if}{@render children()}</button>
{/if}
