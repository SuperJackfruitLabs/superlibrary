// The catalogue band's object: a low-poly card-catalogue cabinet on the room's plinth. Scroll
// through the band pulls one drawer out and lifts its index card; hovering or tapping another
// drawer opens it a little. The camera turns at most 3° across the whole band.
import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshLambertMaterial, Raycaster, Scene, Vector3 } from 'three';
import { drawerOpen } from './common.js';
import { M, box, clamp, ease, light, mat, plinth, roomCamera } from './room.js';

const COLS = 4, ROWS = 4, CW = 0.42, CH = 0.26, T = 0.04, DEPTH = 0.95;
const W = COLS * CW + (COLS + 1) * T, H = ROWS * CH + (ROWS + 1) * T;
const MAIN = 6; // row 1 (from the top), column 2: the drawer scroll pulls out
const OUT = 0.6, PEEK = 0.09;
const BASE_Y = 0.43; // the cabinet's floor: plinth (0.25 + 0.06) plus its base rail

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
  plinth(root, 2.8, 1.8, 0.15);
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

/** opts: { phase, accent (a three Color), still (draw the settled end state) }. */
export function createCabinet({ phase, accent, still }) {
  const scene = new Scene();
  const parts = build(scene, accent);
  // The room's lamp is this cabinet's own: it shines from the shade at the open drawer.
  const P = light(scene, phase, accent, { aim: new Vector3(0, 0.8, 0), from: parts.lampAt, at: parts.lampAim });
  parts.bulb.material.emissiveIntensity = P.lamp * 1.4;

  const view = roomCamera(new Vector3(0, 1.0, 0.2), 5.9, 1.24);
  let progress = still ? 0.6 : 0, yaw = 0;
  const ray = new Raycaster();
  const fronts = parts.drawers.map((d) => d.front);

  return {
    scene,
    camera: view.camera,
    /** How far the scroll drawer is out, 0..1: the HTML index card follows it. */
    get open() { return parts.drawers[MAIN].out / OUT; },
    resize: view.resize,
    setProgress(p) { const changed = Math.abs(p - progress) > 1e-4; progress = p; return changed; },
    /** ndc: a Vector2 in the stage; returns true when the peeked drawer changed. */
    peekAt(ndc, sticky) {
      ray.setFromCamera(ndc, view.camera);
      let i = ray.intersectObjects(fronts, false)[0]?.object.userData.drawer;
      if (i === MAIN) i = undefined;
      if (sticky && i === undefined) return false;
      let changed = false;
      parts.drawers.forEach((d, j) => { const p = j === i ? (sticky ? !d.peek : true) : false; if (d.peek !== p) { d.peek = p; changed = true; } });
      return changed;
    },
    unpeek() { let c = false; parts.drawers.forEach((d) => { if (d.peek) { d.peek = false; c = true; } }); return c; },
    /** Moves everything one step towards its target; true while anything is still moving. */
    frame(dt) {
      const open = drawerOpen(progress);
      parts.drawers.forEach((d, i) => { d.target = i === MAIN ? open * OUT : d.peek ? PEEK : 0; });
      let moving = false;
      const k = still ? 1 : 1 - Math.exp(-dt * 9);
      for (const d of parts.drawers) {
        const diff = d.target - d.out;
        if (Math.abs(diff) > 1e-4) { d.out += diff * k; moving = true; } else d.out = d.target;
        d.g.position.z = d.z + d.out;
        d.body.visible = d.out > 0.002;
      }
      parts.lift.position.y = parts.lift.userData.y0 + ease(clamp((parts.drawers[MAIN].out / OUT - 0.55) / 0.45)) * 0.11;
      const yawTo = ((progress - 0.5) * 3 * Math.PI) / 180; // ±1.5°: 3° across the band
      if (Math.abs(yawTo - yaw) > 1e-5) { yaw += (yawTo - yaw) * k; moving = true; } else yaw = yawTo;
      view.place(yaw);
      return moving;
    },
    finish() { this.frame(1); this.frame(1); },
  };
}
