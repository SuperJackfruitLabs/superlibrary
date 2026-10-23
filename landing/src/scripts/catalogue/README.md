# Catalogue scenes: one canvas for the whole page

Small low-poly three.js scenes beside the landing's copy: the cabinet in the band under the hero, and one per "How it works" step (intake tray, checking gate, search row). They all stand in the same room under the visitor's sun phase. This folder is meant to be copied to the other landings: keep the files below and replace the scene modules.

## Files

| File | Loaded | Job |
| --- | --- | --- |
| `common.js` | with the page | Sun phase (vibekit `phaseAt()`, or noon when `data-time="off"`), the accent as linear RGB, band scroll progress. |
| `band.js` | with the page | The loader: picks each stage's still, decides when to start, wires scroll, hover and plays. About 4 KB gzipped. |
| `stage.js` | lazily, with three | The shared stage: one renderer and one canvas for every scene, plus the still renderer for tooling. |
| `room.js` | lazily | What every scene shares: materials, outcome colours, the plinth, the camera's view, the sun-phase light, a one-shot timeline. |
| `cabinet.js`, `intake.js`, `gate.js`, `search.js` | lazily | One scene each. |

The page marks each stage `<figure data-scene="<name>" aria-hidden="true">` and gives it an `<img data-still>` (plus a `<noscript>` noon still). `stage.js` maps names to scene factories in `SCENES`.

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
- A scene that plays once adds `play()`. Build it on `room.js`'s `timeline(dur, apply)`: the start state until `play()`, then `dur` seconds, then rest.
- A scroll-driven scene (the cabinet) takes `setProgress(p)` and eases toward it.

Use `room.js` for the plinth, `roomCamera()` and `light()`, so every scene shares the room and the sun.

## Rules (all scenes, every landing)

- **The hero stays as it is.** One hero for all six landing pages (operator decision 2026-10-21). Scenes go in the bands below it.
- **Copy and labels are HTML.** The canvas and snapshots are `aria-hidden` decoration. No text exists only in a scene.
- **Load late.** three loads once, lazily: after the page's `load` event and once a stage is within 300px of the viewport. First paint and LCP stay the same.
- **One thing moves at a time.**
  - Plays start when their stage is 60% in view, in page order, each once.
  - Scroll scenes follow native scroll only: no Lenis, GSAP or scroll-jacking.
  - Anything HTML that moves with a scene follows what the scene actually drew (the cabinet's card reads `view.open`), not the scroll position.
- **Calm.**
  - No post-processing.
  - No auto-orbit: the camera moves at most about 3°.
  - Render on demand and stop when idle.
  - DPR capped at 1.5.
- **Fallbacks are stills.** Each scene has one WebP per sun phase in `public/catalogue/<scene>-<phase>.webp`, showing its end state. They are shown under `prefers-reduced-motion`, vibekit `data-motion="reduce"`, no WebGL, or a lost context. `scripts/render-stills.mjs` renders them from the live scenes through `?catalogue-still`.
- **Budget.** Under 250 KB gzipped of JS for all scenes together, and under 400 KB of assets. SuperLibrary measures:
  - JS: 4.5 KB loader + 0.9 KB preload helper + 135 KB lazy stage chunk with three.
  - Assets: 24 stills in 210 KB, of which a visit fetches 4.
- **Standalone.** No suite dependency at runtime beyond the vibekit package the landing already ships.
- **Flat, procedural, low-poly.** Boxes and low-segment cylinders in flat colours, built in code. No downloaded or generated models.

## Checking

- Run `npm run check`.
- Run frontdoor's `scripts/review/review.mjs` against the dev server with `--stops 0,#catalogue,0.6`, and again with `--time` set to golden hour and to morning.
- Look at the sheets: every vibe and both themes.
- Re-check reduced motion and no WebGL, for example by launching Chrome with `--disable-webgl`.
