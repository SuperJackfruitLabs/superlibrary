<script lang="ts">
  /**
   * The Superlibrary mark: two upright book spines and a third leaning against them.
   *
   * The same three rects as static/favicon.svg and scripts/render-icons.sh, less the favicon's
   * dark tile; change them together. Coral #ff7a59 is the mark's colour on dark grounds; on a light
   * page it is 2.5:1, under the 3:1 a graphic needs, so the light theme draws it in the deeper
   * --mark shade (app.css). Decorative beside the wordmark, so hidden from assistive technology
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
  <g style="fill: var(--mark, #ff7a59)">
    <rect x="5.5" y="9.5" width="4.5" height="15.5" rx="1" />
    <rect x="12" y="7" width="4.5" height="18" rx="1" />
    <rect x="22.3" y="8" width="4.5" height="17" rx="1" transform="rotate(-20 22.3 25)" />
  </g>
</svg>
