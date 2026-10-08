// Vite bundles CSS imports; TypeScript 6 checks side-effect imports (noUncheckedSideEffectImports).
declare module '*.css';

// viz.js 2.1.2 ships no types (plan D4: its asm.js build, not @viz-js/viz's WebAssembly).
declare module 'viz.js' {
  export default class Viz {
    constructor(opts: { Module: unknown; render: unknown });
    renderString(src: string, opts?: { format?: string; engine?: string }): Promise<string>;
  }
}
declare module 'viz.js/full.render.js' {
  export const Module: unknown;
  export const render: unknown;
}
// pdf.js's worker, run on the main thread (plan D5); only its namespace object is needed.
declare module 'pdfjs-dist/build/pdf.worker.mjs';
