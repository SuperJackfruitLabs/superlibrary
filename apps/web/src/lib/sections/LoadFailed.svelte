<script lang="ts">
  /**
   * A read that failed, said as one (catch-up S4): "Couldn't load — try again." with Try again, or
   * "This doesn't exist or isn't shared with you." with a way back. Never "nothing here", never a raw
   * code. `heading` makes the sentence the page's h1 (a whole page that failed).
   */
  import Button from '$kit/Button.svelte';
  import { TRY_AGAIN, failCopy, type FailKind } from '$lib/loading';

  let { kind, message, onretry, heading = false, back }: { kind: FailKind; message?: string; onretry?: () => unknown; heading?: boolean; back?: { href: string; label: string } } = $props();
  let busy = $state(false);
  const words = $derived(message ?? failCopy(kind));
  async function retry(): Promise<void> {
    if (!onretry || busy) return;
    busy = true;
    try { await onretry(); } finally { busy = false; }
  }
</script>

<div class="sl-failed" data-failed={kind}>
  {#if heading}<h1 tabindex="-1">{words}</h1>{:else}<p class="error" role="alert">{words}</p>{/if}
  <div class="actions">
    {#if kind === 'failed' && onretry}<Button variant="primary" disabled={busy} aria-busy={busy} onclick={retry}>{TRY_AGAIN}</Button>{/if}
    {#if back}<Button href={back.href}>{back.label}</Button>{/if}
  </div>
</div>
