<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { replaceState } from '$app/navigation';
  import type { ItemSummary, VersionSummary } from '@superlibrary/contract';
  import { formatBytes, mountArtifact, type Mounted } from '@superlibrary/embed';
  import { api, session } from '$lib/session.svelte';
  import { deleteOnToIso } from '$lib/upload';
  import ConfirmDialog from '$kit/ConfirmDialog.svelte';
  import Toast from '$kit/Toast.svelte';
  import type { WorkRecordView as RecordView } from '@superlibrary/contract';
  import ItemHeader from '$lib/ItemHeader.svelte';
  import WorkRecordView from '$lib/WorkRecordView.svelte';
  import RelatedList from '$lib/RelatedList.svelte';
  import { themeState } from '$kit/theme.svelte';
  import {
    ItemError, askRevokeItem, askRevokeVersion, change, day, embedUrlGetter, explain, mayManage, provenanceRows, readItem,
    scopeSetter, shareInfoGetter, shownVersion, versionRows, versionsGetter, when, type Ask,
  } from '$lib/item';

  let { itemId, version }: { itemId: string; version?: number } = $props();

  let phase = $state<'loading' | 'ok' | 'expired' | 'refused'>('loading');
  let refusal = $state('');
  let item = $state<ItemSummary | null>(null);
  let versions = $state<VersionSummary[]>([]);
  /** The version the viewer shows: the route's, then the person's choice; undefined is the newest live one. */
  let shown = $state<number | undefined>(undefined);
  let frame = $state<HTMLElement | null>(null);
  let frameError = $state<string | null>(null);
  let mounted: Mounted | null = null;
  // A change in the account menu reaches the open viewer.
  $effect(() => { const t = themeState.value; mounted?.setTheme(t); });
  /** Bumped to mount the viewer again (after a version is revoked, or on Try again). */
  let mountKey = $state(0);
  let record = $state<RecordView | null>(null);
  let notice = $state<string | null>(null);
  let noticeEl = $state<HTMLElement | null>(null);
  let refusalEl = $state<HTMLElement | null>(null);
  let copied = $state<string | null>(null);
  let expires = $state('');
  let expiryError = $state<string | null>(null);
  let saving = $state(false);
  let pending = $state<(Ask & { opener: HTMLElement | null; run: (reason: string) => Promise<string | null> }) | null>(null);
  let busy = $state(false);
  let dialogError = $state<string | null>(null);

  const me = $derived(session.me);
  const manage = $derived(item !== null && me !== null && mayManage(me, item));
  const current = $derived(shownVersion(versions, shown));
  const latestLive = $derived(versions.find((v) => !v.revokedAt)?.version);
  // The earliest delete date: tomorrow, in the person's own time zone (iOS's picker does not enforce `min`).
  const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();

  let loads = 0;
  async function load(): Promise<void> {
    const mine = ++loads;
    let r: Awaited<ReturnType<typeof readItem>>;
    try {
      r = await readItem(api, itemId);
    } catch {
      r = { state: 'refused', code: 'unreachable' };
    }
    if (mine !== loads) return;
    if (r.state === 'ok') {
      item = r.item;
      versions = r.versions;
      if (r.item.kind === 'work-record') {
        const res = await api(`/api/v1/items/${itemId}/record`).catch(() => null);
        if (mine !== loads) return;
        record = res?.ok ? ((await res.json()) as RecordView) : null;
      } else record = null;
      phase = 'ok';
      return;
    }
    item = null;
    versions = [];
    phase = r.state;
    refusal = r.state === 'refused' ? (r.code === 'unreachable' ? 'The library could not be reached. Check your connection and try again.' : explain(r.code)) : '';
  }

  // A new item or route version: start again.
  $effect(() => {
    const v = version;
    void itemId;
    untrack(() => { shown = v; phase = 'loading'; notice = null; void load(); });
  });

  const showUrl = (n: number | undefined) => (n === undefined ? `/a/${itemId}` : `/a/${itemId}/v/${n}`);
  const followVersion = (n: number | undefined) => { shown = n; replaceState(showUrl(n), {}); };

  // The app is one more host of the embed (spec §9): mount it once the item is readable. A mount
  // still pending when this runs again (or the page goes) is destroyed when it resolves.
  $effect(() => {
    const el = frame;
    void mountKey;
    if (!el || phase !== 'ok' || item?.kind !== 'artifact') return;
    const id = itemId;
    const [v, title] = untrack(() => [shown, item?.title] as const);
    let live = true;
    let mine: Mounted | null = null;
    frameError = null;
    mountArtifact(el, {
      itemId: id, ...(v !== undefined ? { version: v } : {}), ...(title ? { title } : {}), appUrl: window.location.origin, theme: untrack(() => themeState.value),
      getEmbedUrl: embedUrlGetter(api), getVersions: versionsGetter(api), getShareInfo: shareInfoGetter(api, () => session.me), setScope: scopeSetter(api),
      onVersionChange: (n) => followVersion(n),
      onScopeChange: () => { notice = 'Everyone in the workspace can now see it.'; void load(); },
    })
      .then((m) => { if (!live) { m.destroy(); return; } mine = m; mounted = m; })
      .catch((e: unknown) => {
        if (!live) return;
        const code = e instanceof ItemError ? e.code : '';
        frameError = code === 'revoked' && v !== undefined ? `Version ${v} was revoked.` : code ? explain(code) : 'The viewer could not be loaded.';
      });
    return () => { live = false; mine?.destroy(); if (mounted === mine) mounted = null; };
  });

  /** A plain click on a version switches the viewer in place; a modified click opens the link as usual. */
  async function pick(n: number, e: MouseEvent) {
    if (!mounted || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (await mounted.setVersion(n)) followVersion(n);
  }

  async function copy(text: string, what: string, el: HTMLElement | null) {
    try {
      await navigator.clipboard.writeText(text);
      copied = `${what} copied.`;
    } catch {
      copied = `Could not copy. The ${what} is selected; copy it by hand.`;
      if (el) window.getSelection()?.selectAllChildren(el);
    }
  }

  function ask(e: MouseEvent, a: Ask, run: (reason: string) => Promise<string | null>) {
    dialogError = null;
    pending = { ...a, opener: e.currentTarget instanceof HTMLElement ? e.currentTarget : null, run };
  }
  const revokeVersion = (e: MouseEvent, n: number) => ask(e, askRevokeVersion(n), async () => {
    const err = await change(api, `/api/v1/items/${itemId}/versions/${n}/revoke`, 'POST', {});
    if (err) return err;
    notice = `Version ${n} was revoked.`;
    if (current?.version === n) followVersion(undefined);
    await load();
    mountKey++; // the toolbar's version menu and, if it was shown, the frame
    return null;
  });
  const revokeItem = (e: MouseEvent) => ask(e, askRevokeItem(item?.title ?? 'this item'), async (reason) => {
    const err = await change(api, `/api/v1/items/${itemId}/revoke`, 'POST', reason ? { reason } : {});
    if (err) return err;
    await load();
    return null;
  });
  async function confirmPending(reason: string) {
    if (!pending || busy) return;
    busy = true;
    dialogError = null;
    const err = await pending.run(reason);
    busy = false;
    if (err) { dialogError = err; return; }
    pending = null;
    await tick();
    // The control that opened it may be gone (a revoked version has no Revoke button, a revoked item
    // has no page): say what happened there.
    if (document.activeElement === document.body) (noticeEl ?? refusalEl)?.focus();
  }

  async function saveExpiry(clear: boolean) {
    expiryError = null;
    if (!clear && (!expires || Date.parse(deleteOnToIso(expires)) <= Date.now())) { expiryError = 'Choose a date after today.'; return; }
    saving = true;
    const at = clear ? null : deleteOnToIso(expires);
    const err = await change(api, `/api/v1/items/${itemId}`, 'PATCH', { expiresAt: at });
    saving = false;
    if (err) { expiryError = err; return; }
    expires = '';
    notice = at ? `It will be deleted on ${day(at)}.` : 'It will be kept, with no delete date.';
    await load();
  }
</script>

<svelte:head><title>{item ? item.title : phase === 'expired' ? 'Expired' : 'Item'} · Superlibrary</title></svelte:head>

{#snippet expiryForm(heading: string)}
  <!-- novalidate: the page says why in words, the same on every browser (iOS does not enforce min). -->
  <form class="stack" novalidate onsubmit={(e) => { e.preventDefault(); void saveExpiry(false); }}>
    <h2>{heading}</h2>
    <label class="field">Delete on <input name="expires" type="date" min={tomorrow} bind:value={expires} disabled={saving} /></label>
    {#if expiryError}<p class="error" role="alert">{expiryError}</p>{/if}
    <div class="actions">
      <button type="submit" disabled={saving || !expires}>Set the delete date</button>
      {#if item?.expiresAt || phase === 'expired'}<button type="button" disabled={saving} onclick={() => saveExpiry(true)}>Keep it (no delete date)</button>{/if}
    </div>
  </form>
{/snippet}

{#if notice}<Toast message={notice} onclose={() => (notice = null)} bind:el={noticeEl} />{/if}

{#if phase === 'loading'}
  <p class="muted" role="status">Loading…</p>
{:else if phase === 'expired'}
  <h1>This has expired</h1>
  <p>It is no longer shown to anyone, and it will be deleted soon. The person who uploaded it, or an owner of the workspace, can keep it by choosing a new delete date or none.</p>
  <div class="panel">{@render expiryForm('Keep it')}</div>
  <p><a href="/">Back to the library</a></p>
{:else if phase === 'refused'}
  <p class="error" role="alert" tabindex="-1" bind:this={refusalEl}>{refusal}</p>
  <div class="actions"><a class="button" href="/">Back to the library</a>{#if refusal.startsWith('The library could not')}<button type="button" onclick={load}>Try again</button>{/if}</div>
{:else if item}
  <ItemHeader {item} version={current?.version} latest={latestLive}
    actions={manage && item.kind === 'artifact' ? [{ label: 'Upload a new version', icon: 'upload', href: `/upload?item=${itemId}`, primary: true }] : []} />

  {#if item.kind === 'artifact'}
  <div class="viewer" bind:this={frame}></div>
  {#if frameError}
    <div class="frame-error">
      <p class="error" role="alert">{frameError}</p>
      <div class="actions">
        {#if shown !== undefined && latestLive !== undefined && shown !== latestLive}<a class="button" href={showUrl(undefined)} onclick={(e) => { e.preventDefault(); followVersion(undefined); mountKey++; }}>Show the latest version</a>{/if}
        <button type="button" onclick={() => mountKey++}>Try again</button>
      </div>
    </div>
  {/if}

  <div class="item-grid">
    <section aria-labelledby="versions-h">
      <h2 id="versions-h">Versions</h2>
      <ul class="versions">
        {#each versions as v (v.version)}
          <li class:current={current?.version === v.version}>
            <div class="vline">
              {#if v.revokedAt}
                <span class="vname">v{v.version}</span>
              {:else}
                <a class="vname" href={showUrl(v.version)} aria-current={current?.version === v.version ? 'true' : undefined} onclick={(e) => pick(v.version, e)}>v{v.version}</a>
              {/if}
              <small class="muted">{when(v.createdAt)} · {formatBytes(v.totalBytes)} · {v.fileCount} file{v.fileCount === 1 ? '' : 's'}</small>
              <span class="badges">
                {#if current?.version === v.version}<span class="badge">Shown</span>{/if}
                {#if v.version === latestLive}<span class="badge">Latest</span>{/if}
                {#if v.revokedAt}<span class="badge danger-text">Revoked</span>{/if}
                {#if v.scanOverride}<span class="badge">Secret scan overridden</span>{/if}
              </span>
            </div>
            {#if manage && !v.revokedAt}
              <button type="button" class="danger-outline" onclick={(e) => revokeVersion(e, v.version)}>Revoke<span class="visually-hidden"> version {v.version}</span></button>
            {/if}
          </li>
        {/each}
      </ul>
    </section>

    <section class="panel" aria-labelledby="details-h">
      <h2 id="details-h">Details{current ? ` · version ${current.version}` : ''}</h2>
      {#if current}
        <dl class="rows">
          <dt>Item</dt><dd>{item.kind === 'artifact' ? 'Artifact' : 'Work record'}</dd>
          {#each versionRows(current) as r (r.label)}
            <dt>{r.label}</dt>
            <dd>
              {#if r.copy}
                <code class="hash" id={`row-${r.label}`}>{r.value}</code>
                {#if r.note}<small class="muted"> ({r.note})</small>{/if}
                <button type="button" class="copy" onclick={() => copy(r.value, r.label, document.getElementById(`row-${r.label}`))}>Copy<span class="visually-hidden"> {r.label}</span></button>
              {:else if r.mono}<code>{r.value}</code>{:else}{r.value}{/if}
            </dd>
          {/each}
        </dl>
        <p class="muted" role="status">{copied ?? ''}</p>
      {:else}
        <p class="muted">No version of this item can be viewed.</p>
      {/if}
    </section>
  </div>
  {:else if record}
    <WorkRecordView view={record} />
  {:else}
    <p class="muted">The record could not be loaded.</p>
  {/if}

  <section aria-labelledby="provenance-h">
    <h2 id="provenance-h">Provenance</h2>
    <dl class="rows">
      {#each provenanceRows(item, me) as r (r.label)}
        <dt>{r.label}</dt><dd>{#if r.mono}<code>{r.value}</code>{:else}{r.value}{/if}</dd>
      {/each}
    </dl>
  </section>

  <RelatedList {itemId} />

  {#if manage}
    <section class="manage" aria-labelledby="manage-h">
      <h2 id="manage-h" class="visually-hidden">Manage</h2>
      <div class="panel">{@render expiryForm(item.expiresAt ? `To be deleted on ${day(item.expiresAt)}` : 'Delete on a date')}</div>
      <div class="panel">
        <h2>Revoke</h2>
        <p class="muted">Nobody will be able to view it again. The record of it stays.</p>
        <button type="button" class="danger" onclick={revokeItem}>Revoke this item</button>
      </div>
    </section>
  {/if}
{/if}

{#if pending}
  <ConfirmDialog title={pending.title} message={pending.message} action={pending.action} reason={pending.reason ?? false} {busy} error={dialogError} opener={pending.opener}
    onconfirm={confirmPending} oncancel={() => { if (!busy) pending = null; }} />
{/if}
