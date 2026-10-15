<script lang="ts">
  /**
   * The Superlibrary mark: the translucent-v2 coral "pages" (static/brand/README.md).
   *
   * The pack's compact one-colour form (`svg/mark-current.svg`), inlined so it takes its colour from
   * CSS (`--sl-mark`, vibekit's Superlibrary product colour, checked at 3:1 in every vibe). The
   * geometry is the pack's; do not redraw it. Decorative beside the wordmark, so hidden from
   * assistive technology unless a `label` says it stands alone. The large animated form on the boot
   * screen is LogoMotion.svelte; this one never animates.
   */
  let { class: className = '', label }: { class?: string; label?: string } = $props();
  const uid = $props.id();
</script>

<svg
  class="mark {className}"
  data-testid="superlibrary-mark"
  viewBox="0 0 256 256"
  role={label ? 'img' : undefined}
  aria-label={label}
  aria-hidden={label ? undefined : 'true'}
  focusable="false"
>
  <defs>
    <mask id="sl-seams-{uid}" maskUnits="userSpaceOnUse" x="0" y="0" width="256" height="256">
      <rect width="256" height="256" fill="white" /><path d="M61 99V226M86 122V227M111 145V238" fill="none" stroke="black" stroke-width="5" />
    </mask>
  </defs>
  <g transform="translate(7.68 7.68) scale(.94)" style="color: var(--sl-mark)">
    <g mask="url(#sl-seams-{uid})">
      <path d="M34 73L122 20Q136 12 136 28V184L74 223Q59 233 47 222L34 211Z" fill="currentColor" />
      <path d="M61 99L153 42Q168 33 168 50V205L99 245Q87 252 77 243L61 226Z" fill="currentColor" />
      <path d="M86 122L185 62Q200 53 200 71V214L116 248Q100 255 93 240L86 227Z" fill="currentColor" />
      <path d="M111 145L218 82Q233 74 233 92V215Q233 225 220 230L126 249Q111 253 111 235Z" fill="currentColor" />
    </g>
  </g>
</svg>
