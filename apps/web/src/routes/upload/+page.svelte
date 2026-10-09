<script lang="ts">
  import { tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { api } from '$lib/session.svelte';
  import {
    deleteOnToIso, describeRefusal, expandZip, filesFromPicker, overrideAndCommit, precheck, secretRefusal, takePicked, uploadFiles,
    type LocalFile, type Refusal, type UploadOutcome,
  } from '$lib/upload';

  let title = $state('');
  let expires = $state('');
  let asFolder = $state(true);
  let files = $state<LocalFile[]>([]);
  let message = $state<string | null>(null);
  let busy = $state(false);
  let progress = $state<string | null>(null);
  let refused = $state<Refusal | null>(null);
  let reason = $state('');
  let secretsHeading = $state<HTMLElement | null>(null);
  const item = page.url.searchParams.get('item') ?? undefined;

  // The earliest delete date: tomorrow, in the person's own time zone.
  const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  const totalBytes = $derived(files.reduce((n, f) => n + f.bytes.length, 0));
  const size = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

  async function picked(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const raw = takePicked(input);
    refused = null;
    reason = '';
    if (raw.length === 0) return;
    let chosen = await filesFromPicker(raw);
    let name = raw.length === 1 ? raw[0]!.name : ((raw[0] as File & { webkitRelativePath?: string }).webkitRelativePath?.split('/')[0] || 'Folder');
    if (asFolder && chosen.length === 1 && chosen[0]!.path.toLowerCase().endsWith('.zip')) {
      const out = expandZip(chosen[0]!.bytes);
      if ('refused' in out) { message = out.refused; files = []; return; }
      chosen = out;
      name = name.replace(/\.zip$/i, '');
    }
    files = chosen;
    message = precheck(files);
    if (!title.trim()) title = name;
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
    const meta = { title: title.trim() || 'Untitled', ...(item ? { item } : {}), ...(expires ? { expiresAt: deleteOnToIso(expires) } : {}) };
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
<h1>{item ? 'Upload a new version' : 'Upload'}</h1>
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
  {#if files.length > 1}
    <details><summary>Show the files</summary><ul class="paths">{#each files.slice(0, 200) as f (f.path)}<li><code>{f.path}</code></li>{/each}{#if files.length > 200}<li>…and {files.length - 200} more</li>{/if}</ul></details>
  {/if}
  {#if message}<p class="error" role="alert">{message}</p>{/if}
  <button class="primary" type="submit" disabled={busy || files.length === 0}>{busy ? (progress ?? 'Uploading…') : 'Upload'}</button>
</form>
{#if refused?.findings}
  <section class="secrets" aria-labelledby="secrets">
    <h2 id="secrets" tabindex="-1" bind:this={secretsHeading}>This looks like it contains a secret</h2>
    <p role="alert">{secretRefusal(refused.findings)}</p>
    <ul>{#each refused.findings as f (`${f.path}:${f.line}:${f.rule}`)}<li><code>{f.path}</code> line {f.line}: {f.rule}</li>{/each}</ul>
    <p>Remove the secret and upload again. If it is not a live secret, say why and upload anyway; your name and reason are recorded.</p>
    <form class="stack" onsubmit={override}>
      <label class="field">Reason <input name="reason" bind:value={reason} required maxlength="500" autocomplete="off" /></label>
      <button type="submit" disabled={busy || reason.trim() === ''}>{busy ? (progress ?? 'Uploading…') : 'Upload anyway'}</button>
    </form>
  </section>
{/if}
