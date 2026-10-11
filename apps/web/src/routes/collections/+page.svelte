<!-- apps/web/src/routes/collections/+page.svelte -->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { LAYOUTS } from '$lib/layouts/registry';
  import { CollectionsModel } from '$lib/screens/collections.svelte';
  import VibeLayout from '$lib/vibe/VibeLayout.svelte';
  const model = new CollectionsModel((href) => goto(href));
</script>

<svelte:head><title>Collections · Superlibrary</title></svelte:head>
<VibeLayout layouts={LAYOUTS.collections} {model} />
