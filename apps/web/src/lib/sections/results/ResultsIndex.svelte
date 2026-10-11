<script lang="ts">
  import { Face } from '@superjackfruit/vibekit';
  import OutcomeBadge from '$kit/OutcomeBadge.svelte';
  import { outcomeVar } from '$kit/outcome';
  import type { Row } from '$lib/library';
  import { moodOf } from '$lib/vibe/faces';
  let { rows, label }: { rows: Row[]; label: string } = $props();
</script>

<ul class="results results--index" aria-label={label}>
  {#each rows as r (r.id)}
    <li class="result" style:--o={outcomeVar(r.outcome)}>
      <a class="result-link" href={`/a/${r.id}`}><span class="result-title">{r.title}</span></a>
      <p class="sl-byline">{#if r.maker}<span class="result-face" aria-hidden="true"><Face id={r.maker.id} label={r.maker.label} mood={moodOf(r.outcome)} size={24} /></span>{/if}<em>{r.line}</em></p>
      <p class="result-meta"><OutcomeBadge outcome={r.outcome} />{#if r.visibility}<span>{r.visibility}</span>{/if}</p>
      {#if r.snippet}<blockquote class="snippet">{r.snippet}</blockquote>{/if}
      {#if r.supersededBy}<a class="replaced" href={`/a/${r.supersededBy}`}>See what replaced it</a>{/if}
    </li>
  {/each}
</ul>
