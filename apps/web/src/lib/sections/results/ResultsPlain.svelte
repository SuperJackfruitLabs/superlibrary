<script lang="ts">
  import OutcomeBadge from '$kit/OutcomeBadge.svelte';
  import { outcomeVar } from '$kit/outcome';
  import type { Row } from '$lib/library';
  let { rows, label }: { rows: Row[]; label: string } = $props();
</script>

<ul class="results results--plain" role="list" aria-label={label}>
  {#each rows as r (r.id)}
    <li class="result" style:--o={outcomeVar(r.outcome)}>
      <a class="result-link" href={`/a/${r.id}`}><span class="result-title">{r.title}</span></a>
      <p class="sl-facts-line">Outcome: <OutcomeBadge outcome={r.outcome} />. {r.line}.{#if r.visibility}{' '}Visible to: {r.visibility}.{/if}</p>
      {#if r.snippet}<p class="snippet">{r.snippet}</p>{/if}
      {#if r.supersededBy}<p><a class="replaced" href={`/a/${r.supersededBy}`}>See what replaced it</a></p>{/if}
    </li>
  {/each}
</ul>
