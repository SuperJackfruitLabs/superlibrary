// "Uploads are checked": a small, open checking gate over a track on the room's plinth. Cards slide
// through it; the last one carries a key-shaped mark, stops at the gate, and gets a flagged slip.
// It is a reader on a frame, not a door or a vault: the copy says pattern matching, not a guarantee.
import { CylinderGeometry, Group, Mesh, Scene, Vector3 } from 'three';
import { FLOOR, M, box, ease, light, mat, plinth, roomCamera, seg, timeline } from './room.js';

const CW = 0.34, CH = 0.24; // a card, standing on the track and travelling along x
const START = -0.88, STOP = -0.3; // the key card halts short of the gate at x = 0
const PASS = [{ to: 0.86, at: 0 }, { to: 0.48, at: 0.45 }];

// Cards wait at the start one behind another (z), and leave front first.
function card(parent, y, z, key) {
  const c = box(CW, CH, 0.012, M.card, START, y, z, parent);
  if (key) {
    // A key glyph on the card's face: ring, shaft and two teeth, in brass.
    const ring = new Mesh(new CylinderGeometry(0.032, 0.032, 0.008, 10), M.brass);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(-0.07, 0.01, 0.01);
    c.add(ring);
    box(0.1, 0.014, 0.008, M.brass, 0.01, 0.01, 0.01, c);
    box(0.014, 0.03, 0.008, M.brass, 0.045, -0.01, 0.01, c);
    box(0.014, 0.022, 0.008, M.brass, 0.02, -0.006, 0.01, c);
  } else {
    // Two ruled lines of writing, so the plain cards read as cards.
    box(0.22, 0.012, 0.008, M.ink, -0.02, 0.04, 0.01, c);
    box(0.16, 0.012, 0.008, M.ink, -0.05, 0.0, 0.01, c);
  }
  return c;
}

export function createGate({ phase, accent }) {
  const scene = new Scene();
  const root = new Group();
  scene.add(root);
  plinth(root, 2.45, 1.15);
  box(2.05, 0.02, 0.4, M.woodDark, 0, FLOOR + 0.01, 0, root); // the track
  // The gate: a low, deep reader frame the cards pass under (no door, nothing that locks), with
  // a reader strip along its inside and a small indicator on top that turns amber on a hold.
  const gh = 0.36, gd = 0.16, gw = 0.6;
  for (const z of [-gw / 2, gw / 2]) box(gd, gh, 0.07, M.wood, 0, FLOOR + gh / 2, z, root);
  box(gd + 0.02, 0.09, gw + 0.07, M.wood, 0, FLOOR + gh + 0.045, 0, root);
  box(gd - 0.04, 0.02, gw - 0.1, mat(accent), 0, FLOOR + gh - 0.01, 0, root).castShadow = false;
  const lampOk = mat('#2f9e6a'), lampHold = mat('#e0a43a');
  const indicator = box(0.08, 0.035, 0.08, lampOk, 0, FLOOR + gh + 0.11, 0, root);

  const y = FLOOR + 0.02 + CH / 2;
  const passing = PASS.map((_, i) => card(root, y, 0.11 - i * 0.11, false));
  const key = card(root, y, -0.11, true);
  // The flagged slip: tucked behind the key card, it rises above it with a small flag.
  const slip = new Group();
  slip.position.set(0.08, 0, -0.012);
  key.add(slip);
  box(0.1, 0.2, 0.006, mat('#f4d9a8'), 0, 0, 0, slip);
  box(0.05, 0.035, 0.007, mat('#d0574f'), 0.04, 0.085, 0.002, slip);

  light(scene, phase, accent, { reach: 1.6, aim: new Vector3(0, 0.5, 0), power: 7 });
  const view = roomCamera(new Vector3(0, 0.5, 0), 4.0, 1.6);
  const tl = timeline(2.9, (t) => {
    passing.forEach((c, i) => { const p = seg(t, PASS[i].at, 1.3); c.position.x = START + ease(p) * (PASS[i].to - START); });
    const k = seg(t, 0.95, 0.9);
    key.position.x = START + ease(k) * (STOP - START);
    const s = seg(t, 2.1, 0.5);
    slip.position.y = ease(s) * 0.17;
    slip.visible = s > 0;
    indicator.material = s > 0 ? lampHold : lampOk;
  });
  return {
    scene, camera: view.camera, resize: view.resize, play: tl.play, finish: tl.finish,
    frame(dt) { const m = tl.frame(dt); view.place(); return m; },
  };
}
