import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ViewerData } from '@superlibrary/contract';

const rendered: number[] = [];
const getDocument = vi.fn((_opts: unknown) => ({
  promise: Promise.resolve({
    numPages: 3,
    getPage: async (n: number) => ({
      getViewport: ({ scale }: { scale: number }) => ({ width: 100 * scale, height: 200 * scale }),
      render: () => ({ promise: Promise.resolve().then(() => void rendered.push(n)) }),
    }),
  }),
}));
vi.mock('pdfjs-dist', () => ({ getDocument }));
vi.mock('pdfjs-dist/build/pdf.worker.mjs', () => ({ WorkerMessageHandler: 'in-thread' }));

let observed: ((entries: { target: Element; isIntersecting: boolean }[]) => void) | null = null;
class FakeIO { constructor(cb: typeof observed) { observed = cb; } observe() {} unobserve() {} }

const data = { view: 'pdf', path: 'a.pdf', name: 'a.pdf', mediaType: 'application/pdf', bytes: 3, sha256: 'a'.repeat(64), rawUrl: '', baseUrl: '', host: 'https://app.test', base64: btoa('%PD') } as ViewerData;

afterEach(() => { rendered.length = 0; vi.unstubAllGlobals(); });

describe('PDF (plan D5): pdf.js in the frame, on the main thread, no eval', () => {
  it('runs the worker in-thread with eval off, sizes every page, and draws only what comes into view', async () => {
    vi.stubGlobal('IntersectionObserver', FakeIO);
    HTMLCanvasElement.prototype.getContext = (() => ({})) as never;
    const { renderPdf } = await import('../render/pdf');
    const el = document.createElement('main');
    await renderPdf(el, data);
    expect((globalThis as { pdfjsWorker?: { WorkerMessageHandler?: string } }).pdfjsWorker?.WorkerMessageHandler).toBe('in-thread');
    const opts = getDocument.mock.calls[0]![0] as { data: Uint8Array; isEvalSupported: boolean };
    expect(opts.isEvalSupported).toBe(false);
    expect([...opts.data]).toEqual([0x25, 0x50, 0x44]);
    const canvases = [...el.querySelectorAll('canvas')];
    expect(canvases.map((c) => [c.width, c.height, c.getAttribute('aria-label')])).toEqual([[150, 300, 'Page 1 of 3'], [150, 300, 'Page 2 of 3'], [150, 300, 'Page 3 of 3']]);
    expect(rendered).toEqual([1]);
    observed!([{ target: canvases[2]!, isIntersecting: true }, { target: canvases[1]!, isIntersecting: false }]);
    await new Promise((r) => setTimeout(r, 0));
    expect(rendered).toEqual([1, 3]);
  });
});
