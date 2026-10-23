// The catalogue band's scene: a low-poly card-catalogue cabinet on a plinth, built from boxes,
// lit by the visitor's sun phase. Loaded only when the band nears the viewport (Catalogue.astro).
//
// Calm by construction: no post-processing, no auto-orbit, no animation loop of its own. A frame
// is drawn only when something moved (scroll progress, a hovered drawer, a resize), and drawing
// stops once every drawer has settled. The camera turns at most 3° across the whole band.
import {
  BoxGeometry, Color, CylinderGeometry, DirectionalLight, Group, HemisphereLight, Mesh, MeshLambertMaterial,
  PCFShadowMap, PerspectiveCamera, Raycaster, Scene, SpotLight, Vector2, Vector3, WebGLRenderer,
} from 'three';
import { accentRGB, drawerOpen } from './common.js';

// Sun direction (degrees: elevation, azimuth from the front, + to the right), colour and sky per phase.
const PHASE = {
  dawn: { el: 14, az: -58, sun: '#ffc8ae', i: 1.7, sky: '#d4d6f2', ground: '#7d6a60', hemi: 1.0, lamp: 0 },
  morning: { el: 58, az: -34, sun: '#e9f1ff', i: 2.3, sky: '#d2e3ff', ground: '#8a8274', hemi: 1.15, lamp: 0 },
  noon: { el: 70, az: 18, sun: '#fff7ec', i: 2.4, sky: '#ebeef4', ground: '#8f8578', hemi: 1.15, lamp: 0 },
  golden: { el: 11, az: 62, sun: '#ffaa55', i: 2.6, sky: '#ffd8b4', ground: '#6b5240', hemi: 0.75, lamp: 0 },
  dusk: { el: 5, az: 70, sun: '#ff9478', i: 1.0, sky: '#8c80b4', ground: '#3d3242', hemi: 0.75, lamp: 0.45 },
  night: { el: 48, az: -30, sun: '#8ea2d8', i: 0.35, sky: '#3a4266', ground: '#1a1720', hemi: 0.9, lamp: 1 },
};

const COLS = 4, ROWS = 4, CW = 0.42, CH = 0.26, T = 0.04, DEPTH = 0.95;
const W = COLS * CW + (COLS + 1) * T, H = ROWS * CH + (ROWS + 1) * T;
const MAIN = 6; // row 1 (from the top), column 2: the drawer scroll pulls out
const OUT = 0.6, PEEK = 0.09;
const BASE_Y = 0.43; // the cabinet's floor: plinth (0.25 + 0.06) plus its base rail

const mat = (c) => new MeshLambertMaterial({ color: c, flatShading: true });
const M = {
  stone: mat('#d6cdc1'), stoneTop: mat('#e4ddd3'), wood: mat('#8a5a3b'), woodDark: mat('#6b4129'),
  front: mat('#a36e47'), brass: mat('#c9a25a'), card: mat('#f4eee2'), inside: mat('#5c3a26'),
};

function box(w, h, d, m, x = 0, y = 0, z = 0, parent) {
  const b = new Mesh(new BoxGeometry(w, h, d), m);
  b.position.set(x, y, z);
  b.castShadow = b.receiveShadow = true;
  parent?.add(b);
  return b;
}

function drawer(i, parent) {
  const col = i % COLS, row = Math.floor(i / COLS);
  const g = new Group();
  g.position.set(-W / 2 + T + CW / 2 + col * (CW + T), BASE_Y + H - T - CH / 2 - row * (CH + T), DEPTH / 2);
  const fw = CW - 0.014, fh = CH - 0.014, bd = DEPTH - 0.1, bh = CH * 0.62;
  const front = box(fw, fh, 0.035, M.front, 0, 0, -0.012, g);
  front.userData.drawer = i;
  box(0.1, 0.024, 0.03, M.brass, 0, -fh * 0.22, 0.016, g);
  box(0.15, 0.06, 0.008, M.brass, 0, fh * 0.12, 0.01, g);
  // The body behind the front: floor, sides, back, and a row of cards standing in it. A closed
  // drawer's body is hidden (it cannot be seen), which keeps a frame to about 70 draws.
  const body = new Group(), z0 = -0.03 - bd / 2, yb = -fh / 2 + 0.02;
  box(fw - 0.02, 0.012, bd, M.inside, 0, yb, z0, body);
  box(0.012, bh, bd, M.inside, -fw / 2 + 0.016, yb + bh / 2, z0, body);
  box(0.012, bh, bd, M.inside, fw / 2 - 0.016, yb + bh / 2, z0, body);
  box(fw - 0.02, bh, 0.012, M.inside, 0, yb + bh / 2, -0.03 - bd + 0.006, body);
  const cards = [];
  for (let k = 0; k < 9; k++) cards.push(box(fw - 0.07, CH * 0.5, 0.006, M.card, 0, yb + CH * 0.26, -0.09 - k * 0.08, body));
  body.visible = false;
  g.add(body);
  parent.add(g);
  return { g, body, front, cards, z: DEPTH / 2, out: 0, target: 0, peek: false };
}

function build(scene, accent) {
  const root = new Group();
  scene.add(root);
  // Plinth: two flat stone steps.
  box(2.8, 0.25, 1.8, M.stone, 0, 0.125, 0.15, root);
  box(2.45, 0.06, 1.5, M.stoneTop, 0, 0.28, 0.15, root);
  // Cabinet: a base rail, then a hollow carcass of panels so an open drawer leaves a real gap.
  box(W + 0.04, 0.12, DEPTH + 0.04, M.woodDark, 0, 0.37, 0, root);
  box(W + 0.06, T * 1.5, DEPTH + 0.06, M.woodDark, 0, BASE_Y + H + T * 0.75, 0, root);
  box(W, T, DEPTH, M.wood, 0, BASE_Y + T / 2, 0, root);
  box(W, H, T, M.wood, 0, BASE_Y + H / 2, -DEPTH / 2 + T / 2, root);
  for (let c = 0; c <= COLS; c++) box(T, H, DEPTH, M.wood, -W / 2 + T / 2 + c * (CW + T), BASE_Y + H / 2, 0, root);
  for (let r = 1; r <= ROWS; r++) box(W, T, DEPTH, M.wood, 0, BASE_Y + T / 2 + r * (CH + T), 0, root);
  const drawers = Array.from({ length: COLS * ROWS }, (_, i) => drawer(i, root));
  // The index card that rises out of the open drawer, with an accent tab.
  const lift = drawers[MAIN].cards[1];
  lift.userData.y0 = lift.position.y;
  box(0.08, 0.03, 0.007, mat(accent), -0.08, CH * 0.25 + 0.012, 0, lift).castShadow = false;
  // A reading lamp on the cabinet's top: two brass arms reach forward, so the shade hangs in front
  // of the drawers and looks down at the open one. It casts no shadow (its shade would block it).
  const top = BASE_Y + H + T * 1.5, x = W / 2 - 0.42;
  const base = new Vector3(x, top, -0.12), elbow = new Vector3(x, top + 0.46, 0.2), head = new Vector3(x - 0.06, top + 0.26, DEPTH / 2 + 0.78);
  const aim = new Vector3(drawers[MAIN].g.position.x, drawers[MAIN].g.position.y, DEPTH / 2 + 0.42);
  const disc = new Mesh(new CylinderGeometry(0.1, 0.12, 0.04, 8), M.brass);
  disc.position.copy(base).y += 0.02;
  const rod = (a, b) => { const r = new Mesh(new BoxGeometry(0.022, 0.022, a.distanceTo(b)), M.brass); r.position.lerpVectors(a, b, 0.5); r.lookAt(b); return r; };
  const shade = new Group();
  shade.position.copy(head);
  shade.lookAt(aim);
  const cone = new Mesh(new CylinderGeometry(0.05, 0.13, 0.13, 8, 1, true), mat('#2e2a33'));
  cone.material.side = 2; // DoubleSide: the open cone is seen from inside too
  cone.rotation.x = -Math.PI / 2; // its wide end along the group's +z, at the drawer
  const bulb = new Mesh(new CylinderGeometry(0.04, 0.04, 0.02, 8), new MeshLambertMaterial({ color: '#fff4e0', emissive: accent }));
  bulb.rotation.x = -Math.PI / 2;
  bulb.position.z = 0.02;
  shade.add(cone, bulb);
  root.add(disc, rod(base, elbow), rod(elbow, head), shade);
  return { drawers, lift, bulb, lampAt: head.clone().lerp(aim, 0.06), lampAim: aim };
}

/**
 * Mounts the scene into `stage` (a sized, positioned element). Returns null when WebGL fails.
 * opts.phase: one of vibekit's PHASES. opts.onFrame(): called after the first frame is drawn.
 */
export function mountCatalogue(stage, opts) {
  let renderer;
  try {
    renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power', preserveDrawingBuffer: !!opts.still });
  } catch { return null; }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  stage.appendChild(canvas);

  const scene = new Scene();
  const [r, g, b] = accentRGB();
  const accent = new Color().setRGB(r, g, b);
  const parts = build(scene, accent);
  const P = PHASE[opts.phase] ?? PHASE.noon;

  const hemi = new HemisphereLight(P.sky, P.ground, P.hemi);
  const sun = new DirectionalLight(P.sun, P.i);
  const el = (P.el * Math.PI) / 180, az = (P.az * Math.PI) / 180;
  sun.position.set(Math.sin(az) * Math.cos(el) * 6, Math.sin(el) * 6 + 0.8, Math.cos(az) * Math.cos(el) * 6);
  sun.target.position.set(0, 0.8, 0);
  sun.castShadow = true;
  const small = matchMedia('(pointer: coarse)').matches || stage.clientWidth < 520;
  sun.shadow.mapSize.set(small ? 512 : 1024, small ? 512 : 1024);
  Object.assign(sun.shadow.camera, { left: -2.4, right: 2.4, top: 2.4, bottom: -1.2, near: 0.5, far: 14 });
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.02;
  scene.add(hemi, sun, sun.target);
  // The reading lamp: lit at night (half at dusk), tinted with the product accent.
  parts.bulb.material.emissiveIntensity = P.lamp * 1.4;
  if (P.lamp > 0) {
    const lamp = new SpotLight(new Color('#fff1dc').lerp(accent, 0.55), 14 * P.lamp, 5, 0.62, 0.75, 1.4);
    lamp.position.copy(parts.lampAt);
    lamp.target.position.copy(parts.lampAim);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(512, 512);
    lamp.shadow.bias = -0.001;
    scene.add(lamp, lamp.target);
  }

  const camera = new PerspectiveCamera(28, 1, 0.1, 40);
  const look = new Vector3(0, 1.0, 0.2);
  let progress = opts.still ? 0.6 : 0, yaw = 0, dirty = true, raf = 0, last = 0, firstDrawn = false;

  function size() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Keep the whole plinth in frame on a narrow stage.
    camera.userData.dist = Math.max(5.9, 5.9 * (1.24 / camera.aspect));
    camera.updateProjectionMatrix();
    request();
  }
  function place() {
    const base = -0.32 + yaw, d = camera.userData.dist ?? 5.9;
    camera.position.set(look.x + Math.sin(base) * d, look.y + d * 0.36, look.z + Math.cos(base) * d);
    camera.lookAt(look);
  }

  const ease = (t) => t * t * (3 - 2 * t);
  const clamp = (v) => Math.min(1, Math.max(0, v));
  function targets() {
    const open = drawerOpen(progress);
    parts.drawers.forEach((d, i) => { d.target = i === MAIN ? open * OUT : d.peek ? PEEK : 0; });
    return open;
  }

  function frame(now) {
    raf = 0;
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    last = now;
    const open = targets();
    let moving = false;
    const k = opts.still ? 1 : 1 - Math.exp(-dt * 9);
    for (const d of parts.drawers) {
      const diff = d.target - d.out;
      if (Math.abs(diff) > 1e-4) { d.out += diff * k; moving = true; } else d.out = d.target;
      d.g.position.z = d.z + d.out;
      d.body.visible = d.out > 0.002;
    }
    parts.lift.position.y = parts.lift.userData.y0 + ease(clamp((open - 0.55) / 0.45)) * 0.11;
    const yawTo = ((progress - 0.5) * 3 * Math.PI) / 180; // ±1.5°: 3° across the band
    if (Math.abs(yawTo - yaw) > 1e-5) { yaw += (yawTo - yaw) * k; moving = true; }
    place();
    renderer.render(scene, camera);
    if (!firstDrawn) { firstDrawn = true; opts.onFrame?.(); }
    if (moving || dirty) { dirty = false; raf = requestAnimationFrame(frame); } else last = 0;
  }
  function request() { dirty = true; if (!raf) raf = requestAnimationFrame(frame); }

  // Hover (mouse) or tap (touch) opens a drawer a little; the scroll drawer is left to scroll.
  const ray = new Raycaster(), ndc = new Vector2();
  const fronts = parts.drawers.map((d) => d.front);
  function hit(e) {
    const rc = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - rc.left) / rc.width) * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const i = ray.intersectObjects(fronts, false)[0]?.object.userData.drawer;
    return i === MAIN ? undefined : i;
  }
  function onMove(e) {
    if (e.pointerType !== 'mouse') return;
    const i = hit(e);
    let changed = false;
    parts.drawers.forEach((d, j) => { const p = j === i; if (d.peek !== p) { d.peek = p; changed = true; } });
    if (changed) request();
  }
  function onLeave() { parts.drawers.forEach((d) => (d.peek = false)); request(); }
  function onTap(e) {
    if (e.pointerType === 'mouse') return;
    const i = hit(e);
    if (i === undefined) return;
    parts.drawers.forEach((d, j) => (d.peek = j === i ? !d.peek : false));
    request();
  }
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('pointerdown', onTap);
  canvas.addEventListener('webglcontextlost', () => opts.onLost?.());

  const ro = new ResizeObserver(size);
  ro.observe(stage);
  size();
  place();

  return {
    canvas,
    setProgress(p) { if (Math.abs(p - progress) > 1e-4) { progress = p; request(); } },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      scene.traverse((o) => o.geometry?.dispose());
      renderer.dispose();
      canvas.remove();
    },
  };
}
