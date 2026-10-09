<script lang="ts">
  import { page } from '$app/state';
  import ItemView from '$lib/ItemView.svelte';
  import { parseVersion } from '$lib/item';
</script>

<ItemView itemId={page.params.itemId!} version={parseVersion(page.params.version)} />
