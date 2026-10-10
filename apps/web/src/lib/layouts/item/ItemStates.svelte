<script lang="ts">
  import Button from '$kit/Button.svelte';
  import type { ItemModel } from '$lib/screens/item.svelte';
  import ExpiryForm from '$lib/sections/ExpiryForm.svelte';
  let { model }: { model: ItemModel } = $props();
</script>

{#if model.removed}
  <h1 tabindex="-1" {@attach model.removedAnchor}>Removed from memory</h1>
  <p role="status">It is gone from the library and from search. The audit log keeps your reason.</p>
  <p><Button href="/">Back to the library</Button></p>
{:else if model.phase === 'loading'}
  <p class="muted" role="status">Loading…</p>
{:else if model.phase === 'expired'}
  <h1>This has expired</h1>
  <p>It is no longer shown to anyone, and it will be deleted soon. The person who uploaded it, or an owner of the workspace, can keep it by choosing a new delete date or none.</p>
  <div class="panel sl-needs"><ExpiryForm {model} heading="Keep it" /></div>
  <p><a href="/">Back to the library</a></p>
{:else if model.phase === 'refused'}
  <p class="error" role="alert" tabindex="-1" {@attach model.refusalAnchor}>{model.refusal}</p>
  <div class="actions"><a class="button" href="/">Back to the library</a>{#if model.canRetryRefusal}<button type="button" onclick={() => model.load()}>Try again</button>{/if}</div>
{/if}
