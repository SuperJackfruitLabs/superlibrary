<!-- apps/web/src/lib/ResultList.svelte -->
<script lang="ts">
  import OutcomeBadge from '$kit/OutcomeBadge.svelte';
  import { outcomeVar } from '$kit/outcome';
  import type { Row } from '$lib/library';

  let { rows, label }: { rows: Row[]; label: string } = $props();
</script>

<ul class="results" aria-label={label}>
  {#each rows as r (r.id)}
    <li class="result" style:--o={outcomeVar(r.outcome)}>
      <a class="result-link" href={`/a/${r.id}`}>
        <span class="result-title">{r.title}</span>
        <span class="result-meta"><OutcomeBadge outcome={r.outcome} /><small>{r.line}</small></span>
        {#if r.snippet}<span class="snippet">{r.snippet}</span>{/if}
      </a>
      {#if r.supersededBy}<a class="replaced" href={`/a/${r.supersededBy}`}>See what replaced it</a>{/if}
    </li>
  {/each}
</ul>
