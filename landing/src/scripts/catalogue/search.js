// "Search ranks by outcome": a row of five catalogue drawers on the room's plinth, each labelled
// with an outcome colour, behind a typed query slip (text only: no picture). When the step comes
// into view the row reorders: approved swaps to the front of the row, and approved and completed
// rise on their pedestals; rejected and failed stay low but in the row, still visible.
import { Group, Scene, Vector3 } from 'three';
import { FLOOR, M, OUTCOME, box, ease, light, plinth, roomCamera, seg, timeline } from './room.js';

const START = ['rejected', 'completed', 'superseded', 'approved', 'failed'];
const RANKED = ['approved', 'completed', 'superseded', 'rejected', 'failed'];
const RISE = { approved: 0.15, completed: 0.15 }; // pedestal height when ranked; the rest stay low
const STEP = 0.42, LANE = 0.36, LOW = 0.04;
const slotX = (i) => (i - 2) * STEP;

function drawer(parent, outcome) {
  const g = new Group();
  box(0.34, 0.2, 0.36, M.woodDark, 0, 0.1, 0, g);
  box(0.32, 0.18, 0.02, M.front, 0, 0.1, 0.185, g);
  box(0.12, 0.045, 0.01, OUTCOME[outcome], 0, 0.14, 0.2, g);
  box(0.09, 0.02, 0.025, M.brass, 0, 0.06, 0.205, g);
  parent.add(g);
  return g;
}

export function createSearch({ phase, accent }) {
  const scene = new Scene();
  const root = new Group();
  scene.add(root);
  plinth(root, 2.45, 1.4, 0.1);
  // One pedestal per place in the row; the first two grow as the ranking settles.
  const pedestals = START.map((_, i) => box(0.38, 1, 0.4, M.wood, slotX(i), 0, 0, root));
  const drawers = Object.fromEntries(START.map((o) => [o, drawer(root, o)]));
  // The query slip: a typed line of text in front of the row.
  const slip = box(0.62, 0.016, 0.15, M.card, -0.2, FLOOR + 0.008, 0.62, root);
  for (const [w, x] of [[0.12, -0.2], [0.18, -0.03], [0.08, 0.12]]) box(w, 0.006, 0.026, M.ink, x, 0.011, 0, slip);
  box(0.008, 0.006, 0.05, M.brass, 0.19, 0.011, 0, slip); // the caret after the last word

  light(scene, phase, accent, { reach: 1.6, aim: new Vector3(0, 0.5, 0), power: 7 });
  const view = roomCamera(new Vector3(0, 0.5, 0.1), 4.0, 1.6);
  const pedestal = (i, h) => { pedestals[i].scale.y = h; pedestals[i].position.y = FLOOR + h / 2; };

  const tl = timeline(2.2, (t) => {
    // The swap: approved comes forward and slides left along the front lane, rejected steps back
    // and slides right along the back lane, so they never pass through each other.
    for (const o of START) {
      const from = START.indexOf(o), to = RANKED.indexOf(o), g = drawers[o];
      const lane = to < from ? LANE : to > from ? -LANE : 0;
      const z = ease(seg(t, 0, 0.3)) * lane * (1 - ease(seg(t, 1.0, 0.3)));
      const x = slotX(from) + ease(seg(t, 0.3, 0.7)) * (slotX(to) - slotX(from));
      g.position.set(x, 0, z);
    }
    // Then the ranking: the first two places rise and step forward a little.
    const r = ease(seg(t, 1.4, 0.8));
    RANKED.forEach((o, i) => {
      const h = LOW + (RISE[o] ?? 0) * r;
      pedestal(i, h);
      const g = drawers[o];
      g.position.y = FLOOR + h;
      if (RISE[o]) g.position.z += 0.1 * r;
    });
  });
  return {
    scene, camera: view.camera, resize: view.resize, play: tl.play, finish: tl.finish,
    frame(dt) { const m = tl.frame(dt); view.place(); return m; },
  };
}
