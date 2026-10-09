<!-- apps/web/src/lib/ItemHeader.svelte -->
<script lang="ts">
  import type { ItemSummary } from '@superlibrary/contract';
  import { visibilityWords } from '@superlibrary/embed';
  import OutcomeBadge from '$kit/OutcomeBadge.svelte';
  import Toolbar, { type ToolbarItem } from '$kit/Toolbar.svelte';
  import { day } from '$lib/item';

  let { item, version, latest, actions = [] }: { item: ItemSummary; version?: number; latest?: number; actions?: ToolbarItem[] } = $props();
  const meta = $derived([
    version !== undefined ? `v${version}${version === latest ? ' (latest)' : ''}` : null,
    visibilityWords({ scope: item.scope, canWiden: false, boardVisible: item.audience === 'board' }),
    item.expiresAt ? `deleted on ${day(item.expiresAt)}` : null,
  ].filter((m): m is string => m !== null));
</script>

<!-- One line of facts under the title, then the content: details live below the viewer. -->
<header class="item-header">
  <h1>{item.title}</h1>
  <p class="item-meta"><OutcomeBadge outcome={item.outcome} />{#each meta as m (m)}<span>{m}</span>{/each}</p>
  {#if actions.length}<Toolbar label="Item" items={actions} />{/if}
</header>
