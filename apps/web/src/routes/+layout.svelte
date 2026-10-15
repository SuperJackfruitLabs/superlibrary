<script lang="ts">
  import '@superjackfruit/vibekit/fonts.css';
  import '@superjackfruit/vibekit/vibekit.css';
  import '$lib/vibe/superlibrary.css';
  import '$kit/kit.css';
  import '../app.css';
  import '$lib/layouts/daylight.css';
  import '$lib/layouts/paper.css';
  import '$lib/layouts/studio.css';
  import '$lib/layouts/quiet.css';
  import '$lib/vibe/vibes.css';
  import { onDestroy, onMount, tick } from 'svelte';
  import { afterNavigate, goto, onNavigate } from '$app/navigation';
  import { vkNavigate } from '@superjackfruit/vibekit/motion';
  import { page } from '$app/state';
  import AppHeader from '$lib/AppHeader.svelte';
  import SuiteFooter from '$kit/SuiteFooter.svelte';
  import BootMark from '$lib/BootMark.svelte';
  import { initAppearance } from '$lib/vibe/appearance.svelte';
  import { autoSignIn, signOut, watchSession } from '$lib/auth/org-plane';
  import { currentPlane, devMode, enableUrl, initSession, planeSessionLost, session, UNREACHABLE_BOOT } from '$lib/session.svelte';
  import { REQUEST_TIMEOUT_MS, SLOW_COPY, SLOW_MS, TRY_AGAIN } from '$lib/loading';
  import { loadingStatus } from '$lib/loading.svelte';

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

  /** The boot screen's clock: "Connecting…", the slow line at 8 s, Failed with Try again at 20 s (never forever). */
  let bootSlow = $state(false);
  let starts = 0;
  async function start() {
    const mine = ++starts;
    initializing = true;
    startError = null;
    bootSlow = false;
    const slow = setTimeout(() => { if (mine === starts) bootSlow = true; }, SLOW_MS);
    // A deadline of its own as well as the reads': whatever hangs (discovery, /me, a token refresh), the screen moves on.
    let late: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => { late = setTimeout(() => reject(new Error(UNREACHABLE_BOOT)), REQUEST_TIMEOUT_MS + 500); });
    try {
      await Promise.race([initSession(), deadline]);
    } catch (e) {
      if (mine === starts) startError = e instanceof Error ? e.message : UNREACHABLE_BOOT;
    } finally {
      clearTimeout(slow);
      clearTimeout(late);
      if (mine === starts) { initializing = false; bootSlow = false; }
    }
  }

  // After a client navigation to another page, focus goes to the page's h1 (or main), so a screen
  // reader starts at the new page and Tab starts from the top of it (catch-up S9). A filter change
  // on the same page keeps focus where it is.
  // The page content fades and rises in on a route change (a View Transition where supported, a fade otherwise; nothing under reduced motion).
  onNavigate((n) => { if (n.from?.url.pathname !== n.to?.url.pathname) return vkNavigate(n); });

  afterNavigate(async ({ type, from, to }) => {
    loadingStatus.say('');
    if (type === 'enter' || !from || !to || from.url.pathname === to.url.pathname) return;
    await tick();
    const main = document.getElementById('main');
    if (!main) return;
    const h1 = main.querySelector<HTMLElement>('h1');
    const target = h1 ?? main;
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  });

  onMount(async () => {
    await start();
    stop = watchSession(currentPlane, { onSignedOut: () => planeSessionLost(null) });
  });
  onDestroy(() => { stop?.(); stopAppearance(); });

  // Tokens are memory-only: a new tab, a reload or a 401 leaves none. Go straight to a silent
  // authorize (prompt=none); /login only after an explicit sign-out or a failed attempt (SuperJackfruitLabs/agentpod issue 704).
  $effect(() => {
    if (isPublic || initializing || startError || session.me || session.notEnabled || devMode()) {
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

<!-- Sign-in and its callback never wait on the session (catch-up S1): they render at once. -->
{#if isPublic}
  {@render children()}
{:else if initializing || autoSigningIn}
  <main class="notice sl-boot" aria-busy="true">
    <BootMark />
    <p class="status" role="status">{bootSlow ? SLOW_COPY : 'Connecting…'}</p>
  </main>
{:else if startError}
  <main class="notice sl-boot">
    <BootMark />
    <h1 class="sl-boot-title">Superlibrary</h1>
    <p class="error" role="alert">{startError}</p>
    <button type="button" class="vk-button vk-button--primary" onclick={start}>{TRY_AGAIN}</button>
  </main>
{:else if session.notEnabled}
  <main class="notice">
    <div class="panel sl-needs sl-notice-panel">
      <h1>Superlibrary is not enabled for this workspace</h1>
      {#if enableUrl(session.notEnabled.org)}<p><a href={enableUrl(session.notEnabled.org)}>Enable it</a> (an owner of the workspace can).</p>{/if}
    </div>
  </main>
{:else if session.me}
  <a class="sl-skip" href="#main">Skip to content</a>
  <div class="shell">
    <AppHeader me={session.me} onsignout={logOut} />
    <main id="main" class="vk-page" tabindex="-1">{@render children()}</main>
    <!-- The screen's one polite status line: what is loading (or what a search found); the slow line shows in the skeleton. -->
    <p class="visually-hidden" role="status" data-load-status>{loadingStatus.slow ? SLOW_COPY : loadingStatus.label}</p>
    <SuiteFooter />
  </div>
{:else}
  <main class="notice"><h1 class="sl-boot-title">Superlibrary</h1><p>Not signed in. <a href="/login">Sign in</a></p></main>
{/if}
