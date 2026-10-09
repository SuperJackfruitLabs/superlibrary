<!-- apps/web/src/lib/FilterBar.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { Facets, Outcome } from '@superlibrary/contract';
  import { OUTCOME_ORDER, OUTCOME_WORDS, outcomeVar } from '$kit/outcome';
  import { EMPTY_FILTERS, activeFilters, rangeProblem, type Filters } from '$lib/library';

  let { filters, facets, onchange, hideOutcomes = false }: { filters: Filters; facets: Facets | null; onchange: (f: Filters) => void; hideOutcomes?: boolean } = $props();
  // Folded on phones, open from 768px (the operator reads on a phone first).
  let open = $state(false);
  onMount(() => { open = window.matchMedia('(min-width: 768px)').matches; });

  const set = (patch: Partial<Filters>) => onchange({ ...filters, ...patch });
  const toggle = (o: Outcome, on: boolean) => set({ outcomes: on ? [...filters.outcomes, o] : filters.outcomes.filter((x) => x !== o) });
  const count = $derived(activeFilters(filters) - (hideOutcomes ? filters.outcomes.length : 0));
  const problem = $derived(rangeProblem(filters));
</script>

<details class="filters" bind:open>
  <summary>Filters{count ? ` · ${count} on` : ''}</summary>
  <div class="filter-grid">
    <label class="field">Kind
      <select value={filters.kind} onchange={(e) => set({ kind: e.currentTarget.value as Filters['kind'] })}>
        <option value="">Everything</option><option value="artifact">Artifacts</option><option value="work-record">Work records</option>
      </select>
    </label>
    <label class="field">Board
      <select value={filters.board} onchange={(e) => set({ board: e.currentTarget.value })}>
        <option value="">Every board</option>
        {#each facets?.boards ?? [] as b (b.id)}<option value={b.id}>{b.name}</option>{/each}
      </select>
    </label>
    <label class="field">Agent
      <select value={filters.agent} onchange={(e) => set({ agent: e.currentTarget.value })}>
        <option value="">Anyone</option>
        {#each facets?.agents ?? [] as a (a)}<option value={a}>{a}</option>{/each}
      </select>
    </label>
    <label class="field">Station
      <select value={filters.station} onchange={(e) => set({ station: e.currentTarget.value })}>
        <option value="">Any station</option>
        {#each facets?.stations ?? [] as s (s.id)}<option value={s.id}>{s.name ?? s.id}</option>{/each}
      </select>
    </label>
    <label class="field">Active
      <select value={filters.period} onchange={(e) => set({ period: e.currentTarget.value as Filters['period'] })}>
        <option value="any">Any time</option><option value="week">This week</option><option value="month">This month</option>
        <option value="30d">Last 30 days</option><option value="custom">Between dates…</option>
      </select>
    </label>
    {#if filters.period === 'custom'}
      <label class="field">From <input type="date" value={filters.from} onchange={(e) => set({ from: e.currentTarget.value })} /></label>
      <label class="field">To <input type="date" value={filters.to} onchange={(e) => set({ to: e.currentTarget.value })} /></label>
    {/if}
    {#if !hideOutcomes}
      <fieldset class="outcome-picks">
        <legend>Outcome</legend>
        {#each OUTCOME_ORDER as o (o)}
          <label class="check pick" style:--o={outcomeVar(o)}>
            <input type="checkbox" checked={filters.outcomes.includes(o)} onchange={(e) => toggle(o, e.currentTarget.checked)} />
            {OUTCOME_WORDS[o]}
          </label>
        {/each}
      </fieldset>
    {/if}
  </div>
  {#if problem}<p class="error" role="alert">{problem}</p>{/if}
  {#if count}<p><button type="button" onclick={() => onchange({ ...EMPTY_FILTERS, q: filters.q, period: hideOutcomes ? filters.period : 'any', outcomes: hideOutcomes ? filters.outcomes : [] })}>Clear filters</button></p>{/if}
</details>
