<!-- apps/web/src/lib/kit/Tabs.svelte -->
<script lang="ts">
  import type { Outcome } from '@superlibrary/contract';
  import { outcomeVar } from './outcome';
  import Count from './Count.svelte';
  let { label, items }: { label: string; items: Array<{ href: string; label: string; count?: number | null; current: boolean; tone?: Outcome }> } = $props();
</script>

<nav aria-label={label}>
  <ul class="kit-tabs">
    {#each items as t (t.href)}
      <li style:--o={t.tone ? outcomeVar(t.tone) : undefined}>
        <a href={t.href} aria-current={t.current ? 'page' : undefined}>
          {#if t.tone}<span class="outcome">{t.label}</span>{:else}{t.label}{/if}
          <!-- null: not known yet, a dash in the number's place (never 0, and the tab does not grow when it lands). -->
          {#if t.count !== undefined}<Count class="count" value={t.count} />{/if}
        </a>
      </li>
    {/each}
  </ul>
</nav>
