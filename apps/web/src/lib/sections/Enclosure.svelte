<!-- An enclosure: a disclosure in the accessible accordion pattern (a heading holding a button). The closed state shows its summary. -->
<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  /** `level`: the heading's level, one below the heading the enclosures sit under. */
  let { id, title, summary = '', open = $bindable(false), openFrom = null, level = 2, children }: {
    id: string; title: string; summary?: string; open?: boolean; openFrom?: number | null; level?: 2 | 3; children: Snippet;
  } = $props();
  /** Only a person's own opening fades in; what is open on arrival is simply there. */
  let touched = $state(false);
  onMount(() => { if (openFrom !== null && window.matchMedia(`(min-width: ${openFrom}px)`).matches) open = true; });
</script>

<section class="sl-enclosure" aria-labelledby={`${id}-t`}>
  <svelte:element this={`h${level}`} id={`${id}-h`} aria-labelledby={`${id}-t`}>
    <button type="button" class="sl-enclosure-toggle" aria-expanded={open} aria-controls={`${id}-body`} onclick={() => { touched = true; open = !open; }}>
      <span class="sl-enclosure-title" id={`${id}-t`}>{title}</span>{#if summary}<span class="sl-enclosure-sum">{summary}</span>{/if}
    </button>
  </svelte:element>
  <div class="sl-enclosure-body" class:sl-enclosure-fade={touched} id={`${id}-body`} hidden={!open}>{@render children()}</div>
</section>
