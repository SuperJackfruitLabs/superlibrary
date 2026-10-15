<script lang="ts">
  import { loadingStatus } from '$lib/loading.svelte';
  import type { LibraryModel } from '$lib/screens/library.svelte';
  let { model }: { model: LibraryModel } = $props();
  // The screen's one status line (the layout's) announces the count; this line only shows it. Its
  // height is kept while loading, so the results below do not move when the count lands.
  $effect(() => { loadingStatus.say(model.status); });
</script>

<p class="muted sl-status">{model.status}</p>
