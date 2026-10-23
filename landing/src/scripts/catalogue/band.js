// The catalogue scenes' loader, for every stage on the page (an element with data-scene). It picks
// each stage's still for the visitor's sun phase at once, and fetches three, the shared stage and
// the scenes only after the page has loaded and a stage nears the viewport, so the hero's first
// paint is untouched. Reduced motion (the system setting or vibekit's data-motion="reduce") and a
// missing WebGL keep the stills. All copy and labels are HTML in the page either way.
//
// Every scene follows native scroll: the cabinet through its band, each "How it works" scene
// through its own step. On desktop the steps share one pinned panel (one stage per scene, stacked)
// and scroll drives the hand-off between them too (see weight()). On a phone each step has its own
// stage and scrubs with the step's progress through the viewport. The shared stage draws one scene
// at a time, and only while a progress is changing.
import { bandPhase, bandProgress } from './common.js';

const all = [...document.querySelectorAll('[data-scene]')];
if (all.length) {
  const html = document.documentElement;
  const phase = bandPhase();
  for (const el of all) { const img = el.querySelector('img[data-still]'); if (img) img.src = `/catalogue/${el.dataset.scene}-${phase}.webp`; }
  const rm = matchMedia('(prefers-reduced-motion: reduce)');
  const desk = matchMedia('(min-width: 900px)');
  const reduced = () => rm.matches || html.dataset.motion === 'reduce';
  const stillMode = new URLSearchParams(location.search).has('catalogue-still');
  const band = document.getElementById('catalogue');
  const how = document.querySelector('.how');
  const steps = how ? [...how.querySelectorAll('ol.steps > li')] : [];
  const panel = how ? [...how.querySelectorAll('.panel-stage')] : [];
  const entries = new Map(), near = new Set();
  let stage = null, mod = null, loading = false, ticking = false;

  function webgl() {
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
      return !!gl;
    } catch { return false; }
  }
  // Only the stages this layout shows take part (the phone's per-step stages are hidden on desktop).
  const shown = () => all.filter((el) => el.getClientRects().length);
  // The HTML index card follows the drawer the scene actually drew, not the scroll position, so it
  // never moves while the cabinet waits its turn.
  const cardFollows = (view) => band?.style.setProperty('--open', view.open.toFixed(3));
  const clamp = (v) => Math.min(1, Math.max(0, v));
  const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
  // Desktop: where the viewport's centre line is in the steps, as one number u from 0 (the top of
  // step 01) to 3 (the bottom of step 03). Step i owns [i, i + 1).
  function stepsAt() {
    const mid = innerHeight / 2;
    for (let i = steps.length - 1; i >= 0; i--) {
      const r = steps[i].getBoundingClientRect();
      if (mid >= r.top || i === 0) return Math.max(0, Math.min(steps.length, i + (mid - r.top) / r.height));
    }
    return 0;
  }
  // The hand-off, all scroll-driven so it reverses cleanly: over the last 15% of one step and the
  // first 15% of the next, the outgoing scene (holding its end) fades out, the incoming one
  // (holding its start) fades in with a 2° camera turn landing on zero, and the step text dims and
  // undims with the same weight. Each scene runs over the middle 70% of its step. Under reduced
  // motion the weights are 0 or 1: the stills swap at the boundary, nothing fades.
  const EDGE = 0.15, TURN = (2 * Math.PI) / 180;
  function weight(u, i) {
    if (reduced()) return Math.floor(Math.min(u, steps.length - 0.001)) === i ? 1 : 0;
    const up = i === 0 ? 1 : smooth((u - (i - EDGE)) / (2 * EDGE));
    const down = i === steps.length - 1 ? 1 : 1 - smooth((u - (i + 1 - EDGE)) / (2 * EDGE));
    return up * down;
  }
  // Phone: a step's progress through the viewport, done by the time its stage is in the upper half.
  const phoneProgress = (li) => clamp((bandProgress(li) - 0.12) / 0.4);
  function scrolled() {
    ticking = false;
    const e = stage && band && entries.get(band.querySelector('[data-scene="cabinet"]'));
    if (e && e.view.setProgress(bandProgress(band))) stage.request(e);
    if (!steps.length) return;
    if (!desk.matches) {
      steps.forEach((li, i) => { const s = stage && entries.get(stepStage(i)); if (s && s.view.setProgress(phoneProgress(li))) stage.request(s); });
      return;
    }
    const u = stepsAt();
    steps.forEach((li, i) => {
      const w = weight(u, i);
      li.style.setProperty('--focus', w.toFixed(3));
      li.classList.toggle('active', w >= 0.5);
      panel[i].style.opacity = w.toFixed(3);
      const s = stage && entries.get(panel[i]);
      if (!s) return;
      s.hidden = w === 0;
      // The camera turn is the incoming side's only: the outgoing scene holds still while it fades.
      const turn = u < i + 0.5 ? -(1 - w) * TURN : 0;
      const a = s.view.setProgress(clamp((u - i - EDGE) / (1 - 2 * EDGE)));
      const b = s.view.setOffset(turn);
      if (a || b) stage.request(s);
    });
  }
  function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(scrolled); } }

  // The step scene for step i in this layout: the panel's on desktop, the step's own on a phone.
  const stepStage = (i) => (desk.matches ? panel[i] : steps[i]?.querySelector('[data-scene]'));
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
      for (const el of shown()) {
        const name = el.dataset.scene;
        const e = stage.add(el, name, name === 'cabinet' ? cardFollows : undefined);
        entries.set(el, e);
        if (name === 'cabinet') wireCabinet(el, e);
      }
      band?.classList.add('scrolling');
      // Draw every stage once at its current scroll progress, in page order.
      scrolled();
      for (const e of entries.values()) stage.request(e);
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
  for (const el of all) nearIO.observe(el);
  if (steps.length) how.classList.add('seq');
  scrolled();
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll, { passive: true });
  const recheck = () => { if (reduced()) stop(); else if (near.size) loaded.then(start); };
  rm.addEventListener('change', recheck);
  new MutationObserver(recheck).observe(html, { attributes: true, attributeFilter: ['data-motion'] });
  // Crossing the breakpoint swaps which stages are shown: start again with the new set.
  desk.addEventListener('change', () => { if (stage) stop(); recheck(); onScroll(); });

  // Renders the stills in public/catalogue (scripts/render-stills.mjs): ?catalogue-still skips the
  // live stage and exposes a hook that draws one scene's settled end state as a WebP, at the
  // largest stage that shows it.
  if (stillMode) {
    window.__catalogueStill = async (name, p) => {
      mod ??= await import('./stage.js');
      const el = [...document.querySelectorAll(`[data-scene="${name}"]`)].sort((a, b) => b.clientWidth - a.clientWidth)[0];
      return mod.renderStill(el, name, p);
    };
  }
}
