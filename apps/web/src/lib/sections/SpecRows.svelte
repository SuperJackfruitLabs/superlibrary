<script lang="ts">
  import type { WorkRecordView } from '@superlibrary/contract';
  import { specRows } from '$lib/record';
  let { view }: { view: WorkRecordView } = $props();
  const spec = $derived(specRows(view.record.spec));
</script>

<dl class="rows">{#each spec as s (s.label)}<dt>{s.label}</dt><dd class="body">{s.value}</dd>{/each}</dl>
