<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { LAYOUTS } from '$lib/layouts/registry';
  import { LibraryModel } from '$lib/screens/library.svelte';
  import VibeLayout from '$lib/vibe/VibeLayout.svelte';

  const model = new LibraryModel(() => page.url.searchParams, (href) => goto(href, { replaceState: true, keepFocus: true, noScroll: true }));
</script>

<svelte:head><title>Library · Superlibrary</title></svelte:head>
<VibeLayout layouts={LAYOUTS.library} {model} />
