<!-- apps/web/src/lib/ItemHeader.svelte -->
<script lang="ts">
  import type { ItemSummary } from '@superlibrary/contract';
  import { visibilityWords } from '@superlibrary/embed';
  import { Face } from '@superjackfruit/vibekit';
  import OutcomeBadge from '$kit/OutcomeBadge.svelte';
  import Toolbar, { type ToolbarItem } from '$kit/Toolbar.svelte';
  import { day } from '$lib/item';
  import { moodOf, type Maker } from '$lib/vibe/faces';

  let { item, version, latest, actions = [], maker = null, band = false }: { item: ItemSummary; version?: number; latest?: number; actions?: ToolbarItem[]; maker?: Maker | null; band?: boolean } = $props();
  const meta = $derived([
    version !== undefined ? `v${version}${version === latest ? ' (latest)' : ''}` : null,
    visibilityWords({ scope: item.scope, canWiden: false, boardVisible: item.audience === 'board' }),
    item.expiresAt ? `deleted on ${day(item.expiresAt)}` : null,
  ].filter((m): m is string => m !== null));
</script>

<!-- One line of facts under the title, then the content: details live below the viewer. -->
<header class="item-header" class:sl-band={band}>
  <h1>{item.title}</h1>
  <p class="item-meta">{#if maker}<span class="item-face" aria-hidden="true"><Face id={maker.id} label={maker.label} mood={moodOf(item.outcome)} size={24} /></span>{/if}<OutcomeBadge outcome={item.outcome} />{#each meta as m (m)}<span>{m}</span>{/each}</p>
  {#if actions.length}<Toolbar label="Item" items={actions} />{/if}
</header>
