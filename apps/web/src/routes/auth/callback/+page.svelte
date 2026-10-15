<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { beginSignIn, completeSignIn, suppressAutoSignIn } from '$lib/auth/org-plane';
  import { currentPlane, initSession, planeReady, refreshMe, session } from '$lib/session.svelte';
  import { safeReturnTo } from '$lib/return-to';

  let message = $state('Signing you in…');
  let failed = $state(false);

  onMount(async () => {
    try {
      if (!(await planeReady())) await initSession();
      const p = currentPlane();
      if (!p) { failed = true; message = 'This deployment has no sign-in service configured.'; return; }
      const { returnTo, interactive } = await completeSignIn(new URLSearchParams(window.location.search), p);
      if (interactive) {
        // The silent authorize found no plane session: ask again, and let the plane show its page.
        message = 'Taking you to sign in…';
        await beginSignIn(p, { returnTo });
        return;
      }
      await refreshMe();
      if (!session.me && !session.notEnabled) {
        // The API refused the new token: going on would loop through the plane. Stop here.
        suppressAutoSignIn();
        failed = true;
        message = 'Superlibrary did not accept the sign-in.';
        return;
      }
      await goto(safeReturnTo(returnTo), { replaceState: true });
    } catch (err) {
      failed = true;
      message = err instanceof Error ? err.message : 'Sign-in failed.';
    }
  });
</script>

<svelte:head><title>Signing in · Superlibrary</title></svelte:head>
<main class="notice">
  <p role={failed ? 'alert' : 'status'} class={failed ? 'error' : ''}>{message}</p>
  {#if failed}<a href="/login">Back to sign-in</a>{/if}
</main>
