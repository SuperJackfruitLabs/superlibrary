<!-- apps/web/src/lib/ResultList.svelte -->
<script lang="ts">
  import OutcomeBadge from '$kit/OutcomeBadge.svelte';
  import { outcomeVar } from '$kit/outcome';
  import type { Row } from '$lib/library';
  import { look } from '$lib/vibe/appearance.svelte';
  import { rowShapeFor } from '$lib/layouts/registry';

  let { rows, label }: { rows: Row[]; label: string } = $props();
  const shape = $derived(rowShapeFor(look.appearance.vibe));
</script>

<ul class="results" aria-label={label} data-rows={shape}>
  {#each rows as r (r.id)}
    <li class="result" style:--o={outcomeVar(r.outcome)}>
      <a class="result-link" href={`/a/${r.id}`}>
        <span class="result-title">{r.title}</span>
        <span class="result-meta"><OutcomeBadge outcome={r.outcome} /><small>{r.line}</small>{#if r.visibility}<small>{r.visibility}</small>{/if}</span>
        {#if r.snippet}<span class="snippet">{r.snippet}</span>{/if}
      </a>
      {#if r.supersededBy}<a class="replaced" href={`/a/${r.supersededBy}`}>See what replaced it</a>{/if}
    </li>
  {/each}
</ul>
