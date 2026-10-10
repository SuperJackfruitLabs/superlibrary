<script lang="ts">
  import type { WorkRecordView } from '@superlibrary/contract';
  let { view }: { view: WorkRecordView } = $props();
</script>

{#if view.artifacts.length}
  <ul class="items">
    {#each view.artifacts as a (a.id)}<li><a href={`/a/${a.id}`}><span class="title">{a.title}</span><small>v{a.latestVersion}</small></a></li>{/each}
  </ul>
{:else}
  <p class="muted">No artifacts linked that you can see.</p>
{/if}
