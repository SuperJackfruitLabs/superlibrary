<!-- apps/web/src/lib/kit/Toast.svelte -->
<script lang="ts">
  import Icon from './Icon.svelte';
  let { message, tone = 'ok', onclose }: { message: string; tone?: 'ok' | 'info' | 'danger'; onclose?: () => void } = $props();
</script>

<div class="kit-toast kit-toast--{tone}" role={tone === 'danger' ? 'alert' : 'status'} tabindex="-1">
  <span>{message}</span>
  {#if onclose}<button type="button" class="kit-button kit-button--ghost" aria-label="Dismiss" onclick={onclose}><Icon name="close" /></button>{/if}
</div>
