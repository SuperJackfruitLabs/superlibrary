# Catalogue scenes: one canvas for the whole page

Small low-poly three.js scenes beside the landing's copy: the cabinet in the band under the hero, and one per "How it works" step (intake tray, checking gate, search row), shown as a scroll sequence. They all stand in the same room under the visitor's sun phase. This folder is meant to be copied to the other landings: keep the files below and replace the scene modules.

## Files

| File | Loaded | Job |
| --- | --- | --- |
| `common.js` | with the page | Sun phase (vibekit `phaseAt()`, or noon when `data-time="off"`), the accent as linear RGB, band scroll progress. |
| `band.js` | with the page | The loader: picks each stage's still, decides when to start, wires scroll progress and hover. About 5 KB gzipped. |
| `stage.js` | lazily, with three | The shared stage: one renderer and one canvas for every scene, plus the still renderer for tooling. |
| `room.js` | lazily | What every scene shares: materials, outcome colours, the plinth, the camera's view, the sun-phase light, a scroll-scrubbed timeline. |
| `cabinet.js`, `intake.js`, `gate.js`, `search.js` | lazily | One scene each. |

The page marks each stage `<figure data-scene="<name>" aria-hidden="true">` and gives it an `<img data-still>` (plus a `<noscript>` noon still). `stage.js` maps names to scene factories in `SCENES`. Only stages the current layout shows take part: a stage under `display: none` is skipped, and crossing the breakpoint restarts the stage with the new set.

## The steps as a scroll sequence

"How it works" never runs its three scenes side by side, and none of them runs on a clock: every scene is scrubbed by scroll, like the cabinet.

- **Desktop (900px and up).** The steps (`ol.steps > li`) stack in one column, each at least 64vh tall, so only one is in focus. A pinned panel (`.how-panel`, `position: sticky`) on the other side holds one stage per scene (`.panel-stage`), stacked. It never moves or resizes.
- **Scroll position.** `band.js` reads where the viewport's centre line is in the steps as one number `u`, from 0 (the top of step 01) to 3 (the bottom of step 03), on native scroll only. Each scene scrubs over the middle 70% of its own step. Scrolling back reverses everything.
- **The hand-off is scrolled too.** Over the last 15% of one step and the first 15% of the next:
  - the outgoing scene, holding its end state, fades out;
  - the incoming one, holding its start state, fades in with a 2° camera turn that lands on zero;
  - each step's text dims to half or undims (`--focus`) with the same weight.
  Only opacity and that turn change, so only the incoming scene draws. Nothing runs on a timer.
- **One room.** Every step scene is built on `room.js`'s `stepRoom()` (the same plinth, camera and light) and `stepView()` (scrub plus camera offset), so the hand-off reads as one room changing, with nothing in the frame jumping.
- **Fast scrolling.** A scene that is faded out yields the canvas at once to a visible one that is waiting (`snap()`, when `entry.hidden`). A visible scene always eases with the damped follow, so it never snaps.
- **Phone.** Each step keeps its own `.step-stage` above its text, and scrubs with that step's progress through the viewport.
- **Reduced motion and no WebGL.** Same layout, showing the per-scene stills (each scene's end state). Under reduced motion the hand-off weights are 0 or 1: the stills swap at the step boundary instead of fading. Nothing moves.
- **Accessibility.** The step text is the content, in reading order. The panel is `aria-hidden` and comes after the list in the markup.

## The shared-canvas pattern

There is one `WebGLRenderer`, so one WebGL context on the page and one canvas. It does not cover the viewport. It **moves into the stage that owns it**:

1. A scene asks for frames with `stage.request(entry)`. Requests queue in order. Only the owner draws.
2. The owner gets the canvas appended to its stage, sized to it, and draws until its `frame(dt)` returns false.
3. Once settled, it leaves a **2D snapshot** of its last frame in its stage (`canvas.catalogue-rest`, drawn in the same task as the render, so no `preserveDrawingBuffer` is needed). Then the canvas leaves, and the next stage in the queue takes it.

So only one thing on the page moves at a time, a stage at rest costs nothing (no draws, no loop), and the canvas scrolls natively with its stage: no fixed overlay redrawing on scroll. A stage shows its still until its first snapshot exists. `.rested` and `.live` hide what is underneath.

## A scene module

`create<Name>({ phase, accent, still })` returns a view:

- `scene`, `camera`, `resize(aspect)`.
- `frame(dt)`: pose one step and place the camera. Return true while anything is still moving.
- `finish()`: jump to the settled end state. The stills use it.
- `setProgress(p)`: set where scroll says the scene should be (0..1), and return true if that changed. For the steps, build it on `room.js`'s `scrub(dur, apply)`, which poses the scene with `apply(t)` and follows the target with a short critically damped ease, so a trackpad does not jitter. There are no timers and no autoplay.
- The cabinet eases its drawers toward its own progress, and also takes hover peeks.

Use `room.js` for the plinth, `roomCamera()` and `light()`, so every scene shares the room and the sun.

## Rules (all scenes, every landing)

- **The hero stays as it is.** One hero for all six landing pages (operator decision 2026-10-21). Scenes go in the bands below it.
- **Copy and labels are HTML.** The canvas and snapshots are `aria-hidden` decoration. No text exists only in a scene.
- **Load late.** three loads once, lazily: after the page's `load` event and once a stage is within 300px of the viewport. First paint and LCP stay the same.
- **One thing moves at a time.**
  - Each scene follows its own scroll progress, and only one scene is visible in the panel.
  - The stage draws only while a progress is changing, and makes 0 draw calls at rest.
  - Scroll scenes follow native scroll only: no Lenis, GSAP or scroll-jacking.
  - Anything HTML that moves with a scene follows what the scene actually drew (the cabinet's card reads `view.open`), not the scroll position.
- **Calm.**
  - No post-processing.
  - No auto-orbit: the camera moves at most about 3°.
  - Render on demand and stop when idle.
  - DPR capped at 1.5.
- **Fallbacks are stills.** Each scene has one WebP per sun phase in `public/catalogue/<scene>-<phase>.webp`, showing its end state. They are shown under `prefers-reduced-motion`, vibekit `data-motion="reduce"`, no WebGL, or a lost context. `scripts/render-stills.mjs` renders them from the live scenes through `?catalogue-still`.
- **Budget.** Under 250 KB gzipped of JS for all scenes together, and under 400 KB of assets. SuperLibrary measures:
  - JS: 4.9 KB loader + 0.9 KB preload helper + 135 KB lazy stage chunk with three, about 141 KB in all.
  - Assets: 24 stills in 276 KB, of which a visit fetches about 4.
- **Standalone.** No suite dependency at runtime beyond the vibekit package the landing already ships.
- **Flat, procedural, low-poly.** Boxes and low-segment cylinders in flat colours, built in code. No downloaded or generated models.

## Checking

- Run `npm run check`.
- Run frontdoor's `scripts/review/review.mjs` against the dev server with `--stops 0,#catalogue,0.6`, and again with `--time` set to golden hour and to morning.
- Look at the sheets: every vibe and both themes.
- Re-check reduced motion and no WebGL, for example by launching Chrome with `--disable-webgl`.
