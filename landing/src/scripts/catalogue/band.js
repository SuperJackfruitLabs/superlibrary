// The catalogue scenes' loader, for every stage on the page (an element with data-scene). It picks
// each stage's still for the visitor's sun phase at once, and fetches three, the shared stage and
// the scenes only after the page has loaded and a stage nears the viewport, so the hero's first
// paint is untouched. Reduced motion (the system setting or vibekit's data-motion="reduce") and a
// missing WebGL keep the stills. All copy and labels are HTML in the page either way.
//
// Two kinds of scene: the cabinet follows scroll through its band; the steps' scenes play once,
// when their stage is mostly in view. The shared stage runs one at a time, in the order asked.
import { bandPhase, bandProgress } from './common.js';

const stages = [...document.querySelectorAll('[data-scene]')];
if (stages.length) {
  const html = document.documentElement;
  const phase = bandPhase();
  for (const el of stages) { const img = el.querySelector('img[data-still]'); if (img) img.src = `/catalogue/${el.dataset.scene}-${phase}.webp`; }
  const rm = matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => rm.matches || html.dataset.motion === 'reduce';
  const stillMode = new URLSearchParams(location.search).has('catalogue-still');
  const band = document.getElementById('catalogue');
  const entries = new Map(), seen = new Set();
  const near = new Set();
  let stage = null, mod = null, loading = false, ticking = false;

  function webgl() {
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
      return !!gl;
    } catch { return false; }
  }
  // The HTML index card follows the drawer the scene actually drew, not the scroll position, so it
  // never moves while the cabinet waits its turn.
  const cardFollows = (view) => band?.style.setProperty('--open', view.open.toFixed(3));
  function scrolled() {
    ticking = false;
    const e = band && entries.get(band.querySelector('[data-scene="cabinet"]'));
    if (e && e.view.setProgress(bandProgress(band))) stage.request(e);
  }
  function onScroll() { if (stage && near.size && !ticking) { ticking = true; requestAnimationFrame(scrolled); } }
  function play(el) {
    const e = entries.get(el);
    if (!e || e.played) return;
    e.played = true;
    e.view.play();
    stage.request(e);
  }

  function stop() {
    stage?.dispose();
    stage = null;
    entries.clear();
    band?.classList.remove('scrolling');
    band?.style.removeProperty('--open');
  }
  async function start() {
    if (stage || loading || stillMode || reduced() || !webgl()) return;
    loading = true;
    try {
      mod ??= await import('./stage.js');
      if (reduced()) return;
      stage = mod.createStage({ phase, onLost: stop });
      if (!stage) return;
      for (const el of stages) {
        const name = el.dataset.scene;
        const e = stage.add(el, name, name === 'cabinet' ? cardFollows : undefined);
        entries.set(el, e);
        if (name === 'cabinet') wireCabinet(el, e);
      }
      band?.classList.add('scrolling');
      // Draw every stage once in its opening state (the steps: before they play), in page order,
      // then play the steps already in view.
      scrolled();
      for (const e of entries.values()) stage.request(e);
      for (const el of seen) play(el);
    } catch { stop(); } finally { loading = false; }
  }
  // Hover (mouse) or tap (touch) opens another cabinet drawer a little.
  function wireCabinet(el, e) {
    el.addEventListener('pointermove', (ev) => { if (stage && ev.pointerType === 'mouse' && e.view.peekAt(mod.ndc(el, ev))) stage.request(e); });
    el.addEventListener('pointerleave', () => { if (stage && e.view.unpeek()) stage.request(e); });
    el.addEventListener('pointerdown', (ev) => { if (stage && ev.pointerType !== 'mouse' && e.view.peekAt(mod.ndc(el, ev), true)) stage.request(e); });
  }

  // Not before the page's own load is done, so three never competes with the hero for bandwidth.
  const loaded = document.readyState === 'complete' ? Promise.resolve() : new Promise((r) => addEventListener('load', r, { once: true }));
  const nearIO = new IntersectionObserver((es) => {
    for (const en of es) en.isIntersecting ? near.add(en.target) : near.delete(en.target);
    if (near.size) loaded.then(start);
  }, { rootMargin: '300px 0px' });
  const inView = new IntersectionObserver((es) => {
    for (const en of es) if (en.isIntersecting) { seen.add(en.target); if (stage) play(en.target); }
  }, { threshold: 0.6 });
  for (const el of stages) { nearIO.observe(el); if (el.dataset.scene !== 'cabinet') inView.observe(el); }
  addEventListener('scroll', onScroll, { passive: true });
  const recheck = () => { if (reduced()) stop(); else if (near.size) loaded.then(start); };
  rm.addEventListener('change', recheck);
  new MutationObserver(recheck).observe(html, { attributes: true, attributeFilter: ['data-motion'] });

  // Renders the stills in public/catalogue (scripts/render-stills.mjs): ?catalogue-still skips the
  // live stage and exposes a hook that draws one scene's settled end state as a WebP.
  if (stillMode) {
    window.__catalogueStill = async (name, p) => {
      mod ??= await import('./stage.js');
      return mod.renderStill(document.querySelector(`[data-scene="${name}"]`), name, p);
    };
  }
}
