# Catalogue scenes: one canvas for the whole page

Small low-poly three.js scenes beside the landing's copy: the cabinet in the band under the hero, and one per "How it works" step (intake tray, checking gate, search row), shown as a scroll sequence. They all stand in the same room under the visitor's sun phase. This folder is meant to be copied to the other landings: keep the files below and replace the scene modules.

## Files

| File | Loaded | Job |
| --- | --- | --- |
| `common.js` | with the page | Sun phase (vibekit `phaseAt()`, or noon when `data-time="off"`), the accent as linear RGB, band scroll progress. |
| `band.js` | with the page | The loader: picks each stage's still, decides when to start, wires scroll, hover and plays. About 4 KB gzipped. |
| `stage.js` | lazily, with three | The shared stage: one renderer and one canvas for every scene, plus the still renderer for tooling. |
| `room.js` | lazily | What every scene shares: materials, outcome colours, the plinth, the camera's view, the sun-phase light, a one-shot timeline. |
| `cabinet.js`, `intake.js`, `gate.js`, `search.js` | lazily | One scene each. |

The page marks each stage `<figure data-scene="<name>" aria-hidden="true">` and gives it an `<img data-still>` (plus a `<noscript>` noon still). `stage.js` maps names to scene factories in `SCENES`. Only stages the current layout shows take part: a stage under `display: none` is skipped, and crossing the breakpoint restarts the stage with the new set.

## The steps as a scroll sequence

"How it works" never plays its three scenes side by side.

- **Desktop (900px and up).** The steps (`ol.steps > li`) stack in one column, each at least 64vh tall, so only one is in focus. A pinned panel (`.how-panel`, `position: sticky`) on the other side holds one stage per scene (`.panel-stage`), stacked; only the active one is shown (`.on`), with a short cross-fade.
- **Active step.** A step becomes active (`.active`) as it crosses the viewport's centre line: an IntersectionObserver with `rootMargin: -50% 0px -50% 0px`. That is native scroll, with no scroll-jacking. Its scene plays in the panel, once, and the other steps' text dims to half.
  - A scene that leaves the panel mid-play jumps to its end (`finish()`), so the next one never waits for it.
- **Phone.** Each step keeps its own `.step-stage` above its text, and plays when that step is centred.
- **Reduced motion and no WebGL.** Same layout and the same active step, showing the per-scene stills. Nothing autoplays.
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
- A scene that plays once adds `play()`. Build it on `room.js`'s `timeline(dur, apply)`: the start state until `play()`, then `dur` seconds, then rest.
- A scroll-driven scene (the cabinet) takes `setProgress(p)` and eases toward it.

Use `room.js` for the plinth, `roomCamera()` and `light()`, so every scene shares the room and the sun.

## Rules (all scenes, every landing)

- **The hero stays as it is.** One hero for all six landing pages (operator decision 2026-10-21). Scenes go in the bands below it.
- **Copy and labels are HTML.** The canvas and snapshots are `aria-hidden` decoration. No text exists only in a scene.
- **Load late.** three loads once, lazily: after the page's `load` event and once a stage is within 300px of the viewport. First paint and LCP stay the same.
- **One thing moves at a time.**
  - Plays start when their step crosses the viewport's centre, each once. Only one scene is visible in the panel.
  - Scroll scenes follow native scroll only: no Lenis, GSAP or scroll-jacking.
  - Anything HTML that moves with a scene follows what the scene actually drew (the cabinet's card reads `view.open`), not the scroll position.
- **Calm.**
  - No post-processing.
  - No auto-orbit: the camera moves at most about 3°.
  - Render on demand and stop when idle.
  - DPR capped at 1.5.
- **Fallbacks are stills.** Each scene has one WebP per sun phase in `public/catalogue/<scene>-<phase>.webp`, showing its end state. They are shown under `prefers-reduced-motion`, vibekit `data-motion="reduce"`, no WebGL, or a lost context. `scripts/render-stills.mjs` renders them from the live scenes through `?catalogue-still`.
- **Budget.** Under 250 KB gzipped of JS for all scenes together, and under 400 KB of assets. SuperLibrary measures:
  - JS: 4.7 KB loader + 0.9 KB preload helper + 135 KB lazy stage chunk with three, about 141 KB in all.
  - Assets: 24 stills in 267 KB, of which a visit fetches about 4.
- **Standalone.** No suite dependency at runtime beyond the vibekit package the landing already ships.
- **Flat, procedural, low-poly.** Boxes and low-segment cylinders in flat colours, built in code. No downloaded or generated models.

## Checking

- Run `npm run check`.
- Run frontdoor's `scripts/review/review.mjs` against the dev server with `--stops 0,#catalogue,0.6`, and again with `--time` set to golden hour and to morning.
- Look at the sheets: every vibe and both themes.
- Re-check reduced motion and no WebGL, for example by launching Chrome with `--disable-webgl`.
