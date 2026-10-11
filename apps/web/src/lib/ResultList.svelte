<!-- apps/web/src/lib/ResultList.svelte: one list of results, drawn the way the vibe draws rows (registry ROWS). -->
<script lang="ts">
  import type { Component } from 'svelte';
  import type { Row } from '$lib/library';
  import { ROWS, type RowVariant } from '$lib/layouts/rows';
  import { look } from '$lib/vibe/appearance.svelte';
  import ResultsCards from '$lib/sections/results/ResultsCards.svelte';

  let { rows, label, variant }: { rows: Row[]; label: string; variant?: RowVariant } = $props();
  // Phases 2 to 4 add index, table and plain. Until then a vibe's rows fall back to cards.
  const SHAPES: Partial<Record<RowVariant, Component<{ rows: Row[]; label: string }>>> = { cards: ResultsCards };
  const Shape = $derived(SHAPES[variant ?? ROWS[look.appearance.vibe]] ?? ResultsCards);
</script>

<Shape {rows} {label} />
