// "What it's like to use": an agent about to write a pricing page stops at the catalogue first.
// Scrolling through the section: a small agent pod comes to the cabinet; a typed query slip
// spells out the subject (text only: library_search); the drawer holding the approved final copy
// slides out and the agent takes that card; two linked cards come up with it on thin threads
// (library_related): the completed work card, and the rejected draft, lower. The tools are
// read-only, so the agent writes nothing into the cabinet and nothing is filed or changed.
import { BoxGeometry, CylinderGeometry, Group, IcosahedronGeometry, Mesh, Scene, Vector3 } from 'three';
import { FLOOR, M, OUTCOME, box, ease, mat, scrub, seg, stepRoom, stepView } from './room.js';

const COLS = 3, ROWS = 2, CW = 0.3, CH = 0.2, T = 0.03, D = 0.5;
const W = COLS * CW + (COLS + 1) * T, H = ROWS * CH + (ROWS + 1) * T;
const CX = -0.5, CZ = -0.25, BASE = FLOOR + 0.06; // the cabinet's centre and floor
const OPEN = 1, OUT = 0.32; // the drawer with the approved copy (top row, middle) and how far it comes out
const POD_FROM = new Vector3(1.05, 0, 0.42), POD_AT = new Vector3(0.32, 0, 0.38);

function pod(parent, accent) {
  const g = new Group();
  const body = new Mesh(new CylinderGeometry(0.11, 0.13, 0.24, 8), M.card);
  body.position.y = FLOOR + 0.14;
  const ring = new Mesh(new CylinderGeometry(0.135, 0.135, 0.03, 8), mat(accent));
  ring.position.y = FLOOR + 0.07;
  const head = new Mesh(new IcosahedronGeometry(0.1, 0), M.card);
  head.position.y = FLOOR + 0.36;
  const visor = box(0.11, 0.035, 0.03, M.inside, 0, FLOOR + 0.37, 0.085);
  for (const m of [body, ring, head]) { m.castShadow = m.receiveShadow = true; g.add(m); }
  g.add(visor);
  g.rotation.y = -0.75; // facing the cabinet and, a little, the room
  parent.add(g);
  return g;
}

const card = (parent, outcome) => {
  const c = box(0.22, 0.14, 0.008, M.card, 0, 0, 0, parent);
  box(0.07, 0.03, 0.009, OUTCOME[outcome], -0.05, 0.085, 0, c);
  box(0.13, 0.01, 0.009, M.ink, -0.01, 0.02, 0.001, c);
  return c;
};

export function createConsult({ phase, accent }) {
  const scene = new Scene();
  const { root, view } = stepRoom(scene, phase, accent);
  // A small catalogue cabinet at the back: a solid carcass, drawer fronts that slide out of it.
  box(W + 0.03, 0.06, D + 0.03, M.woodDark, CX, FLOOR + 0.03, CZ, root);
  box(W, H, D, M.wood, CX, BASE + H / 2, CZ, root);
  box(W + 0.04, 0.03, D + 0.04, M.woodDark, CX, BASE + H + 0.015, CZ, root);
  const drawers = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const g = new Group();
    g.position.set(CX - W / 2 + T + CW / 2 + c * (CW + T), BASE + H - T - CH / 2 - r * (CH + T), CZ + D / 2);
    box(CW - 0.01, CH - 0.01, 0.02, M.front, 0, 0, 0.01, g);
    box(0.08, 0.02, 0.02, M.brass, 0, -0.04, 0.025, g);
    box(0.11, 0.045, 0.006, M.brass, 0, 0.035, 0.022, g);
    box(CW - 0.04, CH - 0.06, D - 0.06, M.inside, 0, -0.01, -D / 2 + 0.02, g); // the body, inside the carcass when shut
    root.add(g);
    drawers.push(g);
  }
  const drawer = drawers[OPEN], z0 = drawer.position.z;
  // The query slip in front of the cabinet: a typed line, word by word, and a caret.
  const slip = box(0.6, 0.014, 0.14, M.card, CX + 0.05, FLOOR + 0.007, 0.5, root);
  const words = [[0.13, -0.19], [0.1, -0.06], [0.14, 0.07]].map(([w, x]) => {
    const b = box(w, 0.006, 0.026, M.ink, x, 0.01, 0, slip);
    b.userData.x = x - w / 2;
    return b;
  });
  const caret = box(0.008, 0.006, 0.05, M.brass, 0, 0.01, 0, slip);

  const agent = pod(root, accent);
  // The three cards: the approved final copy, and the two library_related brings with it.
  const approved = card(root, 'approved'), completed = card(root, 'completed'), rejected = card(root, 'rejected');
  const thread = () => { const m = new Mesh(new BoxGeometry(0.006, 0.006, 1), M.ink); root.add(m); return m; };
  const threads = [thread(), thread()];
  const link = (m, a, b) => { m.position.lerpVectors(a.position, b.position, 0.5); m.lookAt(b.position); m.scale.z = Math.max(0.001, a.position.distanceTo(b.position)); };

  const v = new Vector3(), held = new Vector3(), inDrawer = new Vector3(), toCompleted = new Vector3(), toRejected = new Vector3();
  const tl = scrub(1, (t) => {
    const a = ease(seg(t, 0, 0.22));
    agent.position.lerpVectors(POD_FROM, POD_AT, a);
    agent.position.y = Math.sin(a * Math.PI) * 0.02; // a pod glides, with a small rise as it comes
    words.forEach((w, k) => { const s = seg(t, 0.2 + k * 0.06, 0.06); w.scale.x = Math.max(0.001, s); w.position.x = w.userData.x + (w.geometry.parameters.width * s) / 2; });
    const typed = seg(t, 0.2, 0.18);
    caret.position.x = -0.26 + typed * 0.48;
    drawer.position.z = z0 + ease(seg(t, 0.36, 0.16)) * OUT;
    // Cards stand in the open drawer, then move to the agent: approved in front, held up; completed
    // beside it; rejected lower, still in view.
    inDrawer.set(drawer.position.x, drawer.position.y + 0.06, drawer.position.z - 0.12);
    held.set(POD_AT.x - 0.2, FLOOR + 0.46, POD_AT.z + 0.1);
    const go = (c, s, to, lift, back) => {
      c.visible = t > 0.36;
      c.position.lerpVectors(v.copy(inDrawer).setZ(inDrawer.z - back), to, ease(s));
      c.position.y += Math.sin(s * Math.PI) * lift;
      c.rotation.y = -0.35 * ease(s);
    };
    go(approved, seg(t, 0.52, 0.2), held, 0.12, 0);
    go(completed, seg(t, 0.66, 0.2), toCompleted.set(held.x - 0.3, FLOOR + 0.36, held.z - 0.02), 0.08, 0.05);
    go(rejected, seg(t, 0.74, 0.2), toRejected.set(held.x - 0.56, FLOOR + 0.2, held.z - 0.04), 0.06, 0.1);
    const linked = t > 0.66;
    threads.forEach((m) => (m.visible = linked));
    if (linked) { link(threads[0], approved, completed); link(threads[1], completed, rejected); }
  });
  return stepView(scene, view, tl);
}
