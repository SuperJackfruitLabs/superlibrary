// The catalogue scenes' loader, for every stage on the page (an element with data-scene). It picks
// each stage's still for the visitor's sun phase at once, and fetches three, the shared stage and
// the scenes only after the page has loaded and a stage nears the viewport, so the hero's first
// paint is untouched. Reduced motion (the system setting or vibekit's data-motion="reduce") and a
// missing WebGL keep the stills. All copy and labels are HTML in the page either way.
//
// Two kinds of scene: the cabinet follows scroll through its band; the "How it works" scenes play
// once, each when its step crosses the viewport's centre. On desktop they share one pinned panel
// (one stage per scene, stacked, only the active one shown); on a phone each step has its own.
// The shared stage draws one scene at a time, in the order asked.
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
  let stage = null, mod = null, loading = false, ticking = false, active = -1, centred = false;

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
  function scrolled() {
    ticking = false;
    const e = band && entries.get(band.querySelector('[data-scene="cabinet"]'));
    if (e && e.view.setProgress(bandProgress(band))) stage.request(e);
  }
  function onScroll() { if (stage && near.size && !ticking) { ticking = true; requestAnimationFrame(scrolled); } }

  // The step scene for step i in this layout: the panel's on desktop, the step's own on a phone.
  const stepStage = (i) => (desk.matches ? panel[i] : steps[i]?.querySelector('[data-scene]'));
  function play(el) {
    const e = el && entries.get(el);
    if (!e || e.played) return;
    e.played = true;
    e.view.play();
    stage.request(e);
  }
  // A scene leaving the panel mid-play jumps to its end, so the one coming in never waits for it.
  function settle(el) {
    const e = el && entries.get(el);
    if (e?.played) { e.view.finish(); stage.request(e); }
  }
  function activate(i) {
    const prev = active;
    active = i;
    steps.forEach((li, j) => li.classList.toggle('active', j === i));
    panel.forEach((el, j) => el.classList.toggle('on', j === i));
    if (stage && prev !== i && prev >= 0 && desk.matches) settle(panel[prev]);
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
      for (const el of shown()) {
        const name = el.dataset.scene;
        const e = stage.add(el, name, name === 'cabinet' ? cardFollows : undefined);
        entries.set(el, e);
        if (name === 'cabinet') wireCabinet(el, e);
      }
      band?.classList.add('scrolling');
      // Draw every stage once in its opening state (the steps: before they play), in page order,
      // then play the step already at the centre, if one is.
      scrolled();
      for (const e of entries.values()) stage.request(e);
      if (centred && active >= 0) play(stepStage(active));
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
  // A step is active while it crosses a line at the viewport's centre.
  if (steps.length) {
    how.classList.add('seq');
    activate(0);
    const centre = new IntersectionObserver((es) => {
      for (const en of es) if (en.isIntersecting) { centred = true; activate(steps.indexOf(en.target)); if (stage) play(stepStage(active)); }
    }, { rootMargin: '-50% 0px -50% 0px' });
    for (const li of steps) centre.observe(li);
  }
  addEventListener('scroll', onScroll, { passive: true });
  const recheck = () => { if (reduced()) stop(); else if (near.size) loaded.then(start); };
  rm.addEventListener('change', recheck);
  new MutationObserver(recheck).observe(html, { attributes: true, attributeFilter: ['data-motion'] });
  // Crossing the breakpoint swaps which stages are shown: start again with the new set.
  desk.addEventListener('change', () => { if (stage) { stop(); recheck(); } });

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
