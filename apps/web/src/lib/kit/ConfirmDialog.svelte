<script lang="ts">
  import { untrack } from 'svelte';
  import { holdModal } from './modal';

  let { title, message, action, reason = false, busy = false, error = null, opener = null, onconfirm, oncancel }: {
    title: string;
    message: string;
    /** The button's exact words, e.g. "Revoke version 3". */
    action: string;
    /** Offer an optional "Why?" field; its trimmed text goes to `onconfirm`. */
    reason?: boolean;
    busy?: boolean;
    /** A refusal, shown inside the dialog so the person can cancel or try again. */
    error?: string | null;
    /** Where focus goes back to. Safari does not focus a clicked button, so the page passes it. */
    opener?: HTMLElement | null;
    onconfirm: (reason: string) => void;
    oncancel: () => void;
  } = $props();

  const id = `confirm-${Math.random().toString(36).slice(2, 10)}`;
  let why = $state('');
  let dialog = $state<HTMLElement | null>(null);

  $effect(() => {
    if (!dialog) return;
    return holdModal(dialog, () => { if (!busy) oncancel(); }, untrack(() => opener));
  });
</script>

<div class="modal-backdrop">
  <div class="modal" role="alertdialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-message`} bind:this={dialog}>
    <h2 id={`${id}-title`}>{title}</h2>
    <p id={`${id}-message`}>{message}</p>
    {#if reason}
      <label class="field">Why? (optional) <textarea bind:value={why} maxlength="500" rows="2" disabled={busy}></textarea></label>
    {/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <div class="modal-actions">
      <button type="button" class="kit-button" data-autofocus onclick={oncancel} disabled={busy}>Cancel</button>
      <button type="button" class="kit-button kit-button--danger" onclick={() => onconfirm(why.trim())} disabled={busy}>{busy ? 'Working…' : action}</button>
    </div>
  </div>
</div>
