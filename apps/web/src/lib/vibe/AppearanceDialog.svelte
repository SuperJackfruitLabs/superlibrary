<script lang="ts">
  import { untrack } from 'svelte';
  import { Segmented, VIBES } from '@superjackfruit/vibekit';
  import { holdModal } from '$kit/modal';
  import { chooseLocation, chooseStrength, chooseTheme, chooseVibe, look } from './appearance.svelte';
  import { VIBE_WORDS } from './copy';

  let { opener = null, onclose }: { opener?: HTMLElement | null; onclose: () => void } = $props();
  let dialog = $state<HTMLElement | null>(null);
  let locationNote = $state<string | null>(null);

  $effect(() => { if (!dialog) return; return holdModal(dialog, onclose, untrack(() => opener)); });

  async function location(e: Event) {
    const box = e.currentTarget as HTMLInputElement;
    const on = box.checked;
    const ok = await chooseLocation(on);
    // Svelte will not rewrite `checked` when the model stays false, so the box follows the outcome.
    box.checked = look.appearance.useLocation;
    locationNote = on && !ok && !look.appearance.useLocation ? 'Location was not shared, so your time zone is used.' : null;
  }
</script>

<div class="modal-backdrop">
  <div class="modal sl-appearance" role="dialog" aria-modal="true" aria-labelledby="appearance-h" bind:this={dialog}>
    <h2 id="appearance-h">Appearance</h2>
    <fieldset class="sl-vibes">
      <legend>Vibe</legend>
      {#each VIBES as v (v)}
        <label class="sl-vibe-card">
          <input type="radio" name="vibe" value={v} checked={look.appearance.vibe === v} data-autofocus={look.appearance.vibe === v ? '' : undefined} onchange={() => chooseVibe(v)} />
          <span class="sl-vibe-text"><span class="sl-vibe-name">{VIBE_WORDS[v].name}</span><span class="sl-vibe-feel">{VIBE_WORDS[v].feel}</span></span>
          <span class="sl-vibe-sample" data-vibe={v} data-theme={look.theme} aria-hidden="true"><span></span><span></span><span></span></span>
        </label>
      {/each}
    </fieldset>
    <div class="sl-setting">
      <p class="sl-setting-label">Light or dark</p>
      <Segmented label="Light or dark" options={[{ value: 'sun', label: 'Follow the sun' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} bind:value={() => look.appearance.theme, chooseTheme} />
      <p class="muted sl-setting-hint">Follow the sun: light by day, dark after dusk.</p>
    </div>
    <div class="sl-setting">
      <p class="sl-setting-label">Time of day</p>
      <Segmented label="Time of day" options={[{ value: 'strong', label: 'Strong' }, { value: 'subtle', label: 'Subtle' }, { value: 'off', label: 'Off' }]} bind:value={() => look.appearance.timeStrength, chooseStrength} />
      <p class="muted sl-setting-hint">How much the time of day shows. Quiet starts with Off.</p>
    </div>
    <label class="check"><input type="checkbox" checked={look.appearance.useLocation} onchange={location} /> Use my location for the sun</label>
    <p class="muted sl-setting-hint" role="status">{locationNote ?? 'A rough location that never leaves this device. Without it, the day runs 6:00 to 18:00 in your time zone.'}</p>
    <p class="muted">Saved in this browser for Superlibrary.</p>
    <div class="modal-actions"><button type="button" class="kit-button kit-button--primary" onclick={onclose}>Done</button></div>
  </div>
</div>
