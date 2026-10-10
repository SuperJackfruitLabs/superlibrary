<script lang="ts">
  import type { WorkRecordView } from '@superlibrary/contract';
  import Button from '$kit/Button.svelte';
  import Toast from '$kit/Toast.svelte';
  let { view }: { view: WorkRecordView } = $props();
  const r = $derived(view.record);
  const card = $derived(view.item.source?.sourceUrl && /^https:\/\//.test(view.item.source.sourceUrl) ? view.item.source.sourceUrl : null);
</script>

<p class="result-meta">
  <span>{view.boardName ?? r.boardId}</span>
  {#if r.stage}<span>Now at {r.stage}</span>{/if}
</p>
{#if card}<p><Button href={card} target="_blank" rel="noopener noreferrer">Open the card in Superpipeline</Button></p>{/if}
{#if r.redactions.length}<Toast tone="info" message="Some text was hidden because it looked like a secret." />{/if}
{#if r.truncated}<Toast tone="info" message="This record is long: its oldest comments and handoffs were shortened." />{/if}
