<script lang="ts" generics="M">
  import type { Component } from 'svelte';
  import { look } from './appearance.svelte';
  import { pickLayout, type Layouts } from './layout';

  let { layouts, model }: { layouts: Layouts<Component<{ model: M }>>; model: M } = $props();
  const Layout = $derived(pickLayout(look.appearance.vibe, layouts));
</script>

<Layout {model} />
