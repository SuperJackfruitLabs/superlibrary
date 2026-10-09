import { defineConfig } from 'vite';

// One bundle for every host (spec §9, Embedding), served from the content origin itself so CSP 'self'
// covers it. The viewer itself uses no inline script, although the CSP allows it for artifacts (plan D3).
export default defineConfig({
  base: '/_viewer/',
  build: {
    outDir: 'viewer-dist/_viewer',
    emptyOutDir: true,
    cssCodeSplit: false,
    // Mermaid's layout engines, viz.js (asm.js) and pdf.js are large, but lazy: fetched only when their kind renders.
    chunkSizeWarningLimit: 2000,
    modulePreload: { polyfill: false },
    rollupOptions: {
      // Two entries: the viewer, and the expired page's script (content Worker, `expiredPage`).
      input: { viewer: 'viewer/main.ts', expired: 'viewer/expired.ts' },
      output: { entryFileNames: '[name].js', chunkFileNames: 'chunks/[name]-[hash].js', assetFileNames: 'viewer.[ext]' },
    },
  },
});
