<script lang="ts">
  import '@superjackfruit/vibekit/fonts.css';
  import '@superjackfruit/vibekit/vibekit.css';
  import '$lib/vibe/superlibrary.css';
  import '$kit/kit.css';
  import '../app.css';
  import '$lib/layouts/daylight.css';
  import '$lib/layouts/paper.css';
  import '$lib/vibe/vibes.css';
  import { onDestroy, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import AppHeader from '$lib/AppHeader.svelte';
  import SuiteFooter from '$kit/SuiteFooter.svelte';
  import { initAppearance } from '$lib/vibe/appearance.svelte';
  import { autoSignIn, signOut, watchSession } from '$lib/auth/org-plane';
  import { currentPlane, devMode, enableUrl, initSession, planeSessionLost, session } from '$lib/session.svelte';

  let { children } = $props();
  // Before any child renders: the cookie, the old theme's migration, and the real phase (spec §4.3).
  const stopAppearance = initAppearance();
  let initializing = $state(true);
  let autoSigningIn = $state(false);
  /** Why the session could not be started; shown with a retry, never as an endless "Connecting…". */
  let startError = $state<string | null>(null);
  const publicRoutes = ['/login', '/auth/callback'];
  let isPublic = $derived(publicRoutes.some((r) => page.url.pathname.startsWith(r)));
  let stop: (() => void) | undefined;

  async function start() {
    initializing = true;
    startError = null;
    try {
      await initSession();
    } catch (e) {
      startError = e instanceof Error ? e.message : 'Superlibrary could not start.';
    } finally {
      initializing = false;
    }
  }

  onMount(async () => {
    await start();
    stop = watchSession(currentPlane, { onSignedOut: () => planeSessionLost(null) });
  });
  onDestroy(() => { stop?.(); stopAppearance(); });

  // Tokens are memory-only: a new tab, a reload or a 401 leaves none. Go straight to a silent
  // authorize (prompt=none); /login only after an explicit sign-out or a failed attempt (SuperJackfruitLabs/agentpod issue 704).
  $effect(() => {
    if (initializing || startError || isPublic || session.me || session.notEnabled || devMode()) {
      autoSigningIn = false;
      return;
    }
    const started = autoSignIn(currentPlane(), `${page.url.pathname}${page.url.search}`, {
      onError: () => { autoSigningIn = false; goto('/login'); },
    });
    autoSigningIn = started;
    if (!started) goto('/login');
  });

  async function logOut() {
    await signOut(currentPlane());
    session.me = null;
    await goto('/login');
  }
</script>

<!-- The notice replaces the page, so it names the tab itself (or the last page's title stays). -->
<svelte:head>{#if session.notEnabled}<title>Not enabled · Superlibrary</title>{/if}</svelte:head>

{#if initializing || autoSigningIn}
  <p class="status" role="status">Connecting…</p>
{:else if isPublic}
  {@render children()}
{:else if startError}
  <main class="notice">
    <p class="error" role="alert">{startError}</p>
    <button type="button" onclick={start}>Try again</button>
  </main>
{:else if session.notEnabled}
  <main class="notice">
    <div class="panel sl-needs sl-notice-panel">
      <h1>Superlibrary is not enabled for this workspace</h1>
      {#if enableUrl(session.notEnabled.org)}<p><a href={enableUrl(session.notEnabled.org)}>Enable it</a> (an owner of the workspace can).</p>{/if}
    </div>
  </main>
{:else if session.me}
  <div class="shell">
    <AppHeader me={session.me} onsignout={logOut} />
    {@render children()}
    <SuiteFooter />
  </div>
{:else}
  <p class="status">Not signed in. <a href="/login">Sign in</a></p>
{/if}
