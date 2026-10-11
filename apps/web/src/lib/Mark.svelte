<script lang="ts">
  /**
   * The Superlibrary mark: two upright book spines and a third leaning against them.
   *
   * The same three rects as static/favicon.svg and scripts/render-icons.sh, less the favicon's
   * dark tile; change them together. The mark is drawn in vibekit's Superlibrary product
   * colour (`--sl-mark`), checked at 3:1 in every vibe. Decorative beside the wordmark, so hidden from assistive technology
   * unless a `label` says it stands alone.
   */
  let { class: className = '', label }: { class?: string; label?: string } = $props();
</script>

<svg
  class="mark {className}"
  data-testid="superlibrary-mark"
  viewBox="5 5 22 22"
  role={label ? 'img' : undefined}
  aria-label={label}
  aria-hidden={label ? undefined : 'true'}
  focusable="false"
>
  <g style="fill: var(--sl-mark)">
    <rect x="5.5" y="9.5" width="4.5" height="15.5" rx="1" />
    <rect x="12" y="7" width="4.5" height="18" rx="1" />
    <rect x="22.3" y="8" width="4.5" height="17" rx="1" transform="rotate(-20 22.3 25)" />
  </g>
</svg>
