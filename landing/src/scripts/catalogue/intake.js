// "Work comes in, labelled": an intake tray on the room's plinth. Scrolling through the step drops
// seven index cards into it one after another, back to front, each with a coloured tab for one
// of the seven outcomes; scrolling back lifts them out again.
import { Scene } from 'three';
import { FLOOR, M, OUTCOME, box, easeOut, scrub, seg, stepRoom, stepView } from './room.js';

const ORDER = ['approved', 'completed', 'in-progress', 'superseded', 'rejected', 'failed', 'abandoned'];
const TW = 0.7, TD = 1.0, WALL = 0.04, TH = 0.16; // tray width (x), depth (z), wall, wall height
const CW = 0.6, CH = 0.36, GAP = 0.12, DROP = 0.95; // card size, spacing along the tray, fall height
const STAGGER = 0.3, FALL = 0.45;

export function createIntake({ phase, accent }) {
  const scene = new Scene();
  const { root, view } = stepRoom(scene, phase, accent);
  // The tray: a floor and four low walls, open at the top.
  const y0 = FLOOR + 0.02;
  box(TW, 0.04, TD, M.wood, 0, y0, 0, root);
  box(TW, TH, WALL, M.woodDark, 0, y0 + TH / 2, TD / 2 - WALL / 2, root);
  box(TW, TH, WALL, M.woodDark, 0, y0 + TH / 2, -TD / 2 + WALL / 2, root);
  box(WALL, TH, TD, M.woodDark, -TW / 2 + WALL / 2, y0 + TH / 2, 0, root);
  box(WALL, TH, TD, M.woodDark, TW / 2 - WALL / 2, y0 + TH / 2, 0, root);
  // Seven cards standing across the tray, tabs staggered left to right so every colour shows.
  const rest = y0 + 0.02 + CH / 2;
  const cards = ORDER.map((o, k) => {
    const c = box(CW, CH, 0.012, M.card, 0, rest, -TD / 2 + 0.16 + k * GAP);
    box(0.14, 0.07, 0.013, OUTCOME[o], -0.21 + (k % 4) * 0.14, CH / 2 + 0.03, 0, c);
    root.add(c);
    return c;
  });

  // Back to front, so a falling card never passes behind one already in.
  const tl = scrub(STAGGER * (ORDER.length - 1) + FALL, (t) => {
    cards.forEach((c, k) => {
      const p = seg(t, k * STAGGER, FALL);
      c.visible = p > 0;
      c.position.y = rest + (1 - easeOut(p)) * DROP;
    });
  });
  return stepView(scene, view, tl);
}
