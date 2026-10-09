<!-- apps/web/src/lib/kit/Field.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  let { label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: Snippet<[{ id: string; describedby: string | undefined }]> } = $props();
  const id = `f-${Math.random().toString(36).slice(2, 10)}`;
  const describedby = $derived([hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined);
</script>

<div class="kit-field">
  <label for={id}>{label}</label>
  {@render children({ id, describedby })}
  {#if hint}<p class="kit-hint" id={`${id}-hint`}>{hint}</p>{/if}
  {#if error}<p class="kit-error" id={`${id}-error`} role="alert">{error}</p>{/if}
</div>
