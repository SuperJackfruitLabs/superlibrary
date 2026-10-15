<script lang="ts">
  import Button from '$kit/Button.svelte';
  import type { ItemModel } from '$lib/screens/item.svelte';
  import ExpiryForm from '$lib/sections/ExpiryForm.svelte';
  import Skeleton from '$lib/sections/Skeleton.svelte';
  let { model }: { model: ItemModel } = $props();
</script>

{#if model.removed}
  <h1 tabindex="-1" {@attach model.removedAnchor}>Removed from memory</h1>
  <p role="status">It is gone from the library and from search. The audit log keeps your reason.</p>
  <p><Button href="/">Back to the library</Button></p>
{:else if model.phase === 'loading'}
  <Skeleton shape="item" label="Loading the item" rows={4} rowHeight={44} />
{:else if model.phase === 'expired'}
  <h1>This has expired</h1>
  <p>It is no longer shown to anyone, and it will be deleted soon. The person who uploaded it, or an owner of the workspace, can keep it by choosing a new delete date or none.</p>
  <div class="panel sl-needs"><ExpiryForm {model} heading="Keep it" /></div>
  <p><a href="/">Back to the library</a></p>
{:else if model.phase === 'refused'}
  <!-- The page's heading says why there is no item (catch-up S7): not there for you, or could not load (with Try again). -->
  <div class="sl-failed" data-failed={model.refusalKind}>
    <h1 tabindex="-1" {@attach model.refusalAnchor}>{model.refusal}</h1>
    <div class="actions">{#if model.canRetryRefusal}<Button variant="primary" onclick={() => model.retry()}>Try again</Button>{/if}<Button href="/">Back to the library</Button></div>
  </div>
{/if}
