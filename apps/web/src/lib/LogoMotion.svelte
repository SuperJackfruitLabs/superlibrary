<script lang="ts">
  /**
   * The large Superlibrary mark (64 px and up: the pack's full translucent artwork) with the pack's
   * approved animation (static/brand/README.md).
   *
   * `playIntro` plays it once, on the first loading screen of the page session, never again and
   * never on a route change. Nothing plays when the person asked for less motion (the OS setting or
   * `data-motion="reduce"`) or in Quiet, whose rule is no motion at all: the mark then sits at rest.
   * The header's compact mark is Mark.svelte and never animates. Decorative unless `label` is given.
   */
  import { onMount } from 'svelte';
  import { claimIntro, loadLogoMotion, motionReduced, type LogoMotionInstance } from '$lib/logo-motion';
  import { look } from '$lib/vibe/appearance.svelte';

  let { size = 72, playIntro = false, label, class: className = '' }: { size?: number; playIntro?: boolean; label?: string; class?: string } = $props();

  let el: HTMLSpanElement;
  let logo: LogoMotionInstance | undefined;
  const still = () => motionReduced(el) || look.appearance.vibe === 'quiet';

  export async function replay(): Promise<string> {
    if (!logo) return 'not-ready';
    if (still()) return 'static';
    return (await logo.play()).status;
  }

  onMount(() => {
    let gone = false;
    void loadLogoMotion()
      .then((lib) => {
        if (gone) return;
        logo = lib.create(el, 'superlibrary');
        const svg = el.querySelector('svg');
        if (svg && label) svg.setAttribute('aria-label', label);
        else svg?.setAttribute('aria-hidden', 'true');
        if (playIntro && !still() && claimIntro()) void logo.play();
      })
      .catch(() => {});
    return () => {
      gone = true;
      logo?.destroy();
      logo = undefined;
    };
  });
</script>

<span bind:this={el} class="logo-motion {className}" style:width="{size}px" style:height="{size}px" aria-hidden={label ? undefined : 'true'} data-testid="logo-motion"></span>

<style>
  .logo-motion { display: inline-block; flex: 0 0 auto; }
  .logo-motion :global(svg) { width: 100%; height: 100%; }
</style>
