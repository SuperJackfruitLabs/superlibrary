<script lang="ts">
  import { beginSignIn } from '$lib/auth/org-plane';
  import { currentPlane } from '$lib/session.svelte';
  let error = $state<string | null>(null);
  async function signIn() {
    const p = currentPlane();
    if (!p) { error = 'This deployment has no sign-in service configured.'; return; }
    try { await beginSignIn(p, { returnTo: '/' }); } catch (e) { error = e instanceof Error ? e.message : 'Sign-in failed.'; }
  }
</script>

<svelte:head><title>Sign in · Superlibrary</title></svelte:head>
<main class="notice">
  <h1>Superlibrary</h1>
  <p>Sign in with your Super Jackfruit Labs account.</p>
  <button type="button" onclick={signIn}>Sign in</button>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</main>
