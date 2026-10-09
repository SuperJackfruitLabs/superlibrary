<script lang="ts">
  import { page } from '$app/state';
  import ItemView from '$lib/ItemView.svelte';
</script>

<ItemView itemId={page.params.itemId!} />
