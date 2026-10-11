<script lang="ts">
  import OutcomeBadge from '$kit/OutcomeBadge.svelte';
  import { outcomeVar } from '$kit/outcome';
  import type { Row } from '$lib/library';
  let { rows, label }: { rows: Row[]; label: string } = $props();
  const COLS = ['Status', 'Title', 'Outcome', 'Kind', 'Board', 'Station', 'Source path', 'Visible to', 'Excerpt', 'Replaced by'];
</script>

<!-- Explicit roles are deliberate: stacked by CSS, Safari would otherwise drop the table semantics. -->
<!-- svelte-ignore a11y_no_redundant_roles -->
<table class="results sl-table sl-table--wide" role="table" aria-label={label}>
  <!-- svelte-ignore a11y_no_redundant_roles -->
  <thead role="rowgroup"><tr role="row">{#each COLS as h, i (h)}<th role="columnheader" scope="col">{#if i === 0}<span class="visually-hidden">{h}</span>{:else}{h}{/if}</th>{/each}</tr></thead>
  <!-- svelte-ignore a11y_no_redundant_roles -->
  <tbody role="rowgroup">
    {#each rows as r (r.id)}
      <!-- svelte-ignore a11y_no_redundant_roles -->
      <tr class="result" role="row" style:--o={outcomeVar(r.outcome)}>
        <td role="cell" data-label="Status"><span class="sl-led" class:sl-led--live={r.outcome === 'in-progress'} aria-hidden="true"></span></td>
        <td role="cell" data-label="Title"><a class="result-link" href={`/a/${r.id}`}>{r.title}</a></td>
        <td role="cell" data-label="Outcome"><OutcomeBadge outcome={r.outcome} /></td>
        <td role="cell" data-label="Kind">{r.kindWord}</td>
        <td role="cell" data-label="Board">{r.board ?? ''}</td>
        <td role="cell" data-label="Station">{r.station ?? ''}</td>
        <td role="cell" data-label="Source path">{#if r.path}<code>{r.path}</code>{/if}</td>
        <td role="cell" data-label="Visible to">{r.visibility ?? ''}</td>
        <td role="cell" data-label="Excerpt">{#if r.snippet}<span class="snippet">{r.snippet}</span>{/if}</td>
        <td role="cell" data-label="Replaced by">{#if r.supersededBy}<a class="replaced" href={`/a/${r.supersededBy}`}>See what replaced it</a>{/if}</td>
      </tr>
    {/each}
  </tbody>
</table>
