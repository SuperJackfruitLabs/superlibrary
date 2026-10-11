<script lang="ts">
  import { Face } from '@superjackfruit/vibekit';
  import type { WorkRecordView } from '@superlibrary/contract';
  import { when } from '$lib/item';
  import { timelineOf, toneVar } from '$lib/record';
  let { view, variant = 'bubbles' }: { view: WorkRecordView; variant?: 'bubbles' } = $props();
  const entries = $derived(timelineOf(view.record));
</script>

<ol class="timeline timeline--{variant}">
  {#each entries as e (e.key)}
    <li style:--o={toneVar(e.tone)}>
      {#if variant === 'bubbles' && e.who}<span class="tl-face" aria-hidden="true"><Face id={e.who} label={e.who} size={28} /></span>{/if}
      <strong>{e.title}</strong>
      <div class="when">{e.at ? when(e.at) : 'Time not recorded'}{e.who ? ` · ${e.who}` : ''}</div>
      {#if e.detail}<p class="body">{e.detail}</p>{/if}
    </li>
  {/each}
</ol>
