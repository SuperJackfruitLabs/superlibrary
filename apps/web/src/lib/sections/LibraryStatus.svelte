<script lang="ts">
  import type { LibraryModel } from '$lib/screens/library.svelte';
  let { model }: { model: LibraryModel } = $props();
</script>

<p class="muted sl-status" role="status">{model.status}</p>
