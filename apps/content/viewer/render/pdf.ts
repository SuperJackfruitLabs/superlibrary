import type { ViewerData } from '@superlibrary/contract';
import { h, header } from '../dom';

const SCALE = 1.5;

function bytesOf(base64: string): Uint8Array {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * pdf.js on the main thread: an opaque-origin frame cannot start a Worker from its host (plan D5), and
 * `isEvalSupported: false` keeps PostScript functions interpreted (the CSP has no 'unsafe-eval').
 * Every page gets its size at once (so the frame reports its full height); a page is drawn when it
 * first comes into view, so a long PDF does not hold every page's canvas at once.
 */
export async function renderPdf(el: HTMLElement, d: ViewerData): Promise<void> {
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.mjs')]);
  (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = worker;
  const doc = await pdfjs.getDocument({ data: bytesOf(d.base64 ?? ''), isEvalSupported: false }).promise;
  const pages = h('div', { class: 'pdf' });
  el.replaceChildren(header(d), pages);

  const draw = new Map<Element, () => Promise<void>>();
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const viewport = page.getViewport({ scale: SCALE });
    const canvas = h('canvas', { 'aria-label': `Page ${n} of ${doc.numPages}`, role: 'img' });
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    pages.append(canvas);
    let started = false;
    draw.set(canvas, async () => {
      if (started) return;
      started = true;
      await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
    });
  }

  const first = pages.firstElementChild;
  if (first) await draw.get(first)!();
  if (typeof IntersectionObserver === 'undefined') {
    for (const f of draw.values()) await f();
    return;
  }
  // The implicit root is the top-level viewport, clipped by the host's frame, so this follows the host's scroll.
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      draw.get(e.target)!().catch(() => e.target.replaceWith(h('p', { class: 'note' }, `${e.target.getAttribute('aria-label')} could not be drawn.`)));
    }
  });
  for (const canvas of pages.children) if (canvas !== first) io.observe(canvas);
}
