# Brand assets

Copied unchanged from the Super Jackfruit Labs product-logo pack **translucent-v2, 2026-10-14**,
`products/superlibrary/web/`: the Superlibrary coral mark (four leaning pages). Only the files the
app uses are here; `favicon.ico` and `apple-touch-icon.png` from the same folder sit at the root of
`static/`, where browsers look for them unasked. Do not redraw or recolour these files; take a new
pack version instead.

- `favicon.svg`, `favicon-16.png`, `favicon-32.png`, `favicon-48.png`: the tab icon.
- `icon-192.png`, `icon-512.png`, `icon-maskable-192.png`, `icon-maskable-512.png`: the manifest's icons.
- `logo-motion.js`: the pack's approved logo animation (`motion/logo-motion.js`), byte for byte; it
  is generated, never edited by hand. It carries every product's master; the app only asks it for
  `superlibrary`. `src/lib/LogoMotion.svelte` loads it and plays it once on the first loading
  screen of a session, never under reduced motion, never in Quiet, never in the header mark.
- `og.png`: the link preview, a 1200x630 screenshot of `apps/web/brand-src/og.html`
  (`node apps/web/brand-src/render-og.mjs` regenerates it).

The in-app mark (`src/lib/Mark.svelte`) inlines the pack's `svg/mark-current.svg` geometry so CSS
can colour it (`--sl-mark`, vibekit's Superlibrary product colour, checked at 3:1 in every vibe).
