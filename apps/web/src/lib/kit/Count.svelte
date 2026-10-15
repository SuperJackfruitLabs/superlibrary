<script lang="ts">
  /**
   * A count that arrives (catch-up motion): vibekit's countUp tweens from the last number to the new one in
   * Daylight and Studio and fades the swap in Paper; Quiet shows the number plainly; reduced motion swaps
   * at once. Null is "not known yet": a dash, never 0 (and never the last view's number).
   */
  import { countUp } from '@superjackfruit/vibekit/motion';
  import { look } from '$lib/vibe/appearance.svelte';
  let { value, class: cls = '' }: { value: number | null; class?: string } = $props();

  function counted(node: HTMLElement, v: number | null) {
    let last: number | null = v;
    let tween: ReturnType<typeof countUp> | null = v === null ? null : countUp(node, { value: v });
    if (v === null) node.textContent = '–';
    return {
      update(next: number | null) {
        if (next === null) { node.textContent = '–'; return; }
        if (!tween) { tween = countUp(node, { value: last ?? next }); }
        tween.update({ value: next });
        last = next;
      },
      destroy() { tween?.destroy(); },
    };
  }
</script>

{#if look.appearance.vibe === 'quiet'}<span class={cls}>{value ?? '–'}</span>{:else}<span class={cls} use:counted={value}></span>{/if}
