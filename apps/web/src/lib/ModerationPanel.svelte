<!-- apps/web/src/lib/ModerationPanel.svelte -->
<script lang="ts">
  import { untrack } from 'svelte';
  import type { ItemSummary } from '@superlibrary/contract';
  import Button from '$kit/Button.svelte';
  import ConfirmDialog from '$kit/ConfirmDialog.svelte';
  import { api } from '$lib/session.svelte';
  import { readItem, type Ask } from '$lib/item';
  import { askRemove, askSupersede, askWiden, parseItemRef, removeItem, setCaption, supersede, widen } from '$lib/moderation';

  let { item, onchanged, onremoved, level = 2 }: { item: ItemSummary; onchanged: (notice: string) => void; onremoved: () => void; level?: 2 | 3 } = $props();

  let caption = $state(untrack(() => item.caption ?? ''));
  let captionError = $state<string | null>(null);
  let savingCaption = $state(false);
  let replacement = $state('');
  let replaceError = $state<string | null>(null);
  let pending = $state<(Ask & { required?: boolean; opener: HTMLElement | null; run: (reason: string) => Promise<string | null> }) | null>(null);
  let busy = $state(false);
  let dialogError = $state<string | null>(null);

  function ask(opener: HTMLElement | null, a: Ask & { required?: boolean }, run: (reason: string) => Promise<string | null>) {
    dialogError = null;
    pending = { ...a, opener, run };
  }
  async function accept(reason: string) {
    if (!pending || busy) return;
    busy = true;
    dialogError = null;
    const err = await pending.run(reason);
    busy = false;
    if (err) { dialogError = err; return; }
    pending = null;
  }
  async function saveCaption(e: SubmitEvent) {
    e.preventDefault();
    savingCaption = true;
    captionError = await setCaption(api, item.id, caption.trim() || null);
    savingCaption = false;
    if (!captionError) onchanged(caption.trim() ? 'Caption saved.' : 'Caption removed.');
  }
  async function askReplace(e: SubmitEvent) {
    e.preventDefault();
    replaceError = null;
    const opener = e.submitter instanceof HTMLElement ? e.submitter : null;
    const by = parseItemRef(replacement);
    if (!by) { replaceError = 'Paste a Superlibrary link or an item id (itm_…).'; return; }
    if (by === item.id) { replaceError = 'An item cannot replace itself.'; return; }
    const r = await readItem(api, by).catch(() => null);
    if (!r || r.state !== 'ok') { replaceError = 'Nothing here, or you cannot see it.'; return; }
    ask(opener, askSupersede(item.title, r.item.title), async () => {
      const err = await supersede(api, item.id, by);
      if (!err) { replacement = ''; onchanged(`Marked as superseded by “${r.item.title}”.`); }
      return err;
    });
  }
  let undoing = $state(false);
  async function undo() {
    undoing = true;
    const err = await supersede(api, item.id, null);
    undoing = false;
    if (err) replaceError = err;
    else onchanged('No longer marked as superseded.');
  }
</script>

<section class="panel" aria-labelledby="moderate-h">
  <svelte:element this={`h${level}`} id="moderate-h">Moderate</svelte:element>
  {#if item.kind === 'artifact'}
    <form class="stack" onsubmit={saveCaption}>
      <label class="field">Caption <textarea rows="2" maxlength="2000" bind:value={caption} disabled={savingCaption}></textarea></label>
      <p class="muted hint">Shown with the item and used by search. Most useful for images.</p>
      {#if captionError}<p class="error" role="alert">{captionError}</p>{/if}
      <div class="actions"><button type="submit" disabled={savingCaption}>Save caption</button></div>
    </form>
  {/if}
  {#if item.supersededBy}
    <p>Superseded by <a href={`/a/${item.supersededBy}`}>the item that replaced it</a>.</p>
    {#if replaceError}<p class="error" role="alert">{replaceError}</p>{/if}
    <div class="actions"><button type="button" disabled={undoing} onclick={undo}>Undo superseded</button></div>
  {:else}
    <form class="stack" novalidate onsubmit={askReplace}>
      <label class="field">Replaced by <input name="replacement" placeholder="A Superlibrary link, or itm_…" bind:value={replacement} /></label>
      {#if replaceError}<p class="error" role="alert">{replaceError}</p>{/if}
      <div class="actions"><button type="submit" disabled={!replacement.trim()}>Mark as superseded</button></div>
    </form>
  {/if}
  {#if item.kind === 'work-record' && item.scope !== 'workspace'}
    <div class="actions">
      <button type="button" onclick={(e) => ask(e.currentTarget, askWiden(item.title), async () => {
        const err = await widen(api, item.id);
        if (!err) onchanged('Everyone in the workspace can now see it.');
        return err;
      })}>Show to everyone in the workspace</button>
    </div>
  {/if}
  <div class="actions">
    <Button variant="danger" onclick={(e) => ask(e.currentTarget as HTMLElement, askRemove(item.title, item.kind), async (reason) => {
      const err = await removeItem(api, item.id, reason);
      if (!err) onremoved();
      return err;
    })}>Remove from memory</Button>
  </div>
</section>

{#if pending}
  <ConfirmDialog title={pending.title} message={pending.message} action={pending.action} reason={pending.reason ?? false} reasonRequired={pending.required ?? false}
    {busy} error={dialogError} opener={pending.opener} onconfirm={accept} oncancel={() => { if (!busy) pending = null; }} />
{/if}
