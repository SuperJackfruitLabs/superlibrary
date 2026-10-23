// Shared by the catalogue band's small loader and its lazy scene: which sun phase to show, the
// product accent as a colour, and how far scroll has pulled the drawer. Phase and accent come from vibekit's plain (no Svelte) entry, so the band follows the same day as the apps.
import { ACCENTS, ACCENT_HUES, PHASES, PRODUCT_ACCENTS, phaseAt } from '@superjackfruit/vibekit/appearance';

/** The visitor's local sun phase. A vibekit page that turned time of day off gets plain noon. */
export function bandPhase() {
  const html = document.documentElement;
  if (html.dataset.time === 'off') return 'noon';
  return PHASES.includes(html.dataset.phase) ? html.dataset.phase : phaseAt(new Date());
}

/** The accent's OKLCH hue as linear-sRGB [r, g, b], at a lamp-like lightness and chroma. */
export function accentRGB(L = 0.74, C = 0.13) {
  const pick = document.documentElement.dataset.accent;
  const h = (ACCENT_HUES[ACCENTS.includes(pick) ? pick : PRODUCT_ACCENTS.superlibrary] * Math.PI) / 180;
  const a = C * Math.cos(h), b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const c = (v) => Math.min(1, Math.max(0, v));
  return [c(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), c(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), c(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)];
}

const clamp = (v) => Math.min(1, Math.max(0, v));
/** How far the band has scrolled through the viewport, 0 (entering) to 1 (gone). Native scroll only. */
export function bandProgress(el) {
  const r = el.getBoundingClientRect();
  return clamp((innerHeight - r.top) / (innerHeight + r.height));
}
/** The drawer's opening, 0 to 1, for a band progress: it opens while the band rises to mid-screen. */
export function drawerOpen(p) {
  const t = clamp((p - 0.18) / 0.42);
  return t * t * (3 - 2 * t);
}
