<!-- apps/web/src/lib/WorkRecordView.svelte -->
<script lang="ts">
  import type { WorkRecordView } from '@superlibrary/contract';
  import { specRows, timelineOf, toneVar } from '$lib/record';
  import Toast from '$kit/Toast.svelte';
  import { when } from '$lib/item';

  let { view }: { view: WorkRecordView } = $props();
  const r = $derived(view.record);
  const entries = $derived(timelineOf(r));
  const spec = $derived(specRows(r.spec));
  const card = $derived(view.item.source?.sourceUrl && /^https:\/\//.test(view.item.source.sourceUrl) ? view.item.source.sourceUrl : null);
</script>

<section class="record" aria-labelledby="timeline-h">
  <p class="result-meta">
    <span>{view.boardName ?? r.boardId}</span>
    {#if r.stage}<span>Now at {r.stage}</span>{/if}
  </p>
  {#if card}<p><a class="kit-button" href={card} target="_blank" rel="noopener noreferrer">Open the card in Superpipeline</a></p>{/if}
  {#if r.redactions.length}<Toast tone="info" message="Some text was hidden because it looked like a secret." />{/if}
  {#if r.truncated}<Toast tone="info" message="This record is long: its oldest comments and handoffs were shortened." />{/if}
  {#if spec.length}
    <h2>Spec</h2>
    <dl class="rows">{#each spec as s (s.label)}<dt>{s.label}</dt><dd class="body">{s.value}</dd>{/each}</dl>
  {/if}
  <h2 id="timeline-h">Timeline</h2>
  <ol class="timeline">
    {#each entries as e (e.key)}
      <li style:--o={toneVar(e.tone)}>
        <strong>{e.title}</strong>
        <div class="when">{e.at ? when(e.at) : 'Time not recorded'}{e.who ? ` · ${e.who}` : ''}</div>
        {#if e.detail}<p class="body">{e.detail}</p>{/if}
      </li>
    {/each}
  </ol>
  <h2>Artifacts</h2>
  {#if view.artifacts.length}
    <ul class="items">
      {#each view.artifacts as a (a.id)}<li><a href={`/a/${a.id}`}><span class="title">{a.title}</span><small>v{a.latestVersion}</small></a></li>{/each}
    </ul>
  {:else}
    <p class="muted">No artifacts linked that you can see.</p>
  {/if}
</section>
