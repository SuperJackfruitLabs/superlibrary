<script lang="ts">
  import type { ItemModel } from '$lib/screens/item.svelte';
  let { model }: { model: ItemModel } = $props();
</script>

<p class="error" role="alert">Couldn't load the record — try again.</p>
<p><button type="button" onclick={() => model.load()}>Try again</button></p>
