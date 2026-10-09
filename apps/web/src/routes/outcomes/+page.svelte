<!-- apps/web/src/routes/outcomes/+page.svelte -->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { onMount, untrack } from 'svelte';
  import { OUTCOMES, type Facets, type ItemSummary, type Outcome, type OutcomeCounts } from '@superlibrary/contract';
  import { api } from '$lib/session.svelte';
  import FilterBar from '$lib/FilterBar.svelte';
  import ResultList from '$lib/ResultList.svelte';
  import Button from '$kit/Button.svelte';
  import Tabs from '$kit/Tabs.svelte';
  import { OUTCOME_ORDER, OUTCOME_WORDS } from '$kit/outcome';
  import { boardNames, browseLibrary, loadFacets, rangeProblem, readFilters, rowOfItem, viewTitle, writeFilters, type Filters } from '$lib/library';

  /** This page opens on this month (spec §11 "everything rejected on … this month"). */
  const DEFAULTS = { period: 'month' } as const;
  let facets = $state<Facets | null>(null);
  let items = $state<ItemSummary[]>([]);
  let counts = $state<OutcomeCounts | null>(null);
  let next = $state<string | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  const filters = $derived<Filters>({ ...readFilters(page.url.searchParams, DEFAULTS), q: '' });
  const selected = $derived<Outcome | null>(filters.outcomes[0] ?? null);
  const boards = $derived(boardNames(facets));
  const rows = $derived(items.map((i) => rowOfItem(i, boards)));
  const title = $derived(viewTitle(selected, filters.board ? (boards.get(filters.board) ?? filters.board) : null, filters.period));
  const total = $derived(counts ? OUTCOMES.reduce((n, o) => n + counts![o], 0) : null);
  const href = (f: Filters) => { const qs = writeFilters(f, DEFAULTS); return qs ? `/outcomes?${qs}` : '/outcomes'; };

  const tabs = $derived([
    { href: href({ ...filters, outcomes: [] }), label: 'Everything', count: total, current: selected === null },
    ...OUTCOME_ORDER.map((o) => ({ href: href({ ...filters, outcomes: [o] }), label: OUTCOME_WORDS[o], count: counts ? counts[o] : null, current: selected === o, tone: o })),
  ]);

  onMount(async () => { const f = await loadFacets(api); if (f.ok) facets = f.value; });

  let loads = 0;
  let tried: string | null = null;   // the cursor of the last request, so a retry resumes there
  async function load(f: Filters, cursor: string | null = null) {
    const mine = ++loads;
    tried = cursor;
    loading = true;
    error = null;
    if (rangeProblem(f)) { items = []; counts = null; next = null; loading = false; return; }
    const r = await browseLibrary(api, { ...f, outcomes: f.outcomes.slice(0, 1) }, cursor);
    if (mine !== loads) return;
    if (r.ok) { items = cursor ? [...items, ...r.value.items] : r.value.items; counts = r.value.counts; next = r.value.next; } else {
      error = r.message;
      if (!cursor) { items = []; counts = null; next = null; }   // never show the last view's rows under this view's title
    }
    loading = false;
  }
  $effect(() => { const f = filters; untrack(() => void load(f)); });
</script>

<svelte:head><title>Outcomes · Superlibrary</title></svelte:head>
<h1>{title}</h1>
<Tabs label="Outcome" items={tabs} />
<FilterBar {filters} {facets} hideOutcomes onchange={(f) => void goto(href({ ...f, outcomes: filters.outcomes }), { replaceState: true, keepFocus: true, noScroll: true })} />
<p class="muted" role="status">{loading ? 'Loading…' : error ? '' : `${rows.length}${next ? '+' : ''} item${rows.length === 1 ? '' : 's'}, most recent activity first`}</p>
{#if error}
  <p class="error" role="alert">{error}</p>
  <Button onclick={() => load(filters, tried)}>Try again</Button>
{:else if !loading && rows.length === 0}
  <p>Nothing{selected ? ` ${OUTCOME_WORDS[selected].toLowerCase()}` : ''} here in this period. Try another board or a longer period.</p>
{/if}
{#if rows.length}
  <ResultList {rows} label={title} />
  {#if next}<Button disabled={loading} onclick={() => load(filters, next)}>{loading ? 'Loading…' : 'More'}</Button>{/if}
{/if}
