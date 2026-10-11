<script lang="ts">
  import { Face } from '@superjackfruit/vibekit';
  import OutcomeBadge from '$kit/OutcomeBadge.svelte';
  import { outcomeVar } from '$kit/outcome';
  import type { Row } from '$lib/library';
  import { moodOf } from '$lib/vibe/faces';
  let { rows, label }: { rows: Row[]; label: string } = $props();
</script>

<ul class="results results--cards" aria-label={label}>
  {#each rows as r (r.id)}
    <li class="result" style:--o={outcomeVar(r.outcome)}>
      <a class="result-link" href={`/a/${r.id}`}>
        <span class="result-title">{#if r.maker}<span class="result-face" aria-hidden="true"><Face id={r.maker.id} label={r.maker.label} mood={moodOf(r.outcome)} size={24} /></span>{/if}<span>{r.title}</span></span>
        <span class="result-meta"><OutcomeBadge outcome={r.outcome} /><small>{r.line}</small>{#if r.visibility}<small>{r.visibility}</small>{/if}</span>
        {#if r.snippet}<span class="snippet">{r.snippet}</span>{/if}
      </a>
      {#if r.supersededBy}<a class="replaced" href={`/a/${r.supersededBy}`}>See what replaced it</a>{/if}
    </li>
  {/each}
</ul>
