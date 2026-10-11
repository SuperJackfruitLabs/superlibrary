import { tick, untrack } from 'svelte';
import type { Attachment } from 'svelte/attachments';
import { replaceState } from '$app/navigation';
import type { ItemSummary, VersionSummary, WorkRecordView } from '@superlibrary/contract';
import { formatBytes, mountArtifact, visibilityWords, type Mounted } from '@superlibrary/embed';
import type { ToolbarItem } from '$kit/Toolbar.svelte';
import {
  ITEM_KIND_WORD, ItemError, UNREACHABLE, askRevokeItem, askRevokeVersion, change, day, embedUrlGetter, explain, kindWords, mayManage, provenanceRows, readItem,
  scopeSetter, shareInfoGetter, shownVersion, versionRows, versionsGetter, type Ask, type Row,
} from '$lib/item';
import { api as sessionApi, session } from '$lib/session.svelte';
import { deleteOnToIso } from '$lib/upload';
import { specRows, timelineOf } from '$lib/record';
import { look } from '$lib/vibe/appearance.svelte';
import { makerOf, type Maker } from '$lib/vibe/faces';

type Api = (path: string, init?: RequestInit) => Promise<Response>;
export type ItemPhase = 'loading' | 'ok' | 'expired' | 'refused';
export type Pending = Ask & { opener: HTMLElement | null; run: (reason: string) => Promise<string | null> };
export { UNREACHABLE };

/** Tomorrow in the person's own time zone (iOS's date picker does not enforce `min`). */
export function tomorrowLocal(now: Date = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** An attachment that records its element; a new element attached before the old one detaches is not cleared by it. */
const anchor = (get: () => HTMLElement | null, set: (el: HTMLElement | null) => void): Attachment<HTMLElement> => (el) => { set(el); return () => { if (get() === el) set(null); }; };

/** The item page's data and actions (spec §5.2): what ItemView.svelte held, so every vibe's layout can draw it. */
export class ItemModel {
  phase = $state<ItemPhase>('loading');
  refusal = $state('');
  item = $state<ItemSummary | null>(null);
  versions = $state<VersionSummary[]>([]);
  /** The version the viewer shows: the route's, then the person's choice; undefined is the newest live one. */
  shown = $state<number | undefined>(undefined);
  frameError = $state<string | null>(null);
  record = $state<WorkRecordView | null>(null);
  removed = $state(false);
  notice = $state<string | null>(null);
  copied = $state<string | null>(null);
  expires = $state('');
  expiryError = $state<string | null>(null);
  saving = $state(false);
  pending = $state<Pending | null>(null);
  busy = $state(false);
  dialogError = $state<string | null>(null);
  /** The route's Toast binds this; focus goes there when a dialog's opener is gone. */
  noticeEl = $state.raw<HTMLElement | null>(null);
  readonly tomorrow = tomorrowLocal();

  readonly #props: () => { itemId: string; version?: number };
  readonly #api: Api;
  #frame = $state.raw<HTMLElement | null>(null);
  /** Bumped to mount the viewer again (after a version is revoked, or on Try again). */
  #mountKey = $state(0);
  #mounted: Mounted | null = null;
  #loads = 0;
  #refusalEl: HTMLElement | null = null;
  #removedEl: HTMLElement | null = null;

  readonly itemId = $derived.by(() => this.#props().itemId);
  readonly me = $derived(session.me);
  readonly manage = $derived(this.item !== null && this.me !== null && mayManage(this.me, this.item));
  readonly current = $derived(shownVersion(this.versions, this.shown));
  readonly latestLive = $derived(this.versions.find((v) => !v.revokedAt)?.version);
  readonly canRetryRefusal = $derived(this.refusal === UNREACHABLE);
  readonly showLatestOffer = $derived(this.shown !== undefined && this.latestLive !== undefined && this.shown !== this.latestLive);
  readonly details: Row[] = $derived(this.current ? versionRows(this.current) : []);
  readonly detailsHeading = $derived(`Details${this.current ? ` · version ${this.current.version}` : ''}`);
  readonly provenance: Row[] = $derived(this.item ? provenanceRows(this.item, this.me) : []);
  readonly visibility = $derived(this.item ? visibilityWords({ scope: this.item.scope, canWiden: false, boardVisible: this.item.audience === 'board' }) : '');
  readonly versionWords = $derived(this.current ? `v${this.current.version}${this.current.version === this.latestLive ? ' (latest)' : ''}` : null);
  readonly deleteWords = $derived(this.item?.expiresAt ? `deleted on ${day(this.item.expiresAt)}` : null);
  readonly maker: Maker | null = $derived(this.item ? makerOf(this.item.source, this.item.createdBy) : null);
  readonly createdByWords = $derived(this.provenance[0]?.value ?? '');
  /** `kindWords(view)` in item.ts is a file type's name; this is what the item is. */
  readonly kindLabel = $derived(this.item ? ITEM_KIND_WORD[this.item.kind] : '');
  readonly headerActions: ToolbarItem[] = $derived(this.manage && this.item?.kind === 'artifact' ? [{ label: 'Upload a new version', icon: 'upload', href: `/upload?item=${this.itemId}`, primary: true }] : []);
  readonly expiryHeading = $derived(this.item?.expiresAt ? `To be deleted on ${day(this.item.expiresAt)}` : 'Delete on a date');
  readonly tabTitle = $derived(this.item ? this.item.title : this.phase === 'expired' ? 'Expired' : 'Item');
  /** Work records: whether there is a spec to show, and how many timeline entries (summaries and tiles). */
  readonly hasSpec = $derived(this.record ? specRows(this.record.record.spec).length > 0 : false);
  /** The closed-state summaries of the enclosures (Paper; reusable), built from data, not from display strings. */
  readonly versionsSummary = $derived(`${this.versions.length} version${this.versions.length === 1 ? '' : 's'}${this.latestLive !== undefined ? ` · v${this.latestLive} latest` : ''}`);
  readonly detailsSummary = $derived(this.current ? `${kindWords(this.current.view)} · ${formatBytes(this.current.totalBytes)}` : '');
  readonly artifactsSummary = $derived(this.record ? `${this.record.artifacts.length} linked` : '');
  readonly entryCount = $derived(this.record ? timelineOf(this.record.record).length : 0);
  readonly timelineSummary = $derived(`${this.entryCount} ${this.entryCount === 1 ? 'entry' : 'entries'}`);
  /** How many related items and collections their sections found (null: still looking, or it failed). */
  relatedCount = $state<number | null>(null);
  collectionCount = $state<number | null>(null);
  readonly relatedSummary = $derived(this.relatedCount === null ? '' : `${this.relatedCount} item${this.relatedCount === 1 ? '' : 's'}`);
  readonly collectionsSummary = $derived(this.collectionCount === null ? '' : `${this.collectionCount} collection${this.collectionCount === 1 ? '' : 's'}`);

  /** Where the viewer mounts. Any layout attaches it: `<div class="viewer" {@attach model.viewer}></div>`. */
  readonly viewer: Attachment<HTMLElement> = (el) => { this.#frame = el; return () => { if (this.#frame === el) this.#frame = null; }; };
  readonly refusalAnchor = anchor(() => this.#refusalEl, (el) => { this.#refusalEl = el; });
  readonly removedAnchor = anchor(() => this.#removedEl, (el) => { this.#removedEl = el; });

  constructor(props: () => { itemId: string; version?: number }, api: Api = sessionApi) {
    this.#props = props;
    this.#api = api;
    // A new item or route version: start again.
    $effect(() => {
      const { itemId, version } = this.#props();
      void itemId;
      untrack(() => { this.shown = version; this.phase = 'loading'; this.notice = null; this.removed = false; this.relatedCount = null; this.collectionCount = null; void this.load(); });
    });
    // A change of theme reaches the open viewer.
    $effect(() => { const t = look.theme; this.#mounted?.setTheme(t); });
    // The app is one more host of the embed (spec §9 of the product spec). A mount still pending when
    // this runs again (or the page goes) is destroyed when it resolves.
    $effect(() => {
      const el = this.#frame;
      void this.#mountKey;
      if (!el || this.phase !== 'ok' || this.item?.kind !== 'artifact') return;
      const id = this.itemId;
      const [v, title] = untrack(() => [this.shown, this.item?.title] as const);
      let live = true;
      let mine: Mounted | null = null;
      this.frameError = null;
      mountArtifact(el, {
        itemId: id, ...(v !== undefined ? { version: v } : {}), ...(title ? { title } : {}), appUrl: window.location.origin, theme: untrack(() => look.theme),
        getEmbedUrl: embedUrlGetter(this.#api), getVersions: versionsGetter(this.#api), getShareInfo: shareInfoGetter(this.#api, () => session.me), setScope: scopeSetter(this.#api),
        onVersionChange: (n) => this.followVersion(n),
        onScopeChange: () => { this.notice = 'Everyone in the workspace can now see it.'; void this.load(); },
      })
        .then((m) => { if (!live) { m.destroy(); return; } mine = m; this.#mounted = m; })
        .catch((e: unknown) => {
          if (!live) return;
          const code = e instanceof ItemError ? e.code : '';
          this.frameError = code === 'revoked' && v !== undefined ? `Version ${v} was revoked.` : code ? explain(code) : 'The viewer could not be loaded.';
        });
      return () => { live = false; mine?.destroy(); if (this.#mounted === mine) this.#mounted = null; };
    });
  }

  async load(): Promise<void> {
    const mine = ++this.#loads;
    const itemId = this.itemId;
    let r: Awaited<ReturnType<typeof readItem>>;
    try { r = await readItem(this.#api, itemId); } catch { r = { state: 'refused', code: 'unreachable' }; }
    if (mine !== this.#loads) return;
    if (r.state === 'ok') {
      this.item = r.item;
      this.versions = r.versions;
      if (r.item.kind === 'work-record') {
        let rec: WorkRecordView | null = null;
        try {
          const res = await this.#api(`/api/v1/items/${itemId}/record`);
          if (res.ok) rec = (await res.json()) as WorkRecordView;
        } catch { /* unreachable, or not JSON: the record could not be loaded */ }
        if (mine !== this.#loads) return;
        this.record = rec;
      } else this.record = null;
      this.phase = 'ok';
      return;
    }
    this.item = null;
    this.versions = [];
    this.phase = r.state;
    this.refusal = r.state === 'refused' ? (r.code === 'unreachable' ? UNREACHABLE : explain(r.code)) : '';
  }

  showUrl = (n: number | undefined) => (n === undefined ? `/a/${this.itemId}` : `/a/${this.itemId}/v/${n}`);
  followVersion(n: number | undefined) { this.shown = n; replaceState(this.showUrl(n), {}); }
  /** A plain click on a version switches the viewer in place; a modified click opens the link as usual. */
  async pick(n: number, e: MouseEvent) {
    if (!this.#mounted || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (await this.#mounted.setVersion(n)) this.followVersion(n);
  }
  showLatest() { this.followVersion(undefined); this.#mountKey++; }
  retryViewer() { this.#mountKey++; }

  async copy(text: string, what: string, el: HTMLElement | null) {
    try { await navigator.clipboard.writeText(text); this.copied = `${what} copied.`; } catch {
      this.copied = `Could not copy. The ${what} is selected; copy it by hand.`;
      if (el) window.getSelection()?.selectAllChildren(el);
    }
  }

  #ask(e: MouseEvent, a: Ask, run: (reason: string) => Promise<string | null>) {
    this.dialogError = null;
    this.pending = { ...a, opener: e.currentTarget instanceof HTMLElement ? e.currentTarget : null, run };
  }
  revokeVersion = (e: MouseEvent, n: number) => this.#ask(e, askRevokeVersion(n), async () => {
    const err = await change(this.#api, `/api/v1/items/${this.itemId}/versions/${n}/revoke`, 'POST', {});
    if (err) return err;
    this.notice = `Version ${n} was revoked.`;
    if (this.current?.version === n) this.followVersion(undefined);
    await this.load();
    this.#mountKey++; // the toolbar's version menu and, if it was shown, the frame
    return null;
  });
  revokeItem = (e: MouseEvent) => this.#ask(e, askRevokeItem(this.item?.title ?? 'this item'), async (reason) => {
    const err = await change(this.#api, `/api/v1/items/${this.itemId}/revoke`, 'POST', reason ? { reason } : {});
    if (err) return err;
    await this.load();
    return null;
  });
  async confirmPending(reason: string) {
    if (!this.pending || this.busy) return;
    this.busy = true;
    this.dialogError = null;
    const err = await this.pending.run(reason);
    this.busy = false;
    if (err) { this.dialogError = err; return; }
    this.pending = null;
    await tick();
    // The control that opened it may be gone (a revoked version has no Revoke button; a revoked item has no page): say what happened there.
    if (document.activeElement === document.body) (this.noticeEl ?? this.#refusalEl)?.focus();
  }
  cancelPending() { if (!this.busy) this.pending = null; }

  async saveExpiry(clear: boolean) {
    this.expiryError = null;
    if (!clear && (!this.expires || Date.parse(deleteOnToIso(this.expires)) <= Date.now())) { this.expiryError = 'Choose a date after today.'; return; }
    this.saving = true;
    const at = clear ? null : deleteOnToIso(this.expires);
    const err = await change(this.#api, `/api/v1/items/${this.itemId}`, 'PATCH', { expiresAt: at });
    this.saving = false;
    if (err) { this.expiryError = err; return; }
    this.expires = '';
    this.notice = at ? `It will be deleted on ${day(at)}.` : 'It will be kept, with no delete date.';
    await this.load();
  }

  dismissNotice() { this.notice = null; }
  /** ModerationPanel's `onchanged`. */
  moderated(n: string) { this.notice = n; void this.load(); }
  /** ModerationPanel's `onremoved`: the heading takes focus. */
  async removedNow() { this.removed = true; await tick(); this.#removedEl?.focus(); }
}
