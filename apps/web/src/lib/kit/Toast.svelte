<!-- apps/web/src/lib/kit/Toast.svelte -->
<script lang="ts">
  import Icon from './Icon.svelte';
  let { message, tone = 'ok', onclose, el = $bindable(null) }: { message: string; tone?: 'ok' | 'info' | 'danger'; onclose?: () => void; el?: HTMLElement | null } = $props();
</script>

<div class="kit-toast kit-toast--{tone}" role={tone === 'danger' ? 'alert' : 'status'} tabindex="-1" bind:this={el}>
  <span>{message}</span>
  {#if onclose}<button type="button" class="kit-button kit-button--ghost" aria-label="Dismiss" onclick={onclose}><Icon name="close" /></button>{/if}
</div>
