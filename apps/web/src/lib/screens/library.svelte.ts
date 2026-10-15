import { untrack } from 'svelte';
import type { Facets, ItemSummary, OutcomeCounts, SearchResult } from '@superlibrary/contract';
import { api as sessionApi } from '$lib/session.svelte';
import type { FailKind } from '$lib/loading';
import {
  activeFilters, boardNames, browseLibrary, loadFacets, rangeProblem, readFilters, rowOfItem, rowOfResult, searchLibrary, writeFilters,
  type Filters, type Row,
} from '$lib/library';

type Api = (path: string, init?: RequestInit) => Promise<Response>;

/** The library home's data and actions (spec §5.1). Construct it in the route's script so its effects belong to the page. */
export class LibraryModel {
  facets = $state<Facets | null>(null);
  results = $state<SearchResult[]>([]);
  items = $state<ItemSummary[]>([]);
  counts = $state<OutcomeCounts | null>(null);
  next = $state<string | null>(null);
  loading = $state(true);
  /** True while a first page (not a "More") is loading: the rows and counts on screen are then the previous query's. */
  refreshing = $state(true);
  error = $state<string | null>(null);
  failKind = $state<FailKind | null>(null);
  /** The search box's words; submitted into the address. */
  words = $state('');

  readonly #params: () => URLSearchParams;
  readonly #navigate: (href: string) => unknown;
  readonly #api: Api;
  #loads = 0;
  /** The cursor of the last request, so a retry resumes there. */
  #tried: string | null = null;

  readonly filters: Filters = $derived.by(() => readFilters(this.#params()));
  readonly searching = $derived(this.filters.q.trim() !== '');
  readonly boards = $derived(boardNames(this.facets));
  readonly rows: Row[] = $derived(this.searching ? this.results.map((r) => rowOfResult(r, this.boards)) : this.items.map((i) => rowOfItem(i, this.boards)));
  readonly activeCount = $derived(activeFilters(this.filters));
  readonly listLabel = $derived(this.searching ? 'Search results' : 'Library');
  readonly summary = $derived(
    this.searching
      ? this.rows.length === 25 ? 'The 25 best matches' : `${this.rows.length} match${this.rows.length === 1 ? '' : 'es'}`
      : `${this.rows.length}${this.next ? '+' : ''} item${this.rows.length === 1 ? '' : 's'}, most recent activity first`,
  );
  /** The summary line: blank while loading (no count before the data) and on an error, which says itself. */
  readonly status = $derived(this.loading || this.error ? '' : this.summary);
  readonly empty = $derived<'none' | 'no-match' | 'nothing-yet'>(this.error || this.loading || this.rows.length ? 'none' : this.searching ? 'no-match' : 'nothing-yet');

  constructor(params: () => URLSearchParams, navigate: (href: string) => unknown, api: Api = sessionApi) {
    this.#params = params;
    this.#navigate = navigate;
    this.#api = api;
    $effect(() => { untrack(() => void this.#loadFacets()); });
    $effect(() => { const f = this.filters; untrack(() => { this.words = f.q; void this.load(f); }); });
  }

  async #loadFacets() { const f = await loadFacets(this.#api); if (f.ok) this.facets = f.value; }   // a failure leaves the menus empty, as today

  setFilters(f: Filters) { const qs = writeFilters(f); return this.#navigate(qs ? `/?${qs}` : '/'); }
  submit() { return this.setFilters({ ...this.filters, q: this.words }); }
  retry() { return this.load(this.filters, this.#tried); }
  more() { return this.load(this.filters, this.next); }

  async load(f: Filters, cursor: string | null = null) {
    const mine = ++this.#loads;
    this.#tried = cursor;
    this.loading = true;
    this.refreshing = cursor === null;
    this.error = null;
    this.failKind = null;
    if (rangeProblem(f)) { this.results = []; this.items = []; this.next = null; this.loading = false; this.refreshing = false; return; }
    if (f.q.trim()) {
      const r = await searchLibrary(this.#api, f);
      if (mine !== this.#loads) return;
      if (r.ok) { this.results = r.value.results; this.next = null; } else { this.error = r.message; this.failKind = r.kind; }
    } else {
      const r = await browseLibrary(this.#api, f, cursor);
      if (mine !== this.#loads) return;
      if (r.ok) { this.items = cursor ? [...this.items, ...r.value.items] : r.value.items; this.next = r.value.next; if (!cursor) this.counts = r.value.counts; } else { this.error = r.message; this.failKind = r.kind; }
    }
    this.loading = false;
    this.refreshing = false;
  }
}
