// One renderer, one WebGL canvas, every scene on the page. The canvas moves into whichever stage
// owns it; when that scene settles, it leaves a 2D snapshot of its last frame behind (so the stage
// looks the same) and goes to the next stage in the queue. So only one thing on the page ever
// moves at a time, a stage that is not moving costs nothing, and the page holds one WebGL context.
// Loaded lazily by band.js, together with three and the scenes.
import { Color, PCFShadowMap, Vector2, WebGLRenderer } from 'three';
import { createCabinet } from './cabinet.js';
import { accentRGB } from './common.js';
import { createIntake } from './intake.js';

/** Scene name (a stage's data-scene) to its factory: ({ phase, accent, still }) => view. */
export const SCENES = { cabinet: createCabinet, intake: createIntake };

function makeRenderer() {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  return renderer;
}
const accentColor = () => { const [r, g, b] = accentRGB(); return new Color().setRGB(r, g, b); };
const dispose = (view) => view.scene.traverse((o) => o.geometry?.dispose());

/** A pointer event's position in `el` as normalised device coordinates. */
export function ndc(el, e) {
  const r = el.getBoundingClientRect();
  return new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
}

/** Returns null when WebGL fails. opts: { phase, onLost }. */
export function createStage({ phase, onLost }) {
  let renderer;
  try { renderer = makeRenderer(); } catch { return null; }
  const canvas = renderer.domElement;
  canvas.className = 'catalogue-gl';
  canvas.addEventListener('webglcontextlost', () => onLost?.());
  const accent = accentColor();
  const entries = [], queue = [];
  let owner = null, raf = 0, last = 0;

  function fit(e) {
    const w = e.el.clientWidth, h = e.el.clientHeight;
    if (!w || !h) return false;
    renderer.setSize(w, h, false);
    e.view.resize(w / h);
    return true;
  }
  // The stage keeps the last frame as a plain 2D canvas: drawn in the same task as the render, so
  // the WebGL buffer is still there without preserveDrawingBuffer.
  function snapshot(e) {
    if (!e.rest) {
      e.rest = document.createElement('canvas');
      e.rest.className = 'catalogue-rest';
      e.rest.setAttribute('aria-hidden', 'true');
      e.el.appendChild(e.rest);
    }
    e.rest.width = canvas.width;
    e.rest.height = canvas.height;
    e.rest.getContext('2d').drawImage(canvas, 0, 0);
    e.el.classList.add('rested');
  }
  function frame(now) {
    raf = 0;
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 1 / 60);
    last = now;
    if (!owner) owner = queue.shift() ?? null;
    const e = owner;
    if (!e) { last = 0; return; }
    if (canvas.parentNode !== e.el || e.resized) {
      e.resized = false;
      if (!fit(e)) { owner = null; if (queue.length) raf = requestAnimationFrame(frame); return; }
      e.el.appendChild(canvas);
      e.el.classList.add('live');
    }
    const moving = e.view.frame(dt);
    renderer.render(e.view.scene, e.view.camera);
    e.onFrame?.(e.view);
    if (moving || e.dirty) { e.dirty = false; raf = requestAnimationFrame(frame); return; }
    // Settled: leave the snapshot, free the canvas, and hand it to the next stage waiting.
    snapshot(e);
    canvas.remove();
    e.el.classList.remove('live');
    owner = null;
    last = 0;
    if (queue.length) raf = requestAnimationFrame(frame);
  }
  function request(e) {
    e.dirty = true;
    if (owner !== e && !queue.includes(e)) queue.push(e);
    if (!raf) raf = requestAnimationFrame(frame);
  }
  const ro = new ResizeObserver((list) => {
    for (const r of list) { const e = entries.find((x) => x.el === r.target); if (e?.rest || e === owner) { e.resized = true; request(e); } }
  });

  return {
    /** Adds the stage `el` showing scene `name`; returns its entry (view, el). */
    add(el, name, onFrame) {
      const e = { el, name, view: SCENES[name]({ phase, accent }), onFrame };
      entries.push(e);
      ro.observe(el);
      return e;
    },
    /** Draws the entry until its scene settles. Waits its turn behind whatever is moving. */
    request,
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      for (const e of entries) { e.rest?.remove(); e.el.classList.remove('rested', 'live'); dispose(e.view); }
      canvas.remove();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

/**
 * Tooling only (?catalogue-still): draws one scene's settled end state at `el`'s size and returns
 * it as a WebP data URL. It uses its own short-lived renderer, and the page's stage is not started.
 */
export function renderStill(el, name, phase) {
  const renderer = makeRenderer();
  const view = SCENES[name]({ phase, accent: accentColor(), still: true });
  view.finish();
  renderer.setSize(el.clientWidth, el.clientHeight, false);
  view.resize(el.clientWidth / el.clientHeight);
  view.frame(0);
  renderer.render(view.scene, view.camera);
  const url = renderer.domElement.toDataURL('image/webp', 0.86);
  dispose(view);
  renderer.dispose();
  renderer.forceContextLoss();
  return url;
}
