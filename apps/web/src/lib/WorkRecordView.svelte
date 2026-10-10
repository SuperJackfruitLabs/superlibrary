<!-- apps/web/src/lib/WorkRecordView.svelte -->
<script lang="ts">
  import type { WorkRecordView } from '@superlibrary/contract';
  import { specRows } from '$lib/record';
  import LinkedArtifacts from '$lib/sections/LinkedArtifacts.svelte';
  import RecordLine from '$lib/sections/RecordLine.svelte';
  import SpecRows from '$lib/sections/SpecRows.svelte';
  import Timeline from '$lib/sections/Timeline.svelte';
  let { view, timeline = 'bubbles' }: { view: WorkRecordView; timeline?: 'bubbles' } = $props();
  const hasSpec = $derived(specRows(view.record.spec).length > 0);
</script>

<section class="record" aria-labelledby="timeline-h">
  <RecordLine {view} />
  {#if hasSpec}<div class="sl-brief"><span class="sl-pin" aria-hidden="true">Brief</span><h2>Spec</h2><SpecRows {view} /></div>{/if}
  <h2 id="timeline-h">Timeline</h2>
  <Timeline {view} variant={timeline} />
  <h2>Artifacts</h2>
  <LinkedArtifacts {view} />
</section>
