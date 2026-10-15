import { tick, untrack } from 'svelte';
import type { Attachment } from 'svelte/attachments';
import { COLLECTION_ID, type CollectionDetail, type CollectionSummary } from '@superlibrary/contract';
import { askDeleteCollection, createCollection, deleteCollection, getCollection, listCollections, removeFromCollection, updateCollection } from '$lib/collections';
import { when } from '$lib/item';
import { api as sessionApi } from '$lib/session.svelte';
import { MISSING_COPY, type FailKind } from '$lib/loading';

type Api = (path: string, init?: RequestInit) => Promise<Response>;
export const countWords = (n: number) => `${n} item${n === 1 ? '' : 's'}`;

/** /collections (spec §5.3). */
export class CollectionsModel {
  list = $state<CollectionSummary[]>([]);
  loading = $state(true);
  error = $state<string | null>(null);
  failKind = $state<FailKind | null>(null);
  name = $state('');
  description = $state('');
  creating = $state(false);
  createError = $state<string | null>(null);
  readonly #go: (href: string) => unknown;
  readonly #api: Api;

  constructor(go: (href: string) => unknown, api: Api = sessionApi) {
    this.#go = go;
    this.#api = api;
    $effect(() => { untrack(() => void this.load()); });
  }
  async load() {
    this.loading = true;
    const r = await listCollections(this.#api);
    this.loading = false;
    if (r.ok) { this.list = r.value.collections; this.error = null; this.failKind = null; } else { this.error = r.message; this.failKind = r.kind; }
  }
  async create(e?: SubmitEvent) {
    e?.preventDefault();
    if (!this.name.trim()) { this.createError = 'Give the collection a name.'; return; }
    this.creating = true;
    this.createError = null;
    const r = await createCollection(this.#api, this.name.trim(), this.description.trim());
    this.creating = false;
    if (!r.ok) { this.createError = r.message; return; }
    await this.#go(`/collections/${r.value.id}`);
  }
}

/** /collections/[id] (spec §5.4). */
export class CollectionModel {
  c = $state<CollectionDetail | null>(null);
  /** True until the first read answered (and again while a Try again is out). */
  loading = $state(true);
  error = $state<string | null>(null);
  /** Why it failed: not there for this person (404/403, a bad id) or could not load (5xx, network). */
  failKind = $state<FailKind | null>(null);
  notice = $state<string | null>(null);
  editing = $state(false);
  name = $state('');
  description = $state('');
  editError = $state<string | null>(null);
  /** The Delete button that opened the dialog (focus goes back to it), or null when closed. */
  deleting = $state.raw<HTMLElement | null>(null);
  busy = $state(false);
  dialogError = $state<string | null>(null);
  readonly #go: (href: string) => unknown;
  readonly #api: Api;
  #renameEl: HTMLElement | null = null;

  /** The route id, read through a function so it follows navigation (the constructor replaces the placeholder). */
  readonly #id: () => string = () => '';
  readonly id = $derived(this.#id());
  readonly meta = $derived(this.c ? `${countWords(this.c.itemCount)} · created ${when(this.c.createdAt)}` : '');
  readonly ask = $derived(this.c ? askDeleteCollection(this.c.name) : null);
  /** On "Rename or describe", so focus returns there after editing. A newer element is never cleared by an older detach. */
  readonly renameAnchor: Attachment<HTMLElement> = (el) => { this.#renameEl = el; return () => { if (this.#renameEl === el) this.#renameEl = null; }; };

  constructor(id: () => string, go: (href: string) => unknown, api: Api = sessionApi) {
    this.#id = id;
    this.#go = go;
    this.#api = api;
    $effect(() => { void this.id; untrack(() => void this.load()); });
  }
  async load() {
    if (!COLLECTION_ID.test(this.id)) { this.error = MISSING_COPY; this.failKind = 'missing'; this.loading = false; return; }
    if (!this.c) this.loading = true;
    const r = await getCollection(this.#api, this.id);
    this.loading = false;
    if (r.ok) { this.c = r.value; this.error = null; this.failKind = null; } else { this.error = r.message; this.failKind = r.kind; }
  }
  /** Try again after a failed read: back to loading, then the read. */
  retry() { this.c = null; this.error = null; this.failKind = null; this.loading = true; return this.load(); }
  startEdit() { this.name = this.c!.name; this.description = this.c!.description; this.editError = null; this.editing = true; }
  async stopEditing() { this.editing = false; await tick(); this.#renameEl?.focus(); }
  async save(e: SubmitEvent) {
    e.preventDefault();
    if (!this.name.trim()) { this.editError = 'Give the collection a name.'; return; }
    const err = await updateCollection(this.#api, this.id, { name: this.name.trim(), description: this.description.trim() });
    if (err) { this.editError = err; return; }
    this.notice = 'Saved.';
    await this.load();
    await this.stopEditing();
  }
  async remove(itemId: string, title: string) {
    const err = await removeFromCollection(this.#api, this.id, itemId);
    this.notice = err ?? `Removed “${title}” from the collection.`;
    await this.load();
  }
  askDelete(e: MouseEvent) { this.dialogError = null; this.deleting = e.currentTarget as HTMLElement; }
  async confirmDelete() {
    this.busy = true;
    this.dialogError = null;
    const err = await deleteCollection(this.#api, this.id);
    this.busy = false;
    if (err) { this.dialogError = err; return; }
    this.deleting = null;
    await this.#go('/collections');
  }
  cancelDelete() { if (!this.busy) this.deleting = null; }
  dismissNotice() { this.notice = null; }
}
