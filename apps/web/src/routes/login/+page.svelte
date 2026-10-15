<script lang="ts">
  import { Sky } from '@superjackfruit/vibekit';
  import { look } from '$lib/vibe/appearance.svelte';
  import Mark from '$lib/Mark.svelte';
  import { beginSignIn } from '$lib/auth/org-plane';
  import { planeReady } from '$lib/session.svelte';
  let error = $state<string | null>(null);
  async function signIn() {
    const p = await planeReady();
    if (!p) { error = 'This deployment has no sign-in service configured.'; return; }
    try { await beginSignIn(p, { returnTo: '/' }); } catch (e) { error = e instanceof Error ? e.message : 'Sign-in failed.'; }
  }
</script>

<svelte:head><title>Sign in · Superlibrary</title></svelte:head>
<main class="notice">
  <Sky phase={look.phase}>
    <div class="sl-signin sl-sky-surface">
      <Mark class="mark-hero" />
      <h1>Superlibrary</h1>
      <p>Sign in with your Super Jackfruit Labs account.</p>
      <button type="button" onclick={signIn}>Sign in</button>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
    </div>
  </Sky>
</main>
