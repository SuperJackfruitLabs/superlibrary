// The catalogue band's loader. It picks the still for the visitor's sun phase at once, and fetches
// three and the scene only when the band nears the viewport, so the hero's first paint is untouched.
// Reduced motion (the system setting or vibekit's data-motion="reduce") and a missing WebGL keep
// the still. The index card is HTML in the page either way; scroll only moves it with the drawer.
import { bandPhase, bandProgress, drawerOpen } from './common.js';

const band = document.getElementById('catalogue');
const stage = band?.querySelector('.stage');
if (band && stage) {
  const html = document.documentElement;
  const phase = bandPhase();
  const still = stage.querySelector('img[data-still]');
  if (still) still.src = `/catalogue/${phase}.webp`;
  const rm = matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => rm.matches || html.dataset.motion === 'reduce';
  let scene = null, loading = false, near = false, ticking = false;

  function webgl() {
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
      return !!gl;
    } catch { return false; }
  }
  function update() {
    ticking = false;
    if (!scene) return;
    const p = bandProgress(band);
    scene.setProgress(p);
    band.style.setProperty('--open', drawerOpen(p).toFixed(3));
  }
  function onScroll() { if (near && scene && !ticking) { ticking = true; requestAnimationFrame(update); } }
  function stop() {
    scene?.dispose();
    scene = null;
    stage.classList.remove('live');
    band.classList.remove('scrolling');
    band.style.removeProperty('--open');
  }
  async function start() {
    if (scene || loading || reduced() || !webgl()) return;
    loading = true;
    try {
      const { mountCatalogue } = await import('./scene.js');
      if (reduced()) return;
      scene = mountCatalogue(stage, { phase, onFrame: () => stage.classList.add('live'), onLost: stop });
      if (scene) { band.classList.add('scrolling'); update(); }
    } catch { stop(); } finally { loading = false; }
  }

  // Not before the page's own load is done, so three never competes with the hero for bandwidth.
  const loaded = document.readyState === 'complete' ? Promise.resolve() : new Promise((r) => addEventListener('load', r, { once: true }));
  new IntersectionObserver((es) => { near = es[0].isIntersecting; if (near) loaded.then(start); }, { rootMargin: '300px 0px' }).observe(band);
  addEventListener('scroll', onScroll, { passive: true });
  const recheck = () => { if (reduced()) stop(); else if (near) loaded.then(start); };
  rm.addEventListener('change', recheck);
  new MutationObserver(recheck).observe(html, { attributes: true, attributeFilter: ['data-motion'] });

  // Renders the stills in public/catalogue (scripts/render-stills.mjs): ?catalogue-still exposes a
  // hook that draws the settled scene, drawer open, for one phase and returns it as a WebP.
  if (new URLSearchParams(location.search).has('catalogue-still')) {
    window.__catalogueStill = async (p) => {
      stop();
      const { mountCatalogue } = await import('./scene.js');
      const s = mountCatalogue(stage, { phase: p, still: true });
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const url = s.canvas.toDataURL('image/webp', 0.86);
      s.dispose();
      return url;
    };
  }
}
