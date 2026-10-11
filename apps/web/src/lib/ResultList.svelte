<!-- apps/web/src/lib/ResultList.svelte: one list of results, drawn the way the vibe draws rows (registry ROWS). -->
<script lang="ts">
  import type { Component } from 'svelte';
  import type { Row } from '$lib/library';
  import { ROWS, type RowVariant } from '$lib/layouts/rows';
  import { look } from '$lib/vibe/appearance.svelte';
  import ResultsIndex from '$lib/sections/results/ResultsIndex.svelte';
  import ResultsCards from '$lib/sections/results/ResultsCards.svelte';
  import ResultsTable from '$lib/sections/results/ResultsTable.svelte';

  let { rows, label, variant }: { rows: Row[]; label: string; variant?: RowVariant } = $props();
  // Phase 4 adds plain. Until then a vibe's rows fall back to cards.
  const SHAPES: Partial<Record<RowVariant, Component<{ rows: Row[]; label: string }>>> = { cards: ResultsCards, index: ResultsIndex, table: ResultsTable };
  const Shape = $derived(SHAPES[variant ?? ROWS[look.appearance.vibe]] ?? ResultsCards);
</script>

<Shape {rows} {label} />
