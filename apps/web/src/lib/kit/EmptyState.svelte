<!-- apps/web/src/lib/kit/EmptyState.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  let { title, body, action }: { title: string; body?: string; action?: Snippet } = $props();
</script>

<section class="kit-empty">
  <h2>{title}</h2>
  {#if body}<p>{body}</p>{/if}
  {#if action}<div class="kit-empty-action">{@render action()}</div>{/if}
</section>
