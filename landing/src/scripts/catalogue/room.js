// The card-catalogue room every scene stands in: flat-shaded materials, the stone plinth, the
// camera's fixed three-quarter view, and the light for the visitor's sun phase. Each scene module
// (cabinet, intake, gate, search) builds its object on this, so the band and the steps read as one
// room under one sun.
import {
  BoxGeometry, Color, DirectionalLight, HemisphereLight, Mesh, MeshLambertMaterial, PerspectiveCamera, SpotLight, Vector3,
} from 'three';

// Sun direction (degrees: elevation, azimuth from the front, + to the right), colour and sky per
// phase. `lamp` is how strongly the room's reading lamp burns: at night, half at dusk.
export const PHASE = {
  dawn: { el: 14, az: -58, sun: '#ffc8ae', i: 1.7, sky: '#d4d6f2', ground: '#7d6a60', hemi: 1.0, lamp: 0 },
  morning: { el: 58, az: -34, sun: '#e9f1ff', i: 2.3, sky: '#d2e3ff', ground: '#8a8274', hemi: 1.15, lamp: 0 },
  noon: { el: 70, az: 18, sun: '#fff7ec', i: 2.4, sky: '#ebeef4', ground: '#8f8578', hemi: 1.15, lamp: 0 },
  golden: { el: 11, az: 62, sun: '#ffaa55', i: 2.6, sky: '#ffd8b4', ground: '#6b5240', hemi: 0.75, lamp: 0 },
  dusk: { el: 5, az: 70, sun: '#ff9478', i: 1.0, sky: '#8c80b4', ground: '#3d3242', hemi: 0.75, lamp: 0.45 },
  night: { el: 48, az: -30, sun: '#8ea2d8', i: 0.35, sky: '#3a4266', ground: '#1a1720', hemi: 0.9, lamp: 1 },
};

export const mat = (c) => new MeshLambertMaterial({ color: c, flatShading: true });
export const M = {
  stone: mat('#d6cdc1'), stoneTop: mat('#e4ddd3'), wood: mat('#8a5a3b'), woodDark: mat('#6b4129'),
  front: mat('#a36e47'), brass: mat('#c9a25a'), card: mat('#f4eee2'), inside: mat('#5c3a26'), ink: mat('#9c9184'),
};

// The seven outcomes' tab colours: greens for approved and completed, amber in progress, reds for
// rejected and failed, greys for superseded and abandoned. The words stay in the page's HTML.
export const OUTCOME = {
  approved: mat('#2f9e6a'), completed: mat('#79c296'), 'in-progress': mat('#e0a43a'), superseded: mat('#8b95a8'),
  rejected: mat('#d0574f'), failed: mat('#9e3434'), abandoned: mat('#b5aa9f'),
};

export function box(w, h, d, m, x = 0, y = 0, z = 0, parent) {
  const b = new Mesh(new BoxGeometry(w, h, d), m);
  b.position.set(x, y, z);
  b.castShadow = b.receiveShadow = true;
  parent?.add(b);
  return b;
}

/** Two flat stone steps, centred at (0, z). The top surface is at y = 0.31. */
export function plinth(parent, w, d, z = 0) {
  box(w, 0.25, d, M.stone, 0, 0.125, z, parent);
  box(w - 0.35, 0.06, d - 0.3, M.stoneTop, 0, 0.28, z, parent);
}
export const FLOOR = 0.31;

/**
 * The room's camera: the same three-quarter view for every scene, looking at `look` from `dist`.
 * On a stage narrower than `aspect` it backs off so the plinth stays in frame. `yaw` (radians) is
 * the only movement any scene may give it, and the cabinet keeps that within 3°.
 */
export function roomCamera(look, dist, aspect) {
  const camera = new PerspectiveCamera(28, aspect, 0.1, 40);
  let d = dist;
  return {
    camera,
    resize(a) { camera.aspect = a; d = Math.max(dist, dist * (aspect / a)); camera.updateProjectionMatrix(); },
    place(yaw = 0) {
      const b = -0.32 + yaw;
      camera.position.set(look.x + Math.sin(b) * d, look.y + d * 0.36, look.z + Math.cos(b) * d);
      camera.lookAt(look);
    },
  };
}

/**
 * Lights a scene for `phase`: sky fill, the sun with a shadow sized to `reach`, and at dusk and
 * night a reading lamp tinted with the accent, from `from` (default: above front) at `at` (default:
 * `aim`), at `power` candela.
 */
export function light(scene, phase, accent, { reach = 2.4, aim = new Vector3(0, 0.6, 0), from, at, power = 14 } = {}) {
  const P = PHASE[phase] ?? PHASE.noon;
  const sun = new DirectionalLight(P.sun, P.i);
  const el = (P.el * Math.PI) / 180, az = (P.az * Math.PI) / 180;
  sun.position.set(Math.sin(az) * Math.cos(el) * 6, Math.sin(el) * 6 + 0.8, Math.cos(az) * Math.cos(el) * 6);
  sun.target.position.copy(aim);
  sun.castShadow = true;
  const small = matchMedia('(pointer: coarse)').matches;
  sun.shadow.mapSize.set(small ? 512 : 1024, small ? 512 : 1024);
  Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach / 2, near: 0.5, far: 14 });
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.02;
  scene.add(new HemisphereLight(P.sky, P.ground, P.hemi), sun, sun.target);
  if (P.lamp > 0) {
    const lamp = new SpotLight(new Color('#fff1dc').lerp(accent, 0.55), power * P.lamp, 5, 0.62, 0.75, 1.4);
    lamp.position.copy(from ?? aim.clone().add(new Vector3(0.3, 1.5, 1.1)));
    lamp.target.position.copy(at ?? aim);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(512, 512);
    lamp.shadow.bias = -0.001;
    scene.add(lamp, lamp.target);
  }
  return P;
}

export const ease = (t) => t * t * (3 - 2 * t);
export const easeOut = (t) => 1 - (1 - t) ** 3;
export const clamp = (v) => Math.min(1, Math.max(0, v));
/** Progress 0..1 of a segment that starts at `a` seconds and lasts `len`, at time `t`. */
export const seg = (t, a, len) => clamp((t - a) / len);

/**
 * A one-shot timeline for a scene that plays once: `start` state until play(), then `dur` seconds,
 * then rest. `apply(t)` poses the scene at time t. finish() jumps to the end (the stills use it).
 */
export function timeline(dur, apply) {
  let t = 0, playing = false;
  apply(0);
  return {
    get done() { return t >= dur; },
    play() { if (t < dur) playing = true; },
    finish() { t = dur; playing = false; apply(dur); },
    frame(dt) {
      if (!playing) return false;
      t = Math.min(dur, t + dt);
      apply(t);
      if (t >= dur) playing = false;
      return playing;
    },
  };
}
