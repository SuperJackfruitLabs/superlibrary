<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { api } from '$lib/session.svelte';
  import {
    deleteOnToIso, describeRefusal, leftOutSentence, overrideAndCommit, precheck, secretRefusal, selectFiles, takePicked, uploadFiles,
    type LeftOut, type LocalFile, type Refusal, type UploadOutcome,
  } from '$lib/upload';
  import { readItem } from '$lib/item';
  import { visibilityWords } from '@superlibrary/embed';

  let title = $state('');
  let expires = $state('');
  let asFolder = $state(true);
  let files = $state<LocalFile[]>([]);
  let leftOut = $state<LeftOut[]>([]);
  let message = $state<string | null>(null);
  let busy = $state(false);
  let progress = $state<string | null>(null);
  let refused = $state<Refusal | null>(null);
  let reason = $state('');
  let secretsHeading = $state<HTMLElement | null>(null);
  const item = page.url.searchParams.get('item') ?? undefined;
  /** The item a new version is for, read so the version keeps its title (the API sets the title on n+1). */
  let itemTitle = $state<string | null>(null);
  let itemSeenBy = $state<string | null>(null);

  onMount(async () => {
    if (!item) return;
    try {
      const r = await readItem(api, item);
      if (r.state === 'ok') {
        itemTitle = r.item.title;
        itemSeenBy = visibilityWords({ scope: r.item.scope, canWiden: false });
        if (!title.trim()) title = r.item.title;
      } else message = r.state === 'expired' ? 'That item has expired. Choose a new delete date to upload a new version.' : 'That item does not exist, or you cannot change it.';
    } catch {
      message = 'The item could not be read. Check your connection and try again.';
    }
  });

  // The earliest delete date: tomorrow, in the person's own time zone.
  const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  const totalBytes = $derived(files.reduce((n, f) => n + f.bytes.length, 0));
  const size = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

  async function picked(e: Event) {
    const raw = takePicked(e.currentTarget as HTMLInputElement);
    refused = null;
    reason = '';
    if (raw.length === 0) return;
    const out = await selectFiles(raw, { expandZips: asFolder });
    if ('refused' in out) { message = out.refused; files = []; leftOut = []; return; }
    files = out.files;
    leftOut = out.leftOut;
    message = precheck(files);
    // A new version keeps its item's title unless the person types another.
    if (!item && !title.trim()) title = out.name || 'Files';
  }

  async function finish(out: UploadOutcome) {
    busy = false;
    progress = null;
    if (out.ok) { await goto(`/a/${out.result.itemId}`); return; }
    if (out.error === 'secret_found' && out.uploadId && out.findings?.length) {
      refused = out;
      message = null;
      // Below the form at phone width: bring it into view and put the screen reader there.
      await tick();
      secretsHeading?.focus();
      return;
    }
    refused = null;
    message = describeRefusal(out);
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    const problem = precheck(files);
    if (problem) { message = problem; return; }
    busy = true;
    message = null;
    refused = null;
    progress = 'Preparing…';
    const meta = { title: title.trim() || itemTitle || 'Untitled', ...(item ? { item } : {}), ...(expires ? { expiresAt: deleteOnToIso(expires) } : {}) };
    try {
      await finish(await uploadFiles(api, files, meta, { onProgress: (n, of) => { progress = n === of ? 'Finishing…' : `Sending ${n + 1} of ${of}…`; } }));
    } catch {
      busy = false;
      progress = null;
      message = 'The upload stopped: the connection was lost. Upload again.';
    }
  }

  async function override(e: SubmitEvent) {
    e.preventDefault();
    if (!refused?.uploadId || reason.trim() === '') return;
    busy = true;
    progress = 'Finishing…';
    try {
      await finish(await overrideAndCommit(api, refused.uploadId, reason.trim(), files));
    } catch {
      busy = false;
      progress = null;
      message = 'The connection was lost before the upload finished. Try again.';
    }
  }
</script>

<svelte:head><title>{item ? 'New version' : 'Upload'} · Superlibrary</title></svelte:head>
<h1>{item ? (itemTitle ? `Upload a new version of ${itemTitle}` : 'Upload a new version') : 'Upload'}</h1>
<!-- A new upload is a workspace item, and phase 1 refuses narrowing, so this is always true of it. -->
{#if !item}<p class="muted">Everyone in the workspace will be able to see it.</p>{:else if itemSeenBy}<p class="muted">Who will see the new version: {itemSeenBy}.</p>{/if}
<form class="stack" onsubmit={submit}>
  <label class="field">Title <input name="title" bind:value={title} required maxlength="200" autocomplete="off" /></label>
  <div class="pickers">
    <label class="field">Files <input name="files" type="file" multiple onchange={picked} disabled={busy} /></label>
    <label class="field">Folder <input name="folder" type="file" webkitdirectory onchange={picked} disabled={busy} /></label>
  </div>
  <label class="check"><input type="checkbox" bind:checked={asFolder} /> Upload a .zip as the folder inside it</label>
  <p class="muted hint">On iPhone and iPad, choose a .zip to upload a folder.</p>
  <label class="field">Delete on (optional) <input name="expires" type="date" min={tomorrow} bind:value={expires} /></label>
  <p class="muted" aria-live="polite">{files.length} file{files.length === 1 ? '' : 's'} chosen{files.length ? `, ${size(totalBytes)}` : ''}.</p>
  {#if leftOut.length}
    <div class="notice-line" role="status">
      {#if leftOut.length <= 3}
        <p>{leftOutSentence(leftOut)}</p>
      {:else}
        <p>These {leftOut.length} files are left out:</p>
        <ul class="paths">{#each leftOut.slice(0, 200) as l (l.path)}<li><code>{l.path}</code> (the {l.rule} rule)</li>{/each}{#if leftOut.length > 200}<li>…and {leftOut.length - 200} more</li>{/if}</ul>
      {/if}
      <p class="muted">They match the rules for private files, so they are never uploaded. The rest uploads as usual.</p>
    </div>
  {/if}
  {#if files.length > 1}
    <details><summary>Show the files</summary><ul class="paths">{#each files.slice(0, 200) as f (f.path)}<li><code>{f.path}</code></li>{/each}{#if files.length > 200}<li>…and {files.length - 200} more</li>{/if}</ul></details>
  {/if}
  {#if message}<p class="error" role="alert">{message}</p>{/if}
  <button class="vk-button vk-button--primary kit-button kit-button--primary" type="submit" aria-busy={busy} disabled={busy || files.length === 0}>{busy ? (progress ?? 'Uploading…') : 'Upload'}</button>
</form>
{#if refused?.findings}
  <section class="secrets" aria-labelledby="secrets">
    <h2 id="secrets" tabindex="-1" bind:this={secretsHeading}>This looks like it contains a secret</h2>
    <p role="alert">{secretRefusal(refused.findings)}</p>
    <ul>{#each refused.findings as f (`${f.path}:${f.line}:${f.rule}`)}<li><code>{f.path}</code> line {f.line}: {f.rule}</li>{/each}</ul>
    <p>Remove the secret and upload again. If it is not a live secret, say why and upload anyway; your name and reason are recorded.</p>
    <form class="stack" onsubmit={override}>
      <label class="field">Reason <input name="reason" bind:value={reason} required maxlength="500" autocomplete="off" /></label>
      <button class="vk-button vk-button--secondary kit-button kit-button--secondary" type="submit" aria-busy={busy} disabled={busy || reason.trim() === ''}>{busy ? (progress ?? 'Uploading…') : 'Upload anyway'}</button>
    </form>
  </section>
{/if}
