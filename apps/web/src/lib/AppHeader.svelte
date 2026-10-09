<script lang="ts">
  import Mark from './Mark.svelte';
  let { onsignout }: { onsignout: () => void } = $props();
</script>

<header class="top">
  <a href="/" class="brand"><Mark /><strong>Superlibrary</strong></a>
  <nav><a href="/upload">Upload</a><button type="button" onclick={onsignout}>Sign out</button></nav>
</header>
