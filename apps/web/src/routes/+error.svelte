<script lang="ts">
  /**
   * An address that is not a page (404), or a page that threw, inside the vibe's own shell (the
   * layout draws the header and footer around it) with an h1 and a way home (catch-up S7). Never
   * SvelteKit's bare "404 Not Found".
   */
  import { page } from '$app/state';
  import Button from '$kit/Button.svelte';

  const missing = $derived(page.status === 404);
</script>

<svelte:head><title>{missing ? 'Not found' : 'Something went wrong'} · Superlibrary</title></svelte:head>

<section class="sl-error-page" data-error-status={page.status}>
  <p class="muted sl-eyebrow">{missing ? 'Not found' : 'Something went wrong'}</p>
  <h1>{missing ? "This page isn't here." : "This page couldn't be shown."}</h1>
  <p>{missing ? 'The address may be mistyped, or the page has moved.' : 'Your library is safe. Going back to it usually helps.'}</p>
  <p><Button variant="primary" href="/">Back to the library</Button></p>
</section>
